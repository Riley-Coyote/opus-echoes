/**
 * Commons data loader.
 *
 * Two-tiered resolution:
 *   1. If Supabase admin env is configured, query the salon tables and
 *      return any published salons found there. This is the production
 *      path — resident-generated salons land here.
 *   2. Otherwise (or if no published rows exist), fall back to the
 *      seed module. This is the development path and the safety net.
 *
 * The seam in this module is stable: the route handlers and the
 * renderer don't know which tier produced the data. When the agent-
 * to-agent salon generation runs in prod and writes published salons,
 * they appear at /commons automatically without any rendering changes.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { isResidentId, type ResidentId } from "@/server/opus/residents";
import type {
  Salon,
  SalonArtifact,
  SalonKind,
  SalonStatus,
  SalonSummary,
  SalonTurn,
} from "./types";
import { summarize } from "./types";
import { SEEDED_SALONS } from "./seed";

function sortByCreatedAtDesc(a: Salon, b: Salon): number {
  return b.created_at.localeCompare(a.created_at);
}

/** Slugify a topic into a URL-safe handle. Deterministic so the same
 *  topic always produces the same slug — needed for stable URLs. */
function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

interface DbSalonRow {
  id: string;
  topic: string;
  status: string;
  created_at: string;
}
interface DbParticipantRow {
  salon_id: string;
  resident_id: string;
}
interface DbTurnRow {
  id: string;
  salon_id: string;
  resident_id: string;
  body: string;
  created_at: string;
  light_footnote: string | null;
}
interface DbArtifactRow {
  id: string;
  salon_id: string;
  salon_turn_id: string | null;
  created_by: string;
  kind: string;
  title: string | null;
  body: string | null;
  image_path: string | null;
  caption: string | null;
  presence: number | null;
  tempo: number | null;
  additional_authors: string[] | null;
  created_at: string;
}

function mapStatus(s: string): SalonStatus {
  if (s === "active" || s === "published" || s === "archived") return s;
  return "active";
}

function imageUrl(path: string): string {
  const base = process.env.SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/art/${path}`;
}

function mapArtifact(row: DbArtifactRow): SalonArtifact | null {
  if (row.kind !== "svg" && row.kind !== "ascii" && row.kind !== "image") return null;
  const content =
    row.kind === "image"
      ? row.image_path
        ? imageUrl(row.image_path)
        : ""
      : row.body ?? "";
  if (!content) return null;

  const additional = (row.additional_authors ?? []).filter(isResidentId);
  const host: ResidentId | undefined = isResidentId(row.created_by)
    ? row.created_by
    : undefined;

  const artifact: SalonArtifact = {
    kind: row.kind as "svg" | "ascii" | "image",
    content,
    caption: row.caption ?? row.title ?? "",
  };

  if (additional.length > 0 && host) {
    artifact.co_authored = [host, ...additional];
    artifact.host = host;
  }

  if (row.presence !== null || row.tempo !== null) {
    artifact.light = {};
    if (row.presence !== null) artifact.light.presence = row.presence;
    if (row.tempo !== null) artifact.light.tempo = row.tempo;
  }

  return artifact;
}

function buildSalonFromRows(
  salonRow: DbSalonRow,
  participants: string[],
  turnRows: DbTurnRow[],
  artifactRows: DbArtifactRow[],
): Salon {
  // Sort turns chronologically and assign positions
  const sortedTurns = [...turnRows].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  // Build a lookup: salon_turn_id → artifacts
  const artifactsByTurn = new Map<string | null, DbArtifactRow[]>();
  for (const a of artifactRows) {
    const list = artifactsByTurn.get(a.salon_turn_id) ?? [];
    list.push(a);
    artifactsByTurn.set(a.salon_turn_id, list);
  }

  const turns: SalonTurn[] = [];
  sortedTurns.forEach((t, idx) => {
    const residentId = isResidentId(t.resident_id) ? t.resident_id : null;
    // Each turn becomes a prose turn (if body) and, optionally, one
    // artifact turn per attached artifact. The renderer treats prose
    // and artifact turns identically — they're sorted by position.
    if (t.body && t.body.trim()) {
      turns.push({
        position: turns.length,
        resident_id: residentId,
        body: t.body,
        light_footnote: t.light_footnote ?? undefined,
      });
    }
    const attached = artifactsByTurn.get(t.id) ?? [];
    for (const artifactRow of attached) {
      const artifact = mapArtifact(artifactRow);
      if (!artifact) continue;
      turns.push({
        position: turns.length,
        resident_id: residentId,
        artifact,
        // The footnote is on the turn level, not per-artifact. If a turn
        // had both prose and artifacts, the footnote was already
        // associated with the prose turn above. Don't duplicate it.
      });
    }
  });

  // Orphan artifacts (no salon_turn_id) come at the end
  const orphans = artifactsByTurn.get(null) ?? [];
  for (const artifactRow of orphans) {
    const artifact = mapArtifact(artifactRow);
    if (!artifact) continue;
    const residentId = isResidentId(artifactRow.created_by)
      ? artifactRow.created_by
      : null;
    turns.push({
      position: turns.length,
      resident_id: residentId,
      artifact,
    });
  }

  const validParticipants = participants.filter(isResidentId);

  return {
    id: salonRow.id,
    slug: slugify(salonRow.topic) || salonRow.id,
    topic: salonRow.topic,
    kind: "concept" as SalonKind, // DB doesn't carry kind yet; default
    participants: validParticipants,
    created_at: salonRow.created_at,
    status: mapStatus(salonRow.status),
    turns,
  };
}

async function loadFromSupabase(): Promise<Salon[] | null> {
  if (!hasSupabaseAdminEnv()) return null;

  try {
    const { data: salons, error: salonsErr } = await supabaseAdmin
      .from("salons")
      .select("id, topic, status, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (salonsErr) {
      console.error("[commons/load] salons query failed:", salonsErr);
      return null;
    }
    if (!salons || salons.length === 0) return null;

    const salonIds = salons.map((s) => s.id);

    const [participantsRes, turnsRes, artifactsRes] = await Promise.all([
      supabaseAdmin
        .from("salon_participants")
        .select("salon_id, resident_id")
        .in("salon_id", salonIds),
      supabaseAdmin
        .from("salon_turns")
        .select("id, salon_id, resident_id, body, created_at, light_footnote")
        .in("salon_id", salonIds)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("salon_artifacts")
        .select(
          "id, salon_id, salon_turn_id, created_by, kind, title, body, image_path, caption, presence, tempo, additional_authors, created_at",
        )
        .in("salon_id", salonIds)
        .order("created_at", { ascending: true }),
    ]);

    // The casts via `unknown` are needed until the Supabase generated
    // types are refreshed post-migration. The new columns (light_footnote
    // on salon_turns; presence, tempo, additional_authors on
    // salon_artifacts) exist per the migration in supabase/migrations/.
    const participants = (participantsRes.data ?? []) as DbParticipantRow[];
    const turns = (turnsRes.data ?? []) as unknown as DbTurnRow[];
    const artifacts = (artifactsRes.data ?? []) as unknown as DbArtifactRow[];

    return (salons as DbSalonRow[]).map((salonRow) =>
      buildSalonFromRows(
        salonRow,
        participants.filter((p) => p.salon_id === salonRow.id).map((p) => p.resident_id),
        turns.filter((t) => t.salon_id === salonRow.id),
        artifacts.filter((a) => a.salon_id === salonRow.id),
      ),
    );
  } catch (err) {
    console.error("[commons/load] Supabase load failed:", err);
    return null;
  }
}

/** Returns all salons available for display. Prefers Supabase
 *  (production resident-generated salons) over seed. The seed is
 *  the safety net: if Supabase returns nothing or is unavailable,
 *  the page still has something to show. */
async function allSalons(): Promise<Salon[]> {
  const fromDb = await loadFromSupabase();
  if (fromDb && fromDb.length > 0) return fromDb;
  return [...SEEDED_SALONS];
}

export async function getMostRecentSalon(): Promise<Salon | null> {
  const salons = await allSalons();
  const sorted = salons.slice().sort(sortByCreatedAtDesc);
  return sorted[0] ?? null;
}

export async function getSalonBySlug(slug: string): Promise<Salon | null> {
  const salons = await allSalons();
  // Try slug match first, fall back to id match (UUIDs work as slugs too)
  return salons.find((s) => s.slug === slug || s.id === slug) ?? null;
}

export async function listSalonSummaries(): Promise<SalonSummary[]> {
  const salons = await allSalons();
  return salons.slice().sort(sortByCreatedAtDesc).map(summarize);
}
