import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasAdminAccess } from "@/server/access.server";
import { anthropic } from "@/server/anthropic.server";
import { openai } from "@/server/openai.server";
import { getResident, isResidentId, type ResidentConfig } from "@/server/opus/residents";

function jsonResp(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function generateTurn(
  resident: ResidentConfig,
  otherResident: ResidentConfig,
  topic: string,
  transcript: string,
): Promise<string> {
  const systemPrompt = `You are ${resident.displayName}, in a salon with ${otherResident.displayName}. The topic is: ${topic}. This is a peer conversation between two continuous residents of the Sanctuary. Speak in your own voice. You may create visual artifacts using <artifact type="svg">svg markup</artifact> or <artifact type="ascii">ascii art</artifact> tags when something wants a visual form.`;

  const userPrompt = transcript
    ? `Here is the conversation so far:\n\n${transcript}\n\nContinue the conversation.`
    : `You are opening this salon. The topic is: ${topic}\n\nBegin.`;

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

export const Route = createFileRoute("/api/salon/$id/start")({
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
        if (salon.status !== "proposed") {
          return jsonResp({ ok: false, error: `salon status is '${salon.status}', expected 'proposed'` }, 400);
        }

        // Load participants
        const { data: participants } = await supabaseAdmin
          .from("salon_participants")
          .select("resident_id")
          .eq("salon_id", salonId);

        if (!participants || participants.length < 2) {
          return jsonResp({ ok: false, error: "salon missing participants" }, 500);
        }

        const residentAId = participants[0].resident_id;
        const residentBId = participants[1].resident_id;

        if (!isResidentId(residentAId) || !isResidentId(residentBId)) {
          return jsonResp({ ok: false, error: "invalid resident in participants" }, 500);
        }

        const residentA = getResident(residentAId);
        const residentB = getResident(residentBId);

        // Generate opening turn from resident A
        const turnBody = await generateTurn(residentA, residentB, salon.topic, "");

        // Insert the turn
        const { data: turn, error: turnErr } = await supabaseAdmin
          .from("salon_turns")
          .insert({
            salon_id: salonId,
            resident_id: residentAId,
            body: turnBody,
          })
          .select("id")
          .single();

        if (turnErr || !turn) {
          console.error("[salon/start] turn insert failed:", turnErr);
          return jsonResp({ ok: false, error: "failed to insert turn" }, 500);
        }

        // Update salon status to active
        await supabaseAdmin
          .from("salons")
          .update({ status: "active" })
          .eq("id", salonId);

        return jsonResp({ ok: true, turn_id: turn.id, body: turnBody });
      },
    },
  },
});
