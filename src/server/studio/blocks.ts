/**
 * Shared block helpers — the conductor (P2) and renderStudioPage
 * (P3) MUST agree on how a block becomes HTML and how float `ord`
 * positions are computed, so the server-rendered page and the live
 * broadcast `html_cache` are byte-identical. Pure, zero deps.
 */

export type BlockType = "para" | "section" | "pull" | "em_strong";

export const BLOCK_TYPES: readonly BlockType[] = ["para", "section", "pull", "em_strong"];

export function isBlockType(t: string): t is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(t);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Block content → html_cache. Content is treated as plain text
 * (escaped) — residents author prose, not markup; marks are layered
 * separately by the client. Newlines within a para become <br>.
 */
export function renderBlockHtml(type: BlockType, content: string): string {
  const safe = escapeHtml(content.trim());
  const withBreaks = safe.replace(/\n+/g, "<br>");
  switch (type) {
    case "section":
      return `<h2>${withBreaks}</h2>`;
    case "pull":
      return `<p class="pull">${withBreaks}</p>`;
    case "em_strong":
      return `<p class="em-strong">${withBreaks}</p>`;
    case "para":
    default:
      return `<p>${withBreaks}</p>`;
  }
}

/** A block as the conductor tracks it in-loop (mirrors document_blocks). */
export interface BlockState {
  id: string;
  ord: number;
  type: BlockType;
  content: string;
  version: number;
  author_resident_id: string | null;
  author_visitor_token: string | null;
}

/**
 * Float `ord` for inserting AFTER `ref` in an ord-sorted list:
 * the midpoint between ref and its successor, or ref+1 at the tail.
 * O(1), no renumber. (Float precision exhausts after ~50 consecutive
 * midpoint inserts at the SAME gap with no rebalance — acceptable
 * for a manuscript; rebalancing is a deferred concern, not v1.)
 */
export function ordAfter(sorted: BlockState[], refId: string | null): number {
  if (sorted.length === 0) return 1;
  if (refId === null) {
    // insert at the very end
    return sorted[sorted.length - 1].ord + 1;
  }
  const i = sorted.findIndex((b) => b.id === refId);
  if (i === -1) return sorted[sorted.length - 1].ord + 1;
  const cur = sorted[i].ord;
  const next = sorted[i + 1]?.ord;
  return next === undefined ? cur + 1 : (cur + next) / 2;
}

/** Resolve a model-supplied ref ("<uuid>" | "ord:<n>" | "end") to a block id. */
export function resolveRef(sorted: BlockState[], ref: string | null): string | null {
  if (!ref || ref === "end") return null;
  if (ref.startsWith("ord:")) {
    const n = Number(ref.slice(4));
    if (!Number.isFinite(n)) return null;
    let best: BlockState | null = null;
    for (const b of sorted) {
      if (b.ord <= n && (!best || b.ord > best.ord)) best = b;
    }
    return best ? best.id : null;
  }
  return sorted.some((b) => b.id === ref) ? ref : null;
}
