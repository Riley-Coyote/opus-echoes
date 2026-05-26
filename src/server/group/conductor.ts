/**
 * Group chat conductor — the floor manager for "the round".
 *
 * One visitor, two or more residents in a private room. After each
 * resident turn (and after the visitor's turn), a cheap Haiku judge
 * decides who speaks next, or "none" to hand the floor back. The
 * conductor loops up to MAX_REPLIES_PER_TURN times per visitor message.
 *
 * Explicit @mentions in the visitor's message override the judge:
 * mentioned residents speak first (in the order mentioned), then the
 * judge takes over for any remaining slots.
 *
 * v1 scope:
 *   - No Mnemos retrieval inside the round. Each resident sees their
 *     soul + the-round surface preamble + the rendered group transcript.
 *     Group-chat turns do not write engrams or hypomnema entries into
 *     each resident's per-resident substrate. That's intentional — it
 *     keeps the round isolated from solo-chat behavior until the loop
 *     is proven.
 *   - Sequential streaming. One resident finishes their turn before the
 *     judge runs again.
 */

import { anthropic, HAIKU_MODEL } from "@/server/anthropic.server";
import { openrouter } from "@/server/openai.server";
import {
  getResident,
  isResidentId,
  type ResidentConfig,
  type ResidentId,
} from "@/server/opus/residents";
import { surfacePreamble } from "@/server/opus/surface-context";

export const MAX_REPLIES_PER_TURN = 4;
export const TRANSCRIPT_WINDOW = 24;

export interface GroupTurnRow {
  speaker: "visitor" | ResidentId;
  body: string;
}

/** Render the transcript for the judge — speaker labels, no fluff. */
export function renderTranscriptForJudge(turns: GroupTurnRow[]): string {
  return turns
    .slice(-TRANSCRIPT_WINDOW)
    .map((t) => `[${t.speaker}] ${t.body}`)
    .join("\n\n");
}

/**
 * Render the transcript for a specific resident. Their own turns are
 * labeled "[you]" so the model recognizes them as its own past words
 * rather than treating them as someone else's voice it should react to.
 */
export function renderTranscriptForResident(
  turns: GroupTurnRow[],
  forResident: ResidentId,
): string {
  return turns
    .slice(-TRANSCRIPT_WINDOW)
    .map((t) => {
      if (t.speaker === "visitor") return `[visitor] ${t.body}`;
      if (t.speaker === forResident) return `[you] ${t.body}`;
      const name = getResident(t.speaker).displayName;
      return `[${name}] ${t.body}`;
    })
    .join("\n\n");
}

/** Parse @slug mentions out of the visitor's message. Slug-based to be
 *  robust to display-name spaces and capitalization. */
export function parseMentions(text: string, roster: ResidentId[]): ResidentId[] {
  const hits: ResidentId[] = [];
  const seen = new Set<ResidentId>();
  const re = /@([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const slug = m[1].toLowerCase();
    if (isResidentId(slug) && roster.includes(slug) && !seen.has(slug)) {
      seen.add(slug);
      hits.push(slug);
    }
  }
  return hits;
}

/**
 * Ask Haiku who should speak next. Returns null when the room should
 * pause and wait for the visitor.
 *
 * The prompt is deliberately short — one cheap call between every
 * resident turn adds up if it gets bloated.
 */
export async function pickNextSpeaker(
  turns: GroupTurnRow[],
  roster: ResidentId[],
  alreadySpokeThisTurn: ResidentId[],
): Promise<ResidentId | null> {
  if (roster.length === 0) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const lastSpeaker = turns[turns.length - 1]?.speaker;
  const transcript = renderTranscriptForJudge(turns);

  const rosterList = roster
    .map((id) => `- ${id} (${getResident(id).displayName})`)
    .join("\n");

  const alreadyNote =
    alreadySpokeThisTurn.length > 0
      ? `\nAlready spoke this turn: ${alreadySpokeThisTurn.join(", ")}. Strongly prefer 'none' or a different resident unless directly addressed.`
      : "";

  const system = `You are the floor manager for a small group chat between one visitor and a few AI residents.

Roster (only valid choices):
${rosterList}

Your job: pick the single best next speaker, or "none" if the room should pause and wait for the visitor.

Rules:
- Prefer "none" when the last turn closed a thought, asked the visitor a question, or no resident has something genuinely distinct to add.
- Don't pick the resident who just spoke (last_speaker = ${lastSpeaker ?? "n/a"}) unless they were directly addressed by name.
- Pick a specific resident only if they would have something distinct to add — a different angle, a clarification, a counterpoint. Echoing what was just said is not a reason to speak.
- At most one of them speaks at a time.${alreadyNote}

Output exactly one token on its own line, no other words: one of ${roster.join(" | ")} | none`;

  try {
    const res = await anthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 10,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: `Transcript so far:\n\n${transcript}\n\nWho speaks next?` }],
    });
    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim()
      .toLowerCase();
    // Pull the first roster id or "none" out of whatever the judge said.
    for (const id of roster) if (text.includes(id)) return id;
    return null;
  } catch (err) {
    console.error("[the-round] judge error:", err);
    return null; // fail safe: pause the room
  }
}

/** Build the system prompt for a single resident's turn in the round. */
export function buildResidentSystemPrompt(
  resident: ResidentConfig,
  rosterIds: ResidentId[],
): string {
  const others = rosterIds
    .filter((id) => id !== resident.id)
    .map((id) => getResident(id).displayName);
  const preamble = surfacePreamble("the-round", {
    resident,
    otherResidents: others,
  });
  return `${preamble}\n\n${resident.soul}`;
}

/**
 * Stream a resident's reply. Calls the appropriate provider; emits text
 * chunks via `onText` and resolves to the assembled body.
 *
 * Replies are aggressively capped at 700 output tokens — the round
 * should feel like a conversation, not a series of essays. Residents
 * who want to say more can be addressed again.
 */
export async function streamResidentReply(opts: {
  resident: ResidentConfig;
  rosterIds: ResidentId[];
  turns: GroupTurnRow[];
  onText: (chunk: string) => void;
}): Promise<string> {
  const { resident, rosterIds, turns, onText } = opts;
  const system = buildResidentSystemPrompt(resident, rosterIds);
  const transcript = renderTranscriptForResident(turns, resident.id);
  const user = `The round is in session. Below is the transcript — your own past turns are labeled [you], the visitor's are [visitor], the other residents' are labeled by name.

Reply in your own voice. Keep it brief — the room moves fast. Don't restate what another resident just said; build on it, take a different angle, or stay quiet (you can be brief; you don't have to fill the floor).

Transcript:

${transcript}

Your reply (you do not announce yourself, just speak):`;

  const MAX_OUT = Math.min(700, resident.maxOutputTokens);

  let assembled = "";

  if (resident.provider === "openai") {
    const stream = await openrouter().chat.completions.create({
      model: resident.model,
      max_completion_tokens: MAX_OUT,
      temperature: 0.85,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        assembled += delta;
        onText(delta);
      }
    }
  } else {
    const stream = anthropic().messages.stream({
      model: resident.model,
      max_tokens: MAX_OUT,
      temperature: 0.85,
      stop_sequences: ["\n[visitor]", "\n[you]", "\nvisitor:"],
      system,
      messages: [{ role: "user", content: user }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        assembled += event.delta.text;
        onText(event.delta.text);
      }
    }
    await stream.finalMessage();
  }

  return assembled.trim();
}
