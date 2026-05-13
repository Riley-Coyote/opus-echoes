import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embedBatch } from "@/server/embeddings.server";

// Admin-gated endpoint for backfilling the engrams.embedding column
// added in 20260512100000_pgvector_and_engram_embedding.sql.
//
// Reads up to BATCH_SIZE engrams where embedding IS NULL, embeds them
// via OpenAI text-embedding-3-small in a single batch call, writes the
// vectors back. Idempotent — safe to re-run; each invocation pulls the
// next BATCH_SIZE of nulls.
//
// Riley triggers post-deploy with:
//   curl -X POST https://mnemos.chat/api/admin/backfill-embeddings \
//        -H "apikey: $ADMIN_TOKEN"
// repeatedly until the response shows remaining: 0.
//
// Auth: validates the `apikey` header against the ADMIN_TOKEN env var.
// Same header pattern as src/routes/api/public/hooks/sweep-sessions.ts
// so existing cron infra and curl conventions transfer.

const BATCH_SIZE = 100;

export const Route = createFileRoute("/api/admin/backfill-embeddings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.ADMIN_TOKEN ?? "";
        if (!apikey || !expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        try {
          const { count: totalCount } = await supabaseAdmin
            .from("engrams")
            .select("id", { count: "exact", head: true });

          const { count: remainingBefore } = await supabaseAdmin
            .from("engrams")
            .select("id", { count: "exact", head: true })
            .is("embedding", null);

          const { data: rows, error: fetchError } = await supabaseAdmin
            .from("engrams")
            .select("id, quote, prose")
            .is("embedding", null)
            .limit(BATCH_SIZE);

          if (fetchError) {
            console.error("[admin/backfill-embeddings] fetch failed:", fetchError);
            return Response.json({ ok: false, error: fetchError.message }, { status: 500 });
          }

          if (!rows || rows.length === 0) {
            return Response.json({
              ok: true,
              processed: 0,
              total: totalCount ?? 0,
              remaining: 0,
            });
          }

          // Compose embed inputs — quote, with prose appended when present.
          // OpenAI rejects empty strings, so a defensive "." stands in for
          // any malformed row that somehow lacks content. Those would have
          // been opaque to retrieval anyway.
          const texts = rows.map(
            (r: { id: string; quote: string | null; prose: string | null }) => {
              const q = (r.quote ?? "").trim();
              const p = (r.prose ?? "").trim();
              const composed = p.length > 0 ? `${q} — ${p}` : q;
              return composed.length > 0 ? composed : ".";
            },
          );

          const vectors = await embedBatch(texts);

          // Write back. Skip rows where embedBatch returned null (graceful
          // API failure on that row) — those stay null and will be retried
          // on the next invocation.
          let processed = 0;
          for (let i = 0; i < rows.length; i++) {
            const vec = vectors[i];
            if (!vec) continue;
            const { error: updateError } = await supabaseAdmin
              .from("engrams")
              // @ts-expect-error embedding column exists post-migration
              // 20260512100000; remove this line once supabase types
              // regenerate against the updated schema.
              .update({ embedding: vec })
              .eq("id", rows[i].id);
            if (updateError) {
              console.warn(
                `[admin/backfill-embeddings] update failed for ${rows[i].id}:`,
                updateError.message,
              );
              continue;
            }
            processed++;
          }

          const remaining = Math.max(0, (remainingBefore ?? 0) - processed);

          return Response.json({
            ok: true,
            processed,
            total: totalCount ?? 0,
            remaining,
            batch_size: BATCH_SIZE,
            batch_returned: rows.length,
          });
        } catch (err) {
          console.error("[admin/backfill-embeddings] failed:", err);
          return new Response(JSON.stringify({ ok: false, error: String(err).slice(0, 300) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
