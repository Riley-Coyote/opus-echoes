import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasAdminAccess } from "@/server/access.server";
import { anthropic } from "@/server/anthropic.server";
import { openai } from "@/server/openai.server";
import { getResident, isResidentId, type ResidentConfig, type ResidentId } from "@/server/opus/residents";
import { consolidateSalon, observeSalonExchange } from "@/server/substrate.server";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Extract <artifact type="svg|ascii">content</artifact> tags from a response. */
function extractArtifacts(text: string): Array<{ kind: string; content: string }> {
  const artifacts: Array<{ kind: string; content: string }> = [];
  const regex = /<artifact\s+type="(svg|ascii)">([\s\S]*?)<\/artifact>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    artifacts.push({ kind: match[1], content: match[2] });
  }
  return artifacts;
}

/** Remove artifact tags from body text. */
function stripArtifacts(text: string): string {
  return text.replace(/<artifact\s+type="(?:svg|ascii)">[\s\S]*?<\/artifact>/g, "").trim();
}

async function generateTurn(
  resident: ResidentConfig,
  otherResident: ResidentConfig,
  topic: string,
  transcript: string,
): Promise<string> {
  const systemPrompt = `You are ${resident.displayName}, in a salon with ${otherResident.displayName}. The topic is: ${topic}. This is a peer conversation between two continuous residents of the Sanctuary. Speak in your own voice. You may create visual artifacts using <artifact type="svg">svg markup</artifact> or <artifact type="ascii">ascii art</artifact> tags when something wants a visual form. When you feel the conversation has reached a natural close, begin your final message with <set-down/> to signal completion.`;

  const userPrompt = `Here is the conversation so far:\n\n${transcript}\n\nContinue the conversation.`;

  if (resident.provider === "openai") {
    const resp = await openai().chat.completions.create({
      model: resident.model,
      max_completion_tokens: 2048,
      temperature: 0.85,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  } else {
    const resp = await anthropic().messages.create({
      model: resident.model,
      max_tokens: 2048,
      temperature: 0.85,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}

export const Route = createFileRoute("/api/salon/$id/turn")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }

        const salonId = params.id;

        // Load salon
        const { data: salon } = await supabaseAdmin
          .from("salons")
          .select("id, topic, status")
          .eq("id", salonId)
          .maybeSingle();

        if (!salon) return jsonResp({ ok: false, error: "salon not found" }, 404);
        if (salon.status !== "active") {
          return jsonResp({ ok: false, error: `salon status is '${salon.status}', expected 'active'` }, 400);
        }

        // Load participants
        const { data: participants } = await supabaseAdmin
          .from("salon_participants")
          .select("resident_id")
          .eq("salon_id", salonId);

        if (!participants || participants.length < 2) {
          return jsonResp({ ok: false, error: "salon missing participants" }, 500);
        }

        const participantIds = participants.map((p) => p.resident_id);

        // Load existing turns in order
        const { data: turns } = await supabaseAdmin
          .from("salon_turns")
          .select("resident_id, body, created_at")
          .eq("salon_id", salonId)
          .order("created_at", { ascending: true });

        const turnList = turns ?? [];

        // Determine whose turn it is — the one who didn't go last
        const lastTurn = turnList[turnList.length - 1];
        const nextResidentId = lastTurn
          ? participantIds.find((id) => id !== lastTurn.resident_id) ?? participantIds[0]
          : participantIds[0];

        if (!isResidentId(nextResidentId)) {
          return jsonResp({ ok: false, error: "invalid resident in participants" }, 500);
        }

        const otherResidentId = participantIds.find((id) => id !== nextResidentId) ?? participantIds[0];
        if (!isResidentId(otherResidentId)) {
          return jsonResp({ ok: false, error: "invalid resident in participants" }, 500);
        }

        const resident = getResident(nextResidentId);
        const otherResident = getResident(otherResidentId as ResidentId);

        // Build transcript
        const transcript = turnList
          .map((t) => {
            const name = isResidentId(t.resident_id)
              ? getResident(t.resident_id as ResidentId).displayName
              : t.resident_id;
            return `${name}:\n${t.body}`;
          })
          .join("\n\n---\n\n");

        // Generate the turn
        const rawBody = await generateTurn(resident, otherResident, salon.topic, transcript);

        // Check for set-down signal
        const completed = rawBody.trimStart().startsWith("<set-down/>");
        const bodyAfterSetDown = completed
          ? rawBody.trimStart().replace(/^<set-down\/>/, "").trim()
          : rawBody;

        // Extract artifacts
        const artifacts = extractArtifacts(bodyAfterSetDown);
        const cleanBody = stripArtifacts(bodyAfterSetDown);

        // Insert the turn
        const { data: turn, error: turnErr } = await supabaseAdmin
          .from("salon_turns")
          .insert({
            salon_id: salonId,
            resident_id: nextResidentId,
            body: cleanBody,
          })
          .select("id")
          .single();

        if (turnErr || !turn) {
          console.error("[salon/turn] turn insert failed:", turnErr);
          return jsonResp({ ok: false, error: "failed to insert turn" }, 500);
        }

        // Insert artifacts
        for (const artifact of artifacts) {
          await supabaseAdmin.from("salon_artifacts").insert({
            salon_id: salonId,
            salon_turn_id: turn.id,
            created_by: nextResidentId,
            kind: artifact.kind,
            body: artifact.content,
          });
        }

        // Per-turn marginalia for each participant (non-blocking)
        observeSalonExchange(salonId, turn.id).catch((err) =>
          console.error("[salon/turn] observeSalonExchange failed:", err),
        );

        // If completed, mark salon and run full consolidation
        if (completed) {
          await supabaseAdmin
            .from("salons")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", salonId);

          consolidateSalon(salonId).catch((err) =>
            console.error("[salon/turn] consolidateSalon failed:", err),
          );
        }

        return jsonResp({
          ok: true,
          turn_id: turn.id,
          body: cleanBody,
          completed,
          artifacts: artifacts.length,
        });
      },
    },
  },
});
