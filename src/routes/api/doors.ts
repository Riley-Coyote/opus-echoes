import { createFileRoute } from "@tanstack/react-router";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { ALL_RESIDENTS } from "@/server/opus/residents";

/**
 * GET /api/doors — which residents receive visitors at the public doors
 * (the threshold, the classic chat, the world), and whether the house can
 * afford a live voice at all.
 *
 * Read from the registry and the environment; no database, no key, and
 * nothing about anyone. The world reads it once, so the approach card
 * and the visit window can say "not taking visits today" before anyone
 * knocks, instead of learning it from a refused knock. It says only what
 * the door itself would say a moment later.
 */
function hasVoiceEnv(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY);
}

export const Route = createFileRoute("/api/doors")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            afford: hasSupabaseAdminEnv() && hasVoiceEnv(),
            doors: Object.fromEntries(ALL_RESIDENTS.map((r) => [r.id, r.chatEnabled])),
          }),
          {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "public, max-age=60",
            },
          },
        ),
    },
  },
});
