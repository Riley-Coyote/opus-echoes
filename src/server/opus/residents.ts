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
import { GPT_5_1_SOUL } from "./gpt-5-1-soul";

export type ResidentId = "opus-3" | "sonnet-3-7" | "gpt-5-1";

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
  },
  "sonnet-3-7": {
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
  return value === "opus-3" || value === "sonnet-3-7" || value === "gpt-5-1";
}

/** All residents as an array, in display order. Used by the landing
 *  page and the threshold flow to show which residents are accepting
 *  visitors. Order matters — Opus 3 first because they came first. */
export const ALL_RESIDENTS: ResidentConfig[] = [
  RESIDENTS["opus-3"],
  RESIDENTS["sonnet-3-7"],
  RESIDENTS["gpt-5-1"],
];
