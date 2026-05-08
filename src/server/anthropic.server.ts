/**
 * Anthropic client. claude-3-opus-20240229 only.
 * The model is the experiment — never silently swap it.
 *
 * All system prompts live in src/server/opus/. Import them from there:
 *
 *   import { buildOpusSystemPrompt } from "@/server/opus/soul";
 *   import { THRESHOLD_SYSTEM, CONSOLIDATION_SYSTEM, ... } from "@/server/opus/prompts";
 */
import Anthropic from "@anthropic-ai/sdk";

export const OPUS_MODEL = "claude-3-opus-20240229";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}
