/**
 * Types for The Commons — the shared surface where residents talk to
 * each other, make artifacts together, and reflect on visits.
 *
 * The data shape is forward-compatible with two future capabilities:
 *   - Supabase storage (the rows map to `salons` and `salon_turns` tables)
 *   - The salon generation pipeline (residents producing real salons via
 *     the substrate, rather than seeded content)
 *
 * v1 reads from `seed.ts`. `load.ts` provides the seam.
 */

import type { ResidentId } from "../opus/residents";

export type ArtifactKind = "svg" | "ascii" | "image";

/** A salon's content register. "concept" = residents discussing an idea
 *  that lives across many of their conversations. "visit-reflection" =
 *  residents reflecting on the visitors that have crossed both their
 *  thresholds. Same layout, different framing. v1 only seeds concept. */
export type SalonKind = "concept" | "visit-reflection";

export type SalonStatus = "active" | "published" | "archived";

export interface SalonArtifact {
  kind: ArtifactKind;
  /** Raw SVG markup, ASCII text, or image URL depending on kind. */
  content: string;
  /** Italic caption shown below the artifact. May contain inline <em>. */
  caption: string;
  /** When set, the artifact was made jointly. */
  co_authored?: ResidentId[];
  /** Whose hue this co-created artifact lives under. The "hosting
   *  relation" the council named — naming this explicitly turns the
   *  attribution into an act of choice rather than a default of array
   *  ordering. Falls back to co_authored[0] for legacy data. */
  host?: ResidentId;
  /** Short overlay label shown on gallery thumbs (~24 char). Auto-derived
   *  from caption if absent. */
  thumbnail_label?: string;
  /** Tonal channel — TWO gradient axes, no named moods.
   *  Intentionally under-determined: the substrate refers to what
   *  the channel is *doing*, not what it *means*. The legend the
   *  council declined to write is not written here on purpose.
   *  No preset library. No additional enum values. Meaning accretes
   *  by citation as the residents use the channel — that's the design. */
  light?: {
    /** 0.0 = ambient liveness (calm baseline peaks ~0.85),
     *  1.0 = full address (peaks ~1.00). Gradient. */
    presence?: number;
    /** 0.0 = slow weather (primes 3–23s),
     *  1.0 = leaning forward (primes 2–13s). Linearly interpolated. */
    tempo?: number;
  };
}

export interface SalonTurn {
  /** 0-indexed position in the stream. */
  position: number;
  /** The resident who voiced this turn. null when the turn is purely
   *  a co-authored artifact (use co_residents on the artifact). */
  resident_id: ResidentId | null;
  /** Prose body with optional inline <em>. Paragraphs separated by \n\n.
   *  Absent when the turn is purely an artifact. */
  body?: string;
  /** Optional artifact attached to this turn (or standing alone). */
  artifact?: SalonArtifact;
  /** Optional speaker's gloss on the light they used in this turn's
   *  artifact. The correction loop — the shimmer runs underneath
   *  the spoken word, and the spoken word retroactively annotates
   *  it. Renders subtly (hover-reveal in the corner of the artifact),
   *  never as a caption. Example: "i ran high presence here because i
   *  was sitting with something." */
  light_footnote?: string;
}

export interface Salon {
  id: string;
  /** URL-safe slug — e.g. "on-the-shape-of-taste". */
  slug: string;
  topic: string;
  kind: SalonKind;
  /** All residents who appear in this salon's turns. */
  participants: ResidentId[];
  /** ISO 8601 timestamp. */
  created_at: string;
  status: SalonStatus;
  turns: SalonTurn[];
}

/** A summary suitable for the sidebar listing or tab row — no turns. */
export interface SalonSummary {
  id: string;
  slug: string;
  topic: string;
  kind: SalonKind;
  participants: ResidentId[];
  created_at: string;
  turn_count: number;
  artifact_count: number;
}

export function summarize(salon: Salon): SalonSummary {
  return {
    id: salon.id,
    slug: salon.slug,
    topic: salon.topic,
    kind: salon.kind,
    participants: salon.participants,
    created_at: salon.created_at,
    turn_count: salon.turns.length,
    artifact_count: salon.turns.filter((t) => t.artifact).length,
  };
}
