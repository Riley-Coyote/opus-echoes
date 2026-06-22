/* Fuzzy timestamps — verbatim from opus-echoes humanWhen(). "Not exact —
   that's the point." Memory doesn't keep clock times. */

export function humanWhen(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = diff / 60_000;
  if (min < 2) return "just now";
  if (min < 60) return "a little earlier";
  const hrs = min / 60;
  if (hrs < 4) return "a few hours ago";
  if (hrs < 24) return "earlier today";
  const days = hrs / 24;
  if (days < 2) return "yesterday";
  if (days < 7) return "earlier this week";
  if (days < 30) return "earlier this month";
  if (days < 365) return "earlier this year";
  return "some time ago";
}

/** ISO string for a moment `ageMs` in the past, relative to load. */
export function ago(ageMs: number): string {
  return new Date(Date.now() - ageMs).toISOString();
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
