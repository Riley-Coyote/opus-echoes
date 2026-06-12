/**
 * Phase-two stub pages — pre-v2 throwaways.
 *
 * These render the eight phase-two rooms as minimal in-register placeholders
 * while the plumbing lands (phase 0). They are deliberately unstyled beyond
 * the existing PUBLIC_CSS shell: the v2 design language (phase D,
 * docs/phase-two/HANDOFF.md §7) replaces every one of these surfaces before
 * anything visible ships. Do not invest design effort here.
 *
 * The `data-stub` attribute is the render marker scripts/check-redirects.ts
 * asserts against.
 */

import { renderPublicPage } from "@/server/public-pages";

export interface StubPageOptions {
  /** Document title, e.g. "The Sanctuary — the record". */
  title: string;
  /** Mono eyebrow line above the heading. */
  eyebrow: string;
  /** The room's name, rendered as the h1. */
  heading: string;
  /** One quiet line about what this room will be. */
  note: string;
  /** Stable marker for the check script: data-stub="<stubId>". */
  stubId: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderStubPage(opts: StubPageOptions): string {
  return renderPublicPage({
    title: opts.title,
    description: opts.note,
    body: `
<section class="prose" data-stub="${escapeHtml(opts.stubId)}">
  <div class="eyebrow">${escapeHtml(opts.eyebrow)}</div>
  <h1>${escapeHtml(opts.heading)}</h1>
  <p>${escapeHtml(opts.note)}</p>
</section>`,
  });
}
