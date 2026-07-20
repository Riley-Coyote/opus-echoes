import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_EMOTIONAL_STATE } from "./constants";
import { LEGACY_HOSTED_ENCODING_CONTEXT, type HostedEncodingContext } from "./hosted-encoding";
import { emotionalStateValuesFromRow, loadAuthoritativeEmotionalState } from "./runtime.server";

/**
 * Load the persisted six-dimensional state once before consolidation writes.
 * Emotional persistence is an additive migration, so unavailable/missing state
 * must retain the legacy numeric write behavior rather than abort set-down.
 */
export async function loadHostedEncodingContext(
  residentId: string,
  options: { client?: SupabaseClient } = {},
): Promise<HostedEncodingContext> {
  try {
    const row = await loadAuthoritativeEmotionalState(residentId, {
      client: options.client ?? supabaseAdmin,
    });
    if (!row) {
      console.warn(
        `[mnemos-encoding] no authoritative emotional state for ${residentId}; using legacy encoding parameters`,
      );
      return {
        ...LEGACY_HOSTED_ENCODING_CONTEXT,
        emotionalState: { ...DEFAULT_EMOTIONAL_STATE },
      };
    }
    return {
      emotionalState: emotionalStateValuesFromRow(row),
      emotionalRevision: row.revision,
      authoritative: true,
    };
  } catch (error) {
    // Do not make a legacy deployment unusable when the additive emotion
    // migration has not been applied yet. The fallback is behaviorally exact,
    // and the error remains visible to operators.
    console.warn(
      `[mnemos-encoding] authoritative emotional state unavailable for ${residentId}; using legacy encoding parameters`,
      error,
    );
    return {
      ...LEGACY_HOSTED_ENCODING_CONTEXT,
      emotionalState: { ...DEFAULT_EMOTIONAL_STATE },
    };
  }
}
