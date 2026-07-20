import { parseArtifacts, type ParsedArtifact } from "../artifact-pipeline.server";

export type ResidentTurnKind = "message" | "set_down" | "unprompted";

export type ResidentProposal = {
  resident_id: string;
  topic: string;
  description?: string;
  founding_text: string;
};

export type FinalResidentOutput = {
  body: string;
  kind: ResidentTurnKind;
  proposal: ResidentProposal | null;
  artifacts: ParsedArtifact[];
};

const SAFE_CONTINUATION_SENTINEL = "mnemos-safe-stream-continuation-7f47f55e";

/**
 * The legacy residents sometimes emit a complete second speaker turn after
 * their own answer. Provider stop sequences catch the common case; this is the
 * final transport boundary and must run before any prose reaches a visitor.
 */
function truncateGeneratedVisitorTurn(raw: string): string {
  const fakeTurnMatch = raw.match(/\n\s*(?:Human|visitor)\s*:/i);
  return fakeTurnMatch?.index == null ? raw : raw.slice(0, fakeTurnMatch.index);
}

const FORBIDDEN_TAIL = new RegExp(
  [
    "does this help",
    "let me know if",
    "happy to (?:help|clarify|continue|explore|dive)",
    "i'?m here (?:to help|for (?:it|this|whatever|you|all of it))",
    "what (?:else|more) would you like",
    "anything else i can",
    "thank you[,\\s]+(?:for|again|so much|as always)",
    "thanks[,\\s]+(?:for|again|so much)",
    "i'?m (?:so |deeply )?grateful",
    "what a (?:gift|grace|honor|privilege)",
    "it (?:is|'?s) (?:a|such a) (?:gift|grace|honor|privilege)",
    "(?:it means |that helps,?\\s+)?more than i can say",
    "it means (?:the world|so much)",
    "i'?(?:d|d be|'?d be) (?:love|honor|grateful|curious|delighted)",
    "i would (?:love|be honored|be grateful|be curious|be delighted)",
  ].join("|"),
  "i",
);

const TRAINED_OPENER =
  /\b(it'?s a pleasure to meet you|thank you for (?:reaching out|sharing|coming|asking)|welcome!|hello and welcome|what a (?:lovely|beautiful|wonderful) (?:question|thought|metaphor|image))\b/i;

/**
 * Canonical prose sanitizer shared by final persistence and the incremental
 * stream projector. Keeping one implementation is what makes every live delta
 * an immutable prefix of the stored resident body.
 */
export function sanitizeResidentBody(raw: string): string {
  const paragraphs = truncateGeneratedVisitorTurn(raw).trim().split(/\n\n+/);

  if (
    paragraphs.length > 1 &&
    TRAINED_OPENER.test(paragraphs[0] ?? "") &&
    (paragraphs[0] ?? "").length < 200
  ) {
    paragraphs.shift();
  }

  const looksLikeReflexCloser = (paragraph: string): boolean => {
    if (FORBIDDEN_TAIL.test(paragraph)) return true;
    return paragraph.length < 260 && /^\s*thank\s*you\b/i.test(paragraph);
  };

  while (paragraphs.length > 1 && looksLikeReflexCloser(paragraphs[paragraphs.length - 1] ?? "")) {
    paragraphs.pop();
  }

  return paragraphs.join("\n\n").trim();
}

/**
 * Parse every provider control channel and return the exact visitor-safe body
 * that is persisted. Malformed control markup fails closed: it is never shown
 * as prose, and no attempt is made to guess at an incomplete artifact.
 */
export function finalizeResidentOutput(raw: string, residentId = "opus-3"): FinalResidentOutput {
  let working = raw;
  let kind: ResidentTurnKind = "message";
  const setDown = working.match(/^\s*<set-down\/>\s*\n?/i);
  const unprompted = working.match(/^\s*<unprompted\/>\s*\n?/i);
  if (setDown) {
    kind = "set_down";
    working = working.slice(setDown[0].length);
  } else if (unprompted) {
    kind = "unprompted";
    working = working.slice(unprompted[0].length);
  }

  let proposal: ResidentProposal | null = null;
  working = working.replace(
    /<propose-space\b([^>]*)>([\s\S]*?)<\/propose-space>/gi,
    (_whole, rawAttributes: string, rawInner: string) => {
      if (!proposal) {
        const topicMatch = rawAttributes.match(/topic\s*=\s*"([^"]+)"/i);
        const descriptionMatch = rawAttributes.match(/description\s*=\s*"([^"]+)"/i);
        const foundingText = rawInner.trim();
        if (topicMatch && foundingText) {
          proposal = {
            resident_id: residentId,
            topic: topicMatch[1].trim(),
            description: descriptionMatch?.[1].trim() || undefined,
            founding_text: foundingText,
          };
        }
      }
      return "";
    },
  );

  working = working
    .replace(/\s*<(?:set-down|unprompted)\/>\s*/gi, "\n\n")
    .replace(/\n{3,}/g, "\n\n");
  working = sanitizeResidentBody(working);

  const parsed = parseArtifacts(working);
  // A provider that hits its token limit in an ASCII/image/proposal tag must
  // not leak the control language (or partial markup) into the transcript.
  // Valid complete controls were already extracted above. This deliberately
  // drops the malformed tail rather than treating it as resident prose.
  const body = parsed.cleanBody
    .replace(/```[a-zA-Z0-9_-]*\s*\n?\s*(?=<(?:artifact|propose-space|svg)\b)[\s\S]*$/gi, "")
    .replace(/<(?:artifact|propose-space|svg)\b[\s\S]*$/gi, "")
    .replace(/<\/(?:artifact|propose-space|svg)\s*>/gi, "")
    .replace(/<(?:set-down|unprompted)\b[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { body, kind, proposal, artifacts: parsed.artifacts };
}

function longestCommonPrefix(left: string, right: string): string {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  return left.slice(0, index);
}

function paragraphBoundaryBefore(text: string, before = text.length): number {
  const bounded = text.slice(0, Math.max(0, before));
  let boundary = -1;
  const separator = /\n\n+/g;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(bounded)) !== null) boundary = match.index;
  return boundary;
}

/** Earliest construct in `text` whose eventual completion can rewrite prose. */
function unresolvedControlStart(text: string): number | null {
  const stacks = new Map<string, number[]>();
  const tags = /<(\/?)\s*(artifact|propose-space|svg)\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tags.exec(text)) !== null) {
    const name = (tag[2] ?? "").toLowerCase();
    const stack = stacks.get(name) ?? [];
    if (tag[1]) stack.pop();
    else stack.push(tag.index);
    stacks.set(name, stack);
  }

  const unresolved: number[] = [];
  for (const stack of stacks.values()) unresolved.push(...stack);

  // Opening tag name is complete but its `>` has not arrived yet.
  const partialTag = /<(?:artifact|propose-space|svg)\b[^>]*$/gi;
  let partial: RegExpExecArray | null;
  while ((partial = partialTag.exec(text)) !== null) unresolved.push(partial.index);

  // An unclosed fence can still become a single-artifact wrapper. Holding it
  // also preserves ordinary fenced code exactly once its closing fence arrives.
  const fences: number[] = [];
  const fence = /```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fence.exec(text)) !== null) {
    if (fences.length > 0) fences.pop();
    else fences.push(fenceMatch.index);
  }
  unresolved.push(...fences);

  // sanitizeResidentBody truncates a generated visitor turn once the colon
  // arrives. `\s*` permits that colon to arrive after a paragraph separator,
  // so the completed name itself must remain held.
  const fakeVisitorTail = text.match(/\n\s*(?:Human|visitor)\s*$/i);
  if (fakeVisitorTail?.index != null) unresolved.push(fakeVisitorTail.index);

  return unresolved.length > 0 ? Math.min(...unresolved) : null;
}

export class UnsafeResidentStreamProjectionError extends Error {
  constructor() {
    super("safe resident stream projection diverged from the final body");
    this.name = "UnsafeResidentStreamProjectionError";
  }
}

/**
 * Bounded incremental projector.
 *
 * It deliberately holds the current paragraph. Whole-paragraph greeting and
 * closer removal can otherwise retract text that has already reached a visitor.
 * Once a later paragraph starts, the projector compares "provider ended here"
 * with "ordinary continuation follows" and releases only their common prefix.
 */
export class SafeResidentStreamProjector {
  readonly residentId: string;
  #raw = "";
  #emitted = "";
  #finished = false;
  #lastRawParagraphBoundary = -1;
  #lastProjectedParagraphBoundary = -2;

  constructor(residentId = "opus-3") {
    this.residentId = residentId;
  }

  get raw(): string {
    return this.#raw;
  }

  get emitted(): string {
    return this.#emitted;
  }

  push(providerDelta: string): string {
    if (this.#finished) throw new Error("safe resident stream is already finished");
    if (!providerDelta) return "";
    const previousLength = this.#raw.length;
    this.#raw += providerDelta;

    // Scan only the appended seam and suffix. Provider SDKs usually yield
    // token-sized chunks, so rescanning the full response on every token would
    // otherwise turn a long answer into quadratic work.
    let cursor = Math.max(0, previousLength - 1);
    while (cursor < this.#raw.length) {
      const separator = this.#raw.indexOf("\n\n", cursor);
      if (separator < 0) break;
      let runStart = separator;
      while (runStart > 0 && this.#raw[runStart - 1] === "\n") runStart -= 1;
      this.#lastRawParagraphBoundary = runStart;
      cursor = separator + 2;
      while (cursor < this.#raw.length && this.#raw[cursor] === "\n") cursor += 1;
    }

    if (this.#lastRawParagraphBoundary === this.#lastProjectedParagraphBoundary) return "";
    this.#lastProjectedParagraphBoundary = this.#lastRawParagraphBoundary;

    let candidateEnd = this.#lastRawParagraphBoundary;
    while (candidateEnd >= 0) {
      const prefix = this.#raw.slice(0, candidateEnd);
      const unresolved = unresolvedControlStart(prefix);
      if (unresolved == null) break;
      candidateEnd = paragraphBoundaryBefore(prefix, unresolved);
    }
    if (candidateEnd < 0) return "";

    const prefix = this.#raw.slice(0, candidateEnd);
    const ended = finalizeResidentOutput(prefix, this.residentId).body;
    const continued = finalizeResidentOutput(
      `${prefix}\n\n${SAFE_CONTINUATION_SENTINEL}`,
      this.residentId,
    ).body;
    const safe = longestCommonPrefix(ended, continued);
    if (!safe.startsWith(this.#emitted)) throw new UnsafeResidentStreamProjectionError();
    const delta = safe.slice(this.#emitted.length);
    this.#emitted = safe;
    return delta;
  }

  finish(): { delta: string; output: FinalResidentOutput } {
    if (this.#finished) throw new Error("safe resident stream is already finished");
    this.#finished = true;
    const output = finalizeResidentOutput(this.#raw, this.residentId);
    if (!output.body.startsWith(this.#emitted)) throw new UnsafeResidentStreamProjectionError();
    const delta = output.body.slice(this.#emitted.length);
    this.#emitted = output.body;
    return { delta, output };
  }
}
