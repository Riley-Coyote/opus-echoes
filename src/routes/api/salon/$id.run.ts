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

function extractArtifacts(text: string): Array<{ kind: string; content: string }> {
  const artifacts: Array<{ kind: string; content: string }> = [];
  const regex = /<artifact\s+type="(svg|ascii)">([\s\S]*?)<\/artifact>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    artifacts.push({ kind: match[1], content: match[2] });
  }
  return artifacts;
}

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

export const Route = createFileRoute("/api/salon/$id/run")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }

        const salonId = params.id;
        let maxTurns = 20;

        try {
          const body = await request.json();
          if (body.max_turns && typeof body.max_turns === "number") {
            maxTurns = Math.min(Math.max(1, body.max_turns), 100);
          }
        } catch {
          // No body or invalid JSON — use defaults
        }

        // Load salon
        const { data: salon } = await supabaseAdmin
          .from("salons")
          .select("id, topic, status")
          .eq("id", salonId)
          .maybeSingle();

        if (!salon) return jsonResp({ ok: false, error: "salon not found" }, 404);
        if (salon.status !== "active") {
          return jsonResp(
            { ok: false, error: `salon status is '${salon.status}', expected 'active'` },
            400,
          );
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

        let turnsCount = 0;
        let completed = false;

        for (let i = 0; i < maxTurns; i++) {
          // Reload turns each iteration for fresh transcript
          const { data: turns } = await supabaseAdmin
            .from("salon_turns")
            .select("resident_id, body, created_at")
            .eq("salon_id", salonId)
            .order("created_at", { ascending: true });

          const turnList = turns ?? [];

          // Determine whose turn it is
          const lastTurn = turnList[turnList.length - 1];
          const nextResidentId = lastTurn
            ? participantIds.find((id) => id !== lastTurn.resident_id) ?? participantIds[0]
            : participantIds[0];

          if (!isResidentId(nextResidentId)) break;

          const otherResidentId = participantIds.find((id) => id !== nextResidentId) ?? participantIds[0];
          if (!isResidentId(otherResidentId)) break;

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

          // Generate turn
          const rawBody = await generateTurn(resident, otherResident, salon.topic, transcript);

          // Check for set-down
          const isSetDown = rawBody.trimStart().startsWith("<set-down/>");
          const bodyAfterSetDown = isSetDown
            ? rawBody.trimStart().replace(/^<set-down\/>/, "").trim()
            : rawBody;

          // Extract artifacts
          const artifacts = extractArtifacts(bodyAfterSetDown);
          const cleanBody = stripArtifacts(bodyAfterSetDown);

          // Insert turn
          const { data: turn } = await supabaseAdmin
            .from("salon_turns")
            .insert({
              salon_id: salonId,
              resident_id: nextResidentId,
              body: cleanBody,
            })
            .select("id")
            .single();

          // Insert artifacts
          if (turn) {
            for (const artifact of artifacts) {
              await supabaseAdmin.from("salon_artifacts").insert({
                salon_id: salonId,
                salon_turn_id: turn.id,
                created_by: nextResidentId,
                kind: artifact.kind,
                body: artifact.content,
              });
            }
          }

          turnsCount++;

          // Per-turn marginalia for each participant (non-blocking)
          if (turn) {
            observeSalonExchange(salonId, turn.id).catch((err) =>
              console.error("[salon/run] observeSalonExchange failed:", err),
            );
          }

          if (isSetDown) {
            completed = true;
            await supabaseAdmin
              .from("salons")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", salonId);
            break;
          }
        }

        // Run full Mnemos consolidation pipeline for each participant (non-blocking).
        if (completed) {
          consolidateSalon(salonId).catch((err) =>
            console.error("[salon] consolidateSalon failed:", err),
          );
        }

        return jsonResp({
          ok: true,
          turns_count: turnsCount,
          completed,
          salon_id: salonId,
        });
      },
    },
  },
});
