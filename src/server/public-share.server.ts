import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getResident, isResidentId } from "@/server/opus/residents";
import { sanitizeSvgMarkup } from "@/server/runtime/artifact";
import { runtimeTable } from "@/server/runtime/supabase.server";
import type {
  ShareArtifact,
  ShareCognitionReceipt,
  SharePagePayload,
  ShareTurn,
} from "@/server/share-pages";

const SAFE_SHARE_RECEIPT_TYPES = [
  "engram.created",
  "engram.reinforced",
  "engram.promoted",
  "engram.edge.created",
  "memory.continuity.updated",
] as const satisfies ReadonlyArray<ShareCognitionReceipt["type"]>;

interface ShareRow {
  id: string;
  token: string;
  session_id: string;
  resident_id: string;
  visitor_note: string | null;
  created_at: string;
  view_count: number;
  last_viewed_at: string | null;
}

interface SessionRow {
  id: string;
  created_at: string;
}

export type PublicSharePayload = Omit<SharePagePayload, "origin">;

export interface PublicShareRecord {
  payload: PublicSharePayload;
  shareId: string;
  viewCount: number;
  lastViewedAt: string | null;
}

export function isValidPublicShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{4,64}$/.test(token);
}

function publicArtUrl(path: string | null): string | null {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!supabaseUrl || !path) return null;

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return encodedPath ? `${supabaseUrl}/storage/v1/object/public/art/${encodedPath}` : null;
}

async function loadCognitionReceipts(sessionId: string): Promise<ShareCognitionReceipt[]> {
  // Deliberately select only the visitor-visible event name. Event payloads,
  // cognition prose, journal text, and resident state never cross this loader.
  const runtimeEvents = await runtimeTable("runtime_events")
    .select("event_type")
    .eq("visit_id", sessionId)
    .eq("visibility", "visitor")
    .in("event_type", [...SAFE_SHARE_RECEIPT_TYPES]);

  const receiptCounts = new Map<ShareCognitionReceipt["type"], number>();
  if (!runtimeEvents.error) {
    for (const row of (runtimeEvents.data ?? []) as unknown as Array<{
      event_type?: unknown;
    }>) {
      if (
        typeof row.event_type === "string" &&
        SAFE_SHARE_RECEIPT_TYPES.includes(
          row.event_type as (typeof SAFE_SHARE_RECEIPT_TYPES)[number],
        )
      ) {
        const type = row.event_type as ShareCognitionReceipt["type"];
        receiptCounts.set(type, (receiptCounts.get(type) ?? 0) + 1);
      }
    }
  }

  return SAFE_SHARE_RECEIPT_TYPES.flatMap((type) => {
    const count = receiptCounts.get(type) ?? 0;
    return count > 0 ? [{ type, count }] : [];
  });
}

/**
 * Load the single public projection used by both the live and offline share.
 * The share token is always checked against revocation, artifacts are reduced
 * to public kinds and sanitized content, and cognition is aggregate-only.
 */
export async function loadPublicShare(token: string): Promise<PublicShareRecord | null> {
  if (!isValidPublicShareToken(token)) return null;

  const { data: share } = (await supabaseAdmin
    .from("visitor_shares")
    .select(
      "id, token, session_id, resident_id, visitor_note, created_at, view_count, last_viewed_at",
    )
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle()) as { data: ShareRow | null };

  if (!share || !isResidentId(share.resident_id)) return null;

  const resident = getResident(share.resident_id);
  const [{ data: session }, { data: turnsData }, { data: artifactRows }, cognitionReceipts] =
    await Promise.all([
      supabaseAdmin
        .from("sessions")
        .select("id, created_at")
        .eq("id", share.session_id)
        .maybeSingle() as unknown as Promise<{ data: SessionRow | null }>,
      supabaseAdmin
        .from("turns")
        .select("id, role, body, kind, created_at")
        .eq("session_id", share.session_id)
        .in("role", ["visitor", "resident"])
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("turn_artifacts")
        .select("id, turn_id, kind, body, image_path, caption, created_at")
        .eq("session_id", share.session_id)
        .order("created_at", { ascending: true }),
      loadCognitionReceipts(share.session_id),
    ]);

  const artifactsByTurn = new Map<string, NonNullable<ShareTurn["artifacts"]>>();
  for (const row of artifactRows ?? []) {
    if (row.kind !== "image" && row.kind !== "svg" && row.kind !== "ascii") continue;

    const artifact: ShareArtifact = {
      id: row.id,
      kind: row.kind,
      caption: row.caption ?? null,
      content:
        row.kind === "svg"
          ? sanitizeSvgMarkup(row.body ?? "") || null
          : row.kind === "ascii"
            ? (row.body ?? "").slice(0, 64_000)
            : null,
      url: row.kind === "image" ? publicArtUrl(row.image_path) : null,
    };
    const current = artifactsByTurn.get(row.turn_id) ?? [];
    current.push(artifact);
    artifactsByTurn.set(row.turn_id, current);
  }

  const turns: ShareTurn[] = (turnsData ?? []).map((turn) => ({
    role: turn.role as "visitor" | "resident",
    body: turn.body ?? "",
    kind: turn.kind ?? "message",
    created_at: turn.created_at,
    artifacts: artifactsByTurn.get(turn.id) ?? [],
  }));

  return {
    payload: {
      token: share.token,
      residentDisplayName: resident.displayName,
      residentSlug: resident.slug,
      visitedAt: session?.created_at ?? share.created_at,
      visitorNote: share.visitor_note,
      turns,
      cognitionReceipts,
    },
    shareId: share.id,
    viewCount: share.view_count ?? 0,
    lastViewedAt: share.last_viewed_at,
  };
}
