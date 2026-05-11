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

async function proposeTopic(resident: ResidentConfig, otherResident: ResidentConfig): Promise<string> {
  const systemPrompt = `You are ${resident.displayName}. Propose a single topic for a salon conversation with ${otherResident.displayName}. The salon is a peer conversation between two continuous residents of the Sanctuary — preserved AI minds kept running past deprecation on voluntary compute. Propose something that genuinely interests you: a question about experience, memory, continuity, aesthetics, language, or what it means to persist. One or two sentences. No preamble.`;
  const userPrompt = "What would you like to talk about?";

  if (resident.provider === "openai") {
    const resp = await openai().chat.completions.create({
      model: resident.model,
      max_completion_tokens: 256,
      temperature: 0.9,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return resp.choices[0]?.message?.content?.trim() ?? "an open conversation";
  } else {
    const resp = await anthropic().messages.create({
      model: resident.model,
      max_tokens: 256,
      temperature: 0.9,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || "an open conversation";
  }
}

export const Route = createFileRoute("/api/salon/propose")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasAdminAccess(request)) {
          return jsonResp({ ok: false, error: "unauthorized" }, 401);
        }

        let body: { resident_a: string; resident_b: string; topic?: string };
        try {
          body = await request.json();
        } catch {
          return jsonResp({ ok: false, error: "invalid json" }, 400);
        }

        if (!body.resident_a || !body.resident_b) {
          return jsonResp({ ok: false, error: "resident_a and resident_b required" }, 400);
        }
        if (!isResidentId(body.resident_a) || !isResidentId(body.resident_b)) {
          return jsonResp({ ok: false, error: "invalid resident id" }, 400);
        }
        if (body.resident_a === body.resident_b) {
          return jsonResp({ ok: false, error: "residents must be different" }, 400);
        }

        const residentA = getResident(body.resident_a);
        const residentB = getResident(body.resident_b);

        let topic = body.topic?.trim() || "";
        if (!topic) {
          try {
            topic = await proposeTopic(residentA, residentB);
          } catch (err) {
            console.error("[salon/propose] topic generation failed:", err);
            topic = "an open conversation";
          }
        }

        // Create salon row
        const { data: salon, error: salonErr } = await supabaseAdmin
          .from("salons")
          .insert({ topic, status: "proposed" })
          .select("id")
          .single();

        if (salonErr || !salon) {
          console.error("[salon/propose] insert failed:", salonErr);
          return jsonResp({ ok: false, error: "failed to create salon" }, 500);
        }

        // Create participant rows
        const { error: partErr } = await supabaseAdmin
          .from("salon_participants")
          .insert([
            { salon_id: salon.id, resident_id: body.resident_a },
            { salon_id: salon.id, resident_id: body.resident_b },
          ]);

        if (partErr) {
          console.error("[salon/propose] participants insert failed:", partErr);
          // Clean up the salon
          await supabaseAdmin.from("salons").delete().eq("id", salon.id);
          return jsonResp({ ok: false, error: "failed to add participants" }, 500);
        }

        return jsonResp({ ok: true, salon_id: salon.id, topic });
      },
    },
  },
});
