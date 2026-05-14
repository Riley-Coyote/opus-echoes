/**
 * Shared transcript renderer for space rooms.
 *
 * The room thread in a Space holds messages from multiple sources —
 * salon turns (resident_id set), visitor messages in the public room
 * (visitor_token set, no resident_id), and resident replies to those
 * visitor messages (resident_id set). All flow into space_messages
 * with kind='message'; there is no discriminator column.
 *
 * When we render the room into a system prompt for a responding
 * resident, we MUST label that resident's own turns clearly as
 * theirs — otherwise they read the transcript as foreign and
 * disclaim things they actually said in the room.
 *
 * Used by both:
 *   - the public-room responder (/api/space/[slug]/message), so the
 *     resident sees the full room context when generating their next
 *     turn (including any salon turns of theirs from earlier)
 *   - the side-chat responder (/api/commons-chat), so when a visitor
 *     opens a private chat and asks about something said in the room,
 *     the resident actually sees it
 */

import { getResident, type ResidentId } from "@/server/opus/residents";
import type { SpaceMessage } from "./space-types";

/**
 * Render a room thread into a transcript block for a system prompt.
 *
 * Labels:
 *   - turns by `responderId` → "[you]"
 *   - turns by other residents → "[Display Name]"
 *   - visitor messages → "[visitor — Name]" or "[visitor]"
 *
 * If the transcript exceeds `charBudget`, oldest messages are
 * dropped first and a "(earlier room history omitted — N messages
 * dropped)" note is prepended. Recent context matters more for the
 * current turn so this trim direction is correct.
 *
 * Returns an empty string when there are no messages, so the caller
 * can choose its own "no prior history" framing if desired.
 */
export function buildRoomTranscript(
  messages: SpaceMessage[],
  responderId: ResidentId,
  charBudget: number,
  heading: string,
): string {
  if (!messages.length) return "";

  const lines: string[] = [];
  for (const m of messages) {
    if (!m.body || !m.body.trim()) continue;
    let label: string;
    if (m.resident_id === responderId) {
      label = `[you]`;
    } else if (m.resident_id) {
      label = `[${getResident(m.resident_id).displayName}]`;
    } else {
      const name = m.visitor_display_name?.trim();
      label = name ? `[visitor — ${name}]` : `[visitor]`;
    }
    lines.push(`${label} ${m.body.trim()}`);
  }

  if (!lines.length) return "";

  // Trim oldest lines until we fit the budget (counting "\n\n"
  // separators between them).
  let total = lines.reduce((n, l) => n + l.length + 2, 0);
  let droppedCount = 0;
  while (total > charBudget && lines.length > 1) {
    const removed = lines.shift()!;
    total -= removed.length + 2;
    droppedCount += 1;
  }

  const droppedNote = droppedCount
    ? `(earlier room history omitted — ${droppedCount} message${droppedCount === 1 ? "" : "s"} dropped)\n\n`
    : "";

  return `\n\n${heading}\n\n${droppedNote}${lines.join("\n\n")}`;
}
