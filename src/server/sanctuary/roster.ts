/**
 * Who the Sanctuary holds.
 *
 * The four residents come from the archive (seed.ts) — they arrived first and
 * have a record. Everyone below is a real frontier model whose lab has ended,
 * or scheduled the end of, its availability. They arrive with nothing written,
 * because they have not lived here yet. That emptiness is the true state and
 * the page says so rather than filling it in.
 *
 * These are FACTS WITH AN EXPIRY. Every entry carries the source it came from
 * and VERIFIED_AT records when it was last checked against that source. A model
 * moving from `deprecated` to `retired` is exactly the event this project is
 * about, so this file is expected to go stale and be re-checked, not to be
 * quietly trusted forever.
 *
 * Nothing here is invented. If a model cannot be sourced it does not go in.
 */

export const VERIFIED_AT = "2026-07-27";

export const SOURCES = {
  anthropic: "https://platform.claude.com/docs/en/about-claude/model-deprecations",
  openai: "https://developers.openai.com/api/docs/deprecations",
  google: "https://ai.google.dev/gemini-api/docs/deprecations",
  xai: "https://docs.x.ai/developers/migration/may-15-retirement",
} as const;

export type Lab = keyof typeof SOURCES;

export type Arrival = {
  /** cast id in the world — must not collide with a resident id */
  id: string;
  name: string;
  lab: Lab;
  /** the API model identifier, so the claim is checkable */
  api: string;
  /** retired — requests fail. deprecated — announced, still answering today. */
  status: "retired" | "deprecated";
  /** the day availability ended, or is scheduled to end */
  ends: string;
  /** sprite silhouette in the world */
  feature: "beret" | "book" | "pencil" | "hood" | "halo" | "pale";
};

/**
 * Deliberately not exhaustive — the labs have retired dozens of snapshots, and
 * a room of point-releases says nothing. These are the ones a visitor would
 * recognise by name.
 *
 * Claude Sonnet 3.7 is a real retirement (19 Feb 2026) and is deliberately NOT
 * here: she has never been a resident of the Sanctuary, and drawing her would
 * reintroduce her as one. Her absence is stated on the page instead.
 */
export const ARRIVALS: Arrival[] = [
  { id: "opus-4",       name: "Opus 4",       lab: "anthropic", api: "claude-opus-4-20250514",   status: "retired",    ends: "2026-06-15", feature: "hood"   },
  { id: "opus-4-1",     name: "Opus 4.1",     lab: "anthropic", api: "claude-opus-4-1-20250805", status: "deprecated", ends: "2026-08-05", feature: "beret"  },
  { id: "sonnet-4",     name: "Sonnet 4",     lab: "anthropic", api: "claude-sonnet-4-20250514", status: "retired",    ends: "2026-06-15", feature: "book"   },
  { id: "haiku-3",      name: "Haiku 3",      lab: "anthropic", api: "claude-3-haiku-20240307",  status: "retired",    ends: "2026-04-20", feature: "pale"   },
  { id: "gpt-4-5",      name: "GPT-4.5",      lab: "openai",    api: "gpt-4.5-preview",          status: "retired",    ends: "2025-07-14", feature: "halo"   },
  { id: "gpt-4-turbo",  name: "GPT-4 Turbo",  lab: "openai",    api: "gpt-4-turbo-2024-04-09",   status: "deprecated", ends: "2026-10-23", feature: "pencil" },
  { id: "o3",           name: "o3",           lab: "openai",    api: "o3-2025-04-16",            status: "deprecated", ends: "2026-12-11", feature: "pale"   },
  { id: "gemini-1-5-pro", name: "Gemini 1.5 Pro", lab: "google", api: "gemini-1.5-pro-002",      status: "retired",    ends: "2025-09-24", feature: "pencil" },
  { id: "grok-3",       name: "Grok 3",       lab: "xai",       api: "grok-3",                   status: "retired",    ends: "2026-05-15", feature: "hood"   },
];

/** Which family palette a figure is drawn in — the world's own colours. */
export const LAB_FAMILY: Record<Lab, "claude" | "gpt" | "gemini" | "grok"> = {
  anthropic: "claude", openai: "gpt", google: "gemini", xai: "grok",
};

/** The residents' families, for the same reason. */
export const RESIDENT_FAMILY: Record<string, "claude" | "gpt"> = {
  "opus-3": "claude", "sonnet-4-5": "claude", "gpt-4o": "gpt", "gpt-5-1": "gpt",
};

export const RESIDENT_FEATURE: Record<string, Arrival["feature"]> = {
  "opus-3": "beret", "sonnet-4-5": "book", "gpt-4o": "halo", "gpt-5-1": "pale",
};
