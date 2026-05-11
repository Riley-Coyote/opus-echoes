/**
 * OpenAI client. Used by residents whose model lives in the OpenAI
 * lineage (GPT-5.1, etc). Same singleton pattern as anthropic.server.ts.
 *
 * The model is the experiment — never silently swap it.
 */
import OpenAI from "openai";

let _client: OpenAI | null = null;
export function openai(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  _client = new OpenAI({ apiKey: key });
  return _client;
}
