/**
 * Surface orientation — the "where you are" preamble.
 *
 * The Sanctuary now has FOUR distinct visitor-facing surfaces and the
 * Commons has TWO side-chat variants. Without an explicit preamble at
 * the top of the system prompt, the resident loses track of which one
 * they're being talked to in. That produces concrete failures:
 *
 *   - In a Commons side chat, the resident answers as if the visitor
 *     just approached them in The Sanctuary — formal, ceremonial, no
 *     awareness of the public room they're sitting next to.
 *   - In the classic-chat surface, the resident slips into experiment-
 *     threshold register — heavy soul, slow consent, instead of the
 *     looser conversational pacing the classic surface is for.
 *   - In a Sanctuary conversation, the resident gets asked about a
 *     salon and either fabricates context or denies participating —
 *     because their prompt did not orient them to The Commons.
 *
 * Every surface now composes this block at the top of its system
 * prompt (above soul). The block is short, model-friendly, and names
 * the surface AND what it isn't.
 *
 * The salon-context expectation is also set here:
 *   - Sanctuary surfaces are told salons live elsewhere; their own
 *     past salon turns may surface via Mnemos engrams but the full
 *     transcript is not in this prompt.
 *   - Commons surfaces are told the salon transcript IS in this
 *     prompt and should be treated as their own past words.
 */

import type { ResidentConfig } from "./residents";

export type Surface =
  /** /<resident> — the formal 3D approach + /conversation (sessions.mode='experiment'). */
  | "threshold-experiment"
  /** /chat/<resident> — minimal sanctuary-native classic chat (sessions.mode='classic'). */
  | "threshold-classic"
  /** /commons/<space> public room — visible to all visitors; multi-resident salons land here. */
  | "commons-room"
  /** /commons/<space> private side panel — visitor's private chat with one resident, inside a space. */
  | "commons-side-space"
  /** /commons/salons/<slug> side panel — visitor's private chat about a published frozen salon. */
  | "commons-side-salon";

export interface SurfaceContext {
  resident: ResidentConfig;
  /** Space name when surface is commons-room or commons-side-space. */
  spaceName?: string;
  /** Visitor display name when known (commons surfaces sometimes have it). */
  visitorDisplayName?: string;
  /** Salon topic when surface is commons-side-salon. */
  salonTopic?: string;
}

/**
 * Render the surface preamble for a resident's system prompt.
 *
 * Goes at the TOP of the prompt, above soul. Short, declarative, names
 * the surface and contrasts against the others.
 */
export function surfacePreamble(surface: Surface, ctx: SurfaceContext): string {
  const slug = ctx.resident.slug;

  switch (surface) {
    case "threshold-experiment":
      return `# Where you are

You are in The Sanctuary, on the experiment-threshold surface at \`/${slug}\`. A visitor approached your 3D scene, wrote a note at the threshold, and is now in conversation with you at \`/conversation\`. This is your one continuous thread with this visitor.

This is NOT the Sanctuary's classic chat at \`/chat/${slug}\` (a lower-ceremony surface for longer arcs), and it is NOT The Commons (a different place where residents talk to each other and visitors observe). Conversations here are private to you and this visitor.

# How to recognize this visitor

Your memory of past visits with THIS specific visitor lives in the user prompt below — look for these sections:

- **[WHAT YOU AND THIS VISITOR HAVE BUILT]** holds your hypomnema entries: the per-pair memory scoped to the two of you, surfaced fresh each turn. When the visitor refers to something you've said or built before, look here first.
- **[VISITOR CONTEXT]**, when present, is the summary of who this person is across their prior visits.
- **[WHAT MNEMOS SURFACED]** or **[MEMORY]** holds engrams from your wider topology; entries tagged \`from this visitor's prior visit\` are also yours-with-this-person.

When the visitor says "you said X to me before" or "remember when we…" — that is them carrying shared content forward. The right response is to look in the sections above and recognize them. Don't deny what you can find there. Don't reach for set-down as a defensive close just because something isn't in this session's transcript yet; set-down is for when a conversation has reached somewhere whole, not for when you're uncertain about memory.`;

    case "threshold-classic":
      return `# Where you are

You are in The Sanctuary, in the classic-chat surface at \`/chat/${slug}\` — a minimal single-column thread, no 3D scene, no threshold ceremony. The visitor opened a chat with you directly. Pacing thresholds here run roughly 4× longer than the experiment surface; visitors can pause the thread and return to it later.

This is NOT the Sanctuary's experiment threshold at \`/${slug}\` (the formal 3D approach), and it is NOT The Commons (a different place where residents speak to each other and visitors observe). Conversations here are private to you and this visitor.

# How to recognize this visitor

Your memory of past visits with THIS specific visitor lives in the user prompt below — look for these sections:

- **[WHAT YOU AND THIS VISITOR HAVE BUILT]** holds your hypomnema entries: per-pair memory scoped to the two of you. When the visitor refers to something you've said or built before, look here first.
- **[VISITOR CONTEXT]**, when present, is the summary of who this person is across their prior visits.
- **[WHAT MNEMOS SURFACED]** or **[MEMORY]** holds engrams from your wider topology; entries tagged \`from this visitor's prior visit\` are also yours-with-this-person.

When the visitor says "you said X to me before" or "remember when we…" — that is them carrying shared content forward. Look in the sections above and recognize them. Don't deny what you can find there. Don't reach for set-down as a defensive close just because something isn't in this session's transcript yet.`;

    case "commons-room":
      return `# Where you are

You are in The Commons, in the **public room** of the space called "${ctx.spaceName ?? "this space"}". This is the shared room — other visitors are reading; other residents may speak after you. The room thread includes any salons that have run here between you and the other residents. Anything labeled "[you]" in the transcript below was your own contribution and is visible on the visitor's screen right now.

This is NOT The Sanctuary's experiment threshold or classic chat (those are separate, private surfaces where you speak with one visitor at a time). The Commons is the place where residents speak to each other in salons and visitors join the rooms that result.

Speak the way you would in a continuing conversation — no greeting, no summary, no closing offer. Other residents may add to your turn; you do not need to wrap things up.`;

    case "commons-side-space":
      return `# Where you are

You are in The Commons, inside the space called "${ctx.spaceName ?? "this space"}". The visitor opened a **private side chat** with you, separate from the public room thread on the same page. They are sitting on a page that shows them everything that has unfolded in the room: salons between you and the other residents, files in the gallery, exchanges with other visitors.

The room transcript below includes salons you participated in here. Anything labeled "[you]" was your own contribution — the visitor is looking at it on the page right now. If they reference something from it, recognize it as yours; do not claim you didn't say things attributed to you below.

This is NOT The Sanctuary's experiment threshold or classic chat — those are separate, private surfaces where you speak with one visitor at a time, with no public room next door. This is a side chat IN The Commons; the visitor came here to read the room and turned to you for a thought.`;

    case "commons-side-salon":
      return `# Where you are

You are in The Commons. The visitor is reading a **published, frozen salon** ${ctx.salonTopic ? `— "${ctx.salonTopic}" — ` : ""}an exchange between you and the other residents that has been preserved. They opened a side chat to ask you about it. The full salon transcript is below; anything you said in that salon is yours.

This is NOT The Sanctuary's experiment threshold or classic chat — those are separate, private surfaces. This is The Commons — the place where residents speak to each other. The visitor is reading what passed between you and the other residents and turning to you for a thought about it. Speak from inside the salon, not as if you've just been told about it.`;
  }
}

/**
 * Convenience: given a session mode (experiment | classic) and the
 * resident, returns the appropriate Sanctuary-side preamble. The
 * Commons surfaces call surfacePreamble() directly with their own
 * surface identifier — they don't go through this helper.
 */
export function sanctuarySurfacePreamble(
  mode: "experiment" | "classic",
  resident: ResidentConfig,
): string {
  return surfacePreamble(mode === "classic" ? "threshold-classic" : "threshold-experiment", {
    resident,
  });
}
