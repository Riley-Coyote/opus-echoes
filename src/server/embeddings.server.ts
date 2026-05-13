/**
 * Embedding pipeline. Uses OpenAI text-embedding-3-small (1536-dim).
 * Match Polyphonic V2 for index parameter compatibility.
 *
 * Graceful degradation: any API failure returns null. Callers fall
 * back to lexical retrieval / nullable embedding columns.
 */

import { openai } from "./openai.server";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_INPUT_CHARS = 8000;

export async function embedText(text: string): Promise<number[] | null> {
  if (!text || text.trim().length === 0) return null;
  try {
    const trimmed = text.slice(0, MAX_INPUT_CHARS);
    const res = await openai().embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("[embeddings] embedText failed:", err);
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  try {
    const trimmed = texts.map((t) => t.slice(0, MAX_INPUT_CHARS));
    const res = await openai().embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
    });
    return res.data.map((d) => d.embedding ?? null);
  } catch (err) {
    console.error("[embeddings] embedBatch failed:", err);
    return texts.map(() => null);
  }
}
