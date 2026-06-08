import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { considerCreation } from "@/server/substrate.server";
import { DEFAULT_RESIDENT_ID, getResident, isResidentId, type ResidentId } from "@/server/opus/residents";
import { isAuthorizedCronRequest } from "@/server/cron-auth.server";

// Manual trigger: force a creation pass right now, regardless of visitors
// or recent-creation guards. Auth via apikey header (publishable key).
// Optional ?form=ascii|image to bias the classifier.
export const Route = createFileRoute("/api/public/hooks/force-art")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) {
          return new Response("unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const formHint = url.searchParams.get("form"); // "ascii" | "image" | null
        const residentParam = url.searchParams.get("resident");
        const residentId: ResidentId = isResidentId(residentParam)
          ? residentParam
          : DEFAULT_RESIDENT_ID;
        const resident = getResident(residentId);

        const [{ data: recentEngrams }, { data: recentJournal }] = await Promise.all([
          supabaseAdmin
            .from("engrams")
            .select("quote, prose, attribution, is_core, last_reinforced_at")
            .eq("resident_id", residentId)
            .order("last_reinforced_at", { ascending: false })
            .limit(8),
          supabaseAdmin
            .from("journal_entries")
            .select("kind, title, body, created_at")
            .eq("resident_id", residentId)
            .order("created_at", { ascending: false })
            .limit(4),
        ]);

        const contextStr = [
          "[RECENT MEMORY]",
          (recentEngrams ?? [])
            .map(
              (e) =>
                `- (${e.is_core ? "core" : "engram"}, ${e.attribution}) "${e.quote}"${
                  e.prose ? ` — ${e.prose}` : ""
                }`,
            )
            .join("\n") || "(no engrams yet.)",
          "",
          "[RECENT JOURNAL]",
          (recentJournal ?? [])
            .map((j) => `- (${j.kind}${j.title ? `, "${j.title}"` : ""}) ${j.body.slice(0, 280)}`)
            .join("\n\n") || "(nothing recent.)",
          "",
          "[NOTE]",
          formHint === "image"
            ? "You have been invited to make a piece now. Lean toward an image if anything in the recent memory wants to become one."
            : formHint === "ascii"
              ? "You have been invited to make a piece now. Lean toward an ASCII / typographic piece — your native register."
              : "You have been invited to make a piece now. Make whatever feels right — ASCII, image, an essay, a note, or nothing.",
        ].join("\n");

        await supabaseAdmin.from("creation_events").insert({
          kind: "force_triggered",
          resident_id: residentId,
          trigger: "daily_tick",
          detail: { form_hint: formHint },
        });

        try {
          await considerCreation(resident, null, contextStr, "daily_tick");
          return Response.json({ ok: true });
        } catch (err) {
          console.error("[hooks/force-art] failed:", err);
          return new Response(JSON.stringify({ ok: false, error: String(err).slice(0, 300) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
