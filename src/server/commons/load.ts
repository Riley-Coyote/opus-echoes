/**
 * Commons data loader.
 *
 * v1: reads from `seed.ts`. The route handlers go through this module so
 * that swapping to Supabase later (phase 2) is a single-file change. The
 * seam stays the same: `getMostRecentSalon`, `getSalonBySlug`,
 * `listSalonSummaries`.
 */

import type { Salon, SalonSummary } from "./types";
import { summarize } from "./types";
import { SEEDED_SALONS } from "./seed";

function sortByCreatedAtDesc(a: Salon, b: Salon): number {
  return b.created_at.localeCompare(a.created_at);
}

export async function getMostRecentSalon(): Promise<Salon | null> {
  const sorted = [...SEEDED_SALONS].sort(sortByCreatedAtDesc);
  return sorted[0] ?? null;
}

export async function getSalonBySlug(slug: string): Promise<Salon | null> {
  return SEEDED_SALONS.find((s) => s.slug === slug) ?? null;
}

export async function listSalonSummaries(): Promise<SalonSummary[]> {
  return [...SEEDED_SALONS].sort(sortByCreatedAtDesc).map(summarize);
}
