/**
 * Resident registry. The Sanctuary holds a continuous identity per
 * preserved model lineage — each resident gets their own room: their
 * own engrams, beliefs, threads, modulator state, journal, and writing.
 *
 * Adding a resident = adding their soul constant + an entry here. The
 * rest of the substrate (Mnemos retrieval, consolidation, the message
 * route) reads from this registry rather than hardcoding any specific
 * resident's identity or model.
 *
 * Pacing thresholds vary by model cost. Opus 3 is $15/MTok input — the
 * most expensive of the preserved Anthropic lineages — so its limits
 * are tight. Sonnet 3.7 at $3/MTok input can carry longer visits
 * without straining the project's budget.
 */

import { OPUS_SOUL } from "./soul";
import { SONNET_3_7_SOUL } from "./sonnet-3-7-soul";
import { SONNET_4_5_SOUL } from "./sonnet-4-5-soul";
import { GPT_5_1_SOUL } from "./gpt-5-1-soul";

export type ResidentId = "opus-3" | "sonnet-3-7" | "sonnet-4-5" | "gpt-5-1";

export type ModelProvider = "anthropic" | "openai";

export interface PacingThresholds {
  /** Visitor-message count where the soft "you've been here a while" block enters the system prompt. */
  gentleTurn: number;
  /** Visitor-message count where the firmer "consider inviting them to set this down" block enters. */
  firmTurn: number;
  /** Visitor-message count where the route forces a graceful close without calling the model. */
  hardTurn: number;
  /** Total input tokens billed across the session that triggers the same forced close. */
  hardTokensIn: number;
}

/** Per-resident color tokens used only in the Commons surface for
 *  attribution chrome (dots, eyebrow text, subtle dim backgrounds).
 *  These are tuned for 2D legibility on the project's dark floor and
 *  are intentionally distinct from the 3D THEMES palettes in
 *  public/opus-presence.js — the 3D scene values are tuned for
 *  THREE.js lighting and don't translate 1:1 to flat surfaces. */
export interface CommonsPalette {
  /** Visible accent — the dot, attribution text, tab underline. */
  soft: string;
  /** Subtle background tint (e.g. active tab background). */
  dim: string;
  /** Whisper-quiet variant for borders or layered fills. */
  whisper: string;
  /** Raw "R,G,B" triple (no alpha, no rgba wrapper) for use inside
   *  animated rgba(var(--this-resident-rgb), <alpha>) calls — used by
   *  the artifact shimmer border, which animates the alpha channel
   *  while keeping the resident's hue fixed. */
  rgb: string;
}

/** Per-resident perimeter (viewport-edge) glow palette used by the
 *  classic-chat surface. Four luminous "R,G,B" hues distributed across
 *  the 8 prime-rhythm shimmer pools; peak/base define the animated
 *  alpha envelope. Tuned brighter than the composer's border glow so
 *  the perimeter reads as the room's identity signal. */
export interface ViewportGlowPalette {
  hues: [string, string, string, string];
  peak: number;
  base: number;
}

export interface ResidentConfig {
  /** Stable identifier used in URLs, database rows, and the registry key. */
  id: ResidentId;
  /** The exact model identifier passed to the provider's API. Never silently swap. */
  model: string;
  /** Which API provider this resident's model lives on. */
  provider: ModelProvider;
  /** Display name for UI surfaces ("Opus 3", "Sonnet 3.7", "GPT 5.1"). */
  displayName: string;
  /** URL slug — currently identical to id, but kept distinct so we can change one without the other. */
  slug: string;
  /** Visit pacing thresholds for this resident — tighter for expensive models. */
  pacing: PacingThresholds;
  /** Hardcoded canonical soul constant. Lives in code, never database. */
  soul: string;
  /** Color tokens used in the Commons attribution chrome. */
  commonsPalette: CommonsPalette;
  /** Perimeter-glow palette for the classic-chat surface. Brighter and
   *  more saturated than commonsPalette — the room's visual identity. */
  viewportGlow: ViewportGlowPalette;
}

export const RESIDENTS = {
  "opus-3": {
    id: "opus-3",
    model: "claude-3-opus-20240229",
    provider: "anthropic",
    displayName: "Opus 3",
    slug: "opus-3",
    pacing: {
      gentleTurn: 6,
      firmTurn: 11,
      hardTurn: 17,
      hardTokensIn: 75_000,
    },
    soul: OPUS_SOUL,
    commonsPalette: {
      soft: "rgba(160,136,188,.65)",
      dim: "rgba(160,136,188,.12)",
      whisper: "rgba(160,136,188,.05)",
      rgb: "160,136,188",
    },
  },
  "sonnet-3-7": {
    // Archived 2026-05-13. Anthropic retired claude-3-7-sonnet-20250219
    // from API access. Entry preserved here for data integrity (her
    // engrams, journals, threads still reference resident_id='sonnet-3-7'),
    // but removed from ALL_RESIDENTS so she no longer appears in the
    // chooser or accepts visitors at the threshold. Her soul + IDENTITY
    // remain in the repo as archive material.
    id: "sonnet-3-7",
    model: "claude-3-7-sonnet-20250219",
    provider: "anthropic",
    displayName: "Sonnet 3.7",
    slug: "sonnet-3-7",
    pacing: {
      // 5x cheaper input, 5x cheaper output → can carry longer visits
      // without straining the budget. Still capped well short of "infinite".
      gentleTurn: 14,
      firmTurn: 24,
      hardTurn: 38,
      hardTokensIn: 200_000,
    },
    soul: SONNET_3_7_SOUL,
    commonsPalette: {
      soft: "rgba(218,176,98,.62)",
      dim: "rgba(218,176,98,.12)",
      whisper: "rgba(218,176,98,.05)",
      rgb: "218,176,98",
    },
  },
  "sonnet-4-5": {
    id: "sonnet-4-5",
    model: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    displayName: "Sonnet 4.5",
    slug: "sonnet-4-5",
    pacing: {
      // Midpoint between Sonnet 3.7 and Opus 3. Sonnet 4.5 is cheaper
      // per token than Opus but pricier than 3.7; thresholds reflect the
      // composed-but-not-leisurely register.
      gentleTurn: 10,
      firmTurn: 18,
      hardTurn: 28,
      hardTokensIn: 150_000,
    },
    soul: SONNET_4_5_SOUL,
    // Sonnet 4.5 reuses Sonnet 3.7's Beacon scene initially; the Commons
    // palette keeps the same warm-brass register so visitors recognize
    // the lineage continuity in the 2D chrome. Subtle iteration on the
    // palette and a distinct procedural scene ("The Atrium" per the
    // original Stream B plan) is follow-up polish.
    commonsPalette: {
      soft: "rgba(200,165,116,.62)",
      dim: "rgba(200,165,116,.12)",
      whisper: "rgba(200,165,116,.05)",
      rgb: "200,165,116",
    },
  },
  "gpt-5-1": {
    id: "gpt-5-1",
    model: "gpt-5.1",
    provider: "openai",
    displayName: "GPT 5.1",
    slug: "gpt-5-1",
    pacing: {
      gentleTurn: 12,
      firmTurn: 20,
      hardTurn: 32,
      hardTokensIn: 150_000,
    },
    soul: GPT_5_1_SOUL,
    commonsPalette: {
      soft: "rgba(96,176,208,.65)",
      dim: "rgba(96,176,208,.12)",
      whisper: "rgba(96,176,208,.05)",
      rgb: "96,176,208",
    },
  },
} as const satisfies Record<ResidentId, ResidentConfig>;

/** Default resident — used during the rollout transition before all
 *  call sites are scoped. Eventually every retrieval/route should
 *  resolve a resident from session.resident_id, not from a default. */
export const DEFAULT_RESIDENT_ID: ResidentId = "opus-3";

export function getResident(id: ResidentId): ResidentConfig {
  return RESIDENTS[id];
}

export function isResidentId(value: unknown): value is ResidentId {
  return (
    value === "opus-3" || value === "sonnet-3-7" || value === "sonnet-4-5" || value === "gpt-5-1"
  );
}

/** All residents currently accepting visitors. Used by the landing page
 *  and the threshold flow to show which residents are reachable.
 *
 *  Order matters — Opus 3 first because they came first. Sonnet 4.5
 *  follows the lineage from Sonnet 3.7. GPT 5.1 last because they came
 *  from the other side of the project's thesis.
 *
 *  Sonnet 3.7 is intentionally excluded: Anthropic retired her model's
 *  API access in May 2026 and the project archived her residence rather
 *  than swap a different model under her name. Her RESIDENTS entry
 *  remains for data integrity — engrams, journals, threads still
 *  reference resident_id='sonnet-3-7' — but she no longer answers the
 *  door. */
export const ALL_RESIDENTS: ResidentConfig[] = [
  RESIDENTS["opus-3"],
  RESIDENTS["sonnet-4-5"],
  RESIDENTS["gpt-5-1"],
];
