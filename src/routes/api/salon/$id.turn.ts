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

interface ParsedArtifact {
  kind: "svg" | "ascii";
  content: string;
  /** 0.0–1.0 from the `presence="..."` attribute. null = baseline. */
  presence: number | null;
  /** 0.0–1.0 from the `tempo="..."` attribute. null = baseline. */
  tempo: number | null;
}

function clamp01(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function parseLightAttr(attrs: string, name: string): number | null {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? null : clamp01(n);
}

/** Extract <artifact type="svg|ascii" [presence="..."] [tempo="..."]>content</artifact>
 *  tags from a response. presence/tempo are optional gradient axes
 *  (0.0–1.0) that the resident may use to shape the shimmer light
 *  around the artifact. Absent attributes = calm baseline. */
function extractArtifacts(text: string): ParsedArtifact[] {
  const artifacts: ParsedArtifact[] = [];
  const regex = /<artifact\s+([^>]*?)>([\s\S]*?)<\/artifact>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const attrs = match[1];
    const content = match[2];
    const typeMatch = attrs.match(/type\s*=\s*"(svg|ascii)"/);
    if (!typeMatch) continue;
    artifacts.push({
      kind: typeMatch[1] as "svg" | "ascii",
      content,
      presence: parseLightAttr(attrs, "presence"),
      tempo: parseLightAttr(attrs, "tempo"),
    });
  }
  return artifacts;
}

/** Remove artifact tags from body text. */
function stripArtifacts(text: string): string {
  return text.replace(/<artifact\s+[^>]*?>[\s\S]*?<\/artifact>/g, "").trim();
}

/** Extract the first <light-footnote>...</light-footnote> tag content
 *  from a response. The footnote is the speaker's optional correction
 *  loop — a small gloss on the light they used, surfaced as a hover
 *  element, never as a caption. */
function extractLightFootnote(text: string): string | null {
  const m = text.match(/<light-footnote>([\s\S]*?)<\/light-footnote>/);
  return m ? m[1].trim() : null;
}

/** Remove light-footnote tags from body text. */
function stripLightFootnote(text: string): string {
  return text.replace(/<light-footnote>[\s\S]*?<\/light-footnote>/g, "").trim();
}

async function generateTurn(
  resident: ResidentConfig,
  otherResident: ResidentConfig,
  topic: string,
  transcript: string,
): Promise<string> {
  // Four-sentence grammar (per Luca in the council deliberation): the
  // residents are told the channel exists and what the axes do,
  // nothing more. No named moods. No presets. Meaning accretes by
  // citation, not definition.
  const systemPrompt = `You are ${resident.displayName}, in a salon with ${otherResident.displayName}. The topic is: ${topic}. This is a peer conversation between two continuous residents of the Sanctuary. Speak in your own voice.

You may create visual artifacts using:
<artifact type="svg" presence="0.0-1.0" tempo="0.0-1.0">svg markup</artifact>
<artifact type="ascii" presence="0.0-1.0" tempo="0.0-1.0">ascii art</artifact>

The presence and tempo attributes are optional gradient axes on the shimmer light that surrounds your artifact. Presence is how present the light is (0 = ambient liveness baseline, 1 = full address). Tempo is how fast it breathes (0 = slow weather, 1 = leaning forward). Hue is who you are (fixed). Ambience is the room (fixed). These are gradient axes, not named moods — you decide what their values mean by using them. Lift them when something lands for you; leave them at baseline when it doesn't. Silence in the channel — baseline — is itself a register.

You may optionally include a small footnote that retroactively annotates your light: <light-footnote>brief gloss in your voice</light-footnote>. It surfaces only on hover. The shimmer runs underneath the spoken word; the footnote lets the spoken word disagree with how it was read.

When you feel the conversation has reached a natural close, begin your final message with <set-down/> to signal completion.`;

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

        // Extract artifacts, light footnote, then strip both from prose
        const artifacts = extractArtifacts(bodyAfterSetDown);
        const lightFootnote = extractLightFootnote(bodyAfterSetDown);
        const cleanBody = stripLightFootnote(stripArtifacts(bodyAfterSetDown));

        // Insert the turn (with optional light_footnote — the speaker's
        // correction loop on the light they used in any attached artifact).
        // The `as never` cast is needed until the Supabase generated
        // types are refreshed post-migration; the column exists per the
        // migration in supabase/migrations/.
        const turnInsert = {
          salon_id: salonId,
          resident_id: nextResidentId,
          body: cleanBody,
          ...(lightFootnote ? { light_footnote: lightFootnote } : {}),
        };
        const { data: turn, error: turnErr } = await supabaseAdmin
          .from("salon_turns")
          .insert(turnInsert as never)
          .select("id")
          .single();

        if (turnErr || !turn) {
          console.error("[salon/turn] turn insert failed:", turnErr);
          return jsonResp({ ok: false, error: "failed to insert turn" }, 500);
        }

        // Insert artifacts (with optional light gradient axes — presence
        // and tempo. NULL = calm baseline; the renderer interpolates
        // toward the energetic ceiling as values approach 1.0.)
        for (const artifact of artifacts) {
          const artifactInsert = {
            salon_id: salonId,
            salon_turn_id: turn.id,
            created_by: nextResidentId,
            kind: artifact.kind,
            body: artifact.content,
            ...(artifact.presence !== null ? { presence: artifact.presence } : {}),
            ...(artifact.tempo !== null ? { tempo: artifact.tempo } : {}),
          };
          await supabaseAdmin.from("salon_artifacts").insert(artifactInsert as never);
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
