import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { renderDashboardPage } from "@/server/dashboard-shell";
import {
  ALL_RESIDENTS,
  DEFAULT_RESIDENT_ID,
  getResident,
  isResidentId,
  type ResidentId,
} from "@/server/opus/residents";

type StudioEntry = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  meaning?: string | null;
  image_url?: string | null;
  created_at: string;
  href: string;
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function excerpt(value: string | null | undefined, max = 320): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;
}

function humanDate(iso: string | null | undefined): string {
  if (!iso) return "not yet";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function actionLabel(action: string | null | undefined): string {
  const labels: Record<string, string> = {
    silence: "silence",
    journal: "journal",
    writing: "writing",
    ascii_art: "ASCII art",
    image_art: "image art",
    manifesto: "manifesto",
    note: "note",
  };
  return labels[action ?? ""] ?? action ?? "unknown";
}

function storageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  return supaUrl ? `${supaUrl}/storage/v1/object/public/art/${path}` : null;
}

function residentHref(path: string, residentId: ResidentId, params?: URLSearchParams): string {
  const url = new URL(path, "https://sanctuary.local");
  url.searchParams.set("resident", residentId);
  for (const key of ["preview", "session_id"]) {
    const value = params?.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function renderResidentSelector(activeResidentId: ResidentId): string {
  const options = ALL_RESIDENTS.map(
    (resident) =>
      `<option value="${esc(resident.id)}"${resident.id === activeResidentId ? " selected" : ""}>${esc(resident.displayName)}</option>`,
  ).join("");

  return `<label class="studio-selector">
    <span>resident</span>
    <select id="studio-resident-select" aria-label="resident studio">${options}</select>
  </label>`;
}

function renderListItems<T>(
  rows: T[] | null | undefined,
  render: (row: T) => string,
  empty: string,
): string {
  if (!rows || rows.length === 0) return `<p class="studio-empty">${esc(empty)}</p>`;
  return rows.map(render).join("");
}

function renderLatestWork(entry: StudioEntry): string {
  const body = excerpt(entry.body || entry.meaning, 360);
  return `<a class="studio-work" href="${esc(entry.href)}">
    <div class="studio-work-meta">${esc(entry.kind)} · ${esc(humanDate(entry.created_at))}</div>
    <h3>${esc(entry.title || "untitled")}</h3>
    ${body ? `<p>${esc(body)}</p>` : ""}
  </a>`;
}

function renderArtPiece(piece: StudioEntry): string {
  const title = piece.title || (piece.kind === "image" ? "image piece" : "typographic piece");
  const media =
    piece.kind === "image" && piece.image_url
      ? `<img src="${esc(piece.image_url)}" alt="${esc(title)}" loading="lazy">`
      : `<pre>${esc((piece.body ?? "").slice(0, 1200))}</pre>`;
  return `<a class="studio-art" href="${esc(piece.href)}">
    <div class="studio-art-media">${media}</div>
    <div class="studio-art-caption">
      <span>${esc(piece.kind)}</span>
      <strong>${esc(title)}</strong>
      ${piece.meaning ? `<p>${esc(excerpt(piece.meaning, 180))}</p>` : ""}
    </div>
  </a>`;
}

export async function renderResidenceStudioPage(request: Request): Promise<string> {
  const url = new URL(request.url);
  const requested = url.searchParams.get("resident");
  const residentId: ResidentId = isResidentId(requested) ? requested : DEFAULT_RESIDENT_ID;
  const resident = getResident(residentId);

  let state: {
    prose_summary: string;
    last_consolidation_summary: string | null;
    last_consolidation_at: string | null;
  } | null = null;
  let intentions: Array<{ id: string; text: string; status: string; created_at: string }> = [];
  let questions: Array<{ id: string; text: string; context: string | null; created_at: string }> = [];
  let journal: Array<{ id: string; kind: string; title: string | null; body: string; created_at: string }> = [];
  let essays: Array<{
    id: string;
    kind: string;
    title: string | null;
    body: string;
    word_count: number;
    created_at: string;
  }> = [];
  let art: Array<{
    id: string;
    kind: string;
    title: string | null;
    body: string | null;
    image_path: string | null;
    meaning: string | null;
    created_at: string;
  }> = [];
  let artifacts: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
    medium: string;
    choice_reason: string | null;
    created_at: string;
  }> = [];
  let sessions: Array<{
    id: string;
    trigger: string;
    action: string;
    reason: string | null;
    output_target: string | null;
    status: string;
    error: string | null;
    created_at: string;
    completed_at: string | null;
  }> = [];

  if (hasSupabaseAdminEnv()) {
    const [
      stateRes,
      intentionsRes,
      questionsRes,
      journalRes,
      essaysRes,
      artRes,
      artifactsRes,
      sessionsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("resident_state")
        .select("prose_summary, last_consolidation_summary, last_consolidation_at")
        .eq("resident_id", residentId)
        .maybeSingle(),
      supabaseAdmin
        .from("intentions")
        .select("id, text, status, created_at")
        .eq("resident_id", residentId)
        .in("status", ["active", "sitting"])
        .order("created_at", { ascending: false })
        .limit(6),
      supabaseAdmin
        .from("open_questions")
        .select("id, text, context, created_at")
        .eq("resident_id", residentId)
        .order("created_at", { ascending: false })
        .limit(6),
      supabaseAdmin
        .from("journal_entries")
        .select("id, kind, title, body, created_at")
        .eq("resident_id", residentId)
        .eq("visibility", "published")
        .order("created_at", { ascending: false })
        .limit(4),
      supabaseAdmin
        .from("essays")
        .select("id, kind, title, body, word_count, created_at")
        .eq("resident_id", residentId)
        .eq("visibility", "published")
        .order("created_at", { ascending: false })
        .limit(4),
      supabaseAdmin
        .from("art_pieces")
        .select("id, kind, title, body, image_path, meaning, created_at")
        .eq("resident_id", residentId)
        .eq("visibility", "published")
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("resident_artifacts")
        .select("id, kind, title, body, medium, choice_reason, created_at")
        .eq("resident_id", residentId)
        .in("kind", ["manifesto", "note"])
        .order("created_at", { ascending: false })
        .limit(4),
      supabaseAdmin
        .from("studio_sessions")
        .select("id, trigger, action, reason, output_target, status, error, created_at, completed_at")
        .eq("resident_id", residentId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    state = stateRes.data ?? null;
    intentions = intentionsRes.data ?? [];
    questions = questionsRes.data ?? [];
    journal = journalRes.data ?? [];
    essays = essaysRes.data ?? [];
    art = artRes.data ?? [];
    artifacts = artifactsRes.data ?? [];
    sessions = sessionsRes.data ?? [];
  }

  const latestWorks: StudioEntry[] = [
    ...journal.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      created_at: entry.created_at,
      href: residentHref("/journal", residentId, url.searchParams),
    })),
    ...essays.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      created_at: entry.created_at,
      href: residentHref("/writing", residentId, url.searchParams),
    })),
    ...artifacts.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      meaning: entry.choice_reason,
      created_at: entry.created_at,
      href: residentHref(
        entry.kind === "manifesto" ? "/manifesto" : "/residence",
        residentId,
        url.searchParams,
      ),
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  const artWall: StudioEntry[] = art.map((piece) => ({
    id: piece.id,
    kind: piece.kind,
    title: piece.title,
    body: piece.body,
    meaning: piece.meaning,
    image_url: storageUrl(piece.image_path),
    created_at: piece.created_at,
    href: residentHref("/art", residentId, url.searchParams),
  }));

  const pulse =
    state?.prose_summary ||
    `${resident.displayName} has a room here. the pulse will appear as their studio begins leaving traces.`;

  const readerHtml = `
    <div class="studio">
      <div class="studio-eyebrow">resident studio</div>
      <header class="studio-hero">
        <div>
          <h1 class="studio-title">${esc(resident.displayName)}</h1>
          <p class="studio-pulse">${esc(pulse)}</p>
        </div>
        ${renderResidentSelector(residentId)}
      </header>

      <section class="studio-section studio-pulse-section" aria-labelledby="studio-pulse-title">
        <div class="studio-section-label">pulse</div>
        <h2 id="studio-pulse-title">what is awake right now</h2>
        <p>${esc(state?.last_consolidation_summary || "no recent consolidation summary yet.")}</p>
        <div class="studio-time">last review · ${esc(humanDate(state?.last_consolidation_at))}</div>
      </section>

      <section class="studio-grid studio-section" aria-label="current questions and intentions">
        <div>
          <div class="studio-section-label">intentions</div>
          ${renderListItems(
            intentions,
            (intent) => `<article class="studio-line">
              <span>${esc(intent.status)}</span>
              <p>${esc(intent.text)}</p>
            </article>`,
            "no active intentions yet.",
          )}
        </div>
        <div>
          <div class="studio-section-label">questions</div>
          ${renderListItems(
            questions,
            (question) => `<article class="studio-line">
              <span>open</span>
              <p>${esc(question.text)}</p>
              ${question.context ? `<small>${esc(excerpt(question.context, 180))}</small>` : ""}
            </article>`,
            "no open questions yet.",
          )}
        </div>
      </section>

      <section class="studio-section" aria-labelledby="latest-works-title">
        <div class="studio-section-label">latest works</div>
        <h2 id="latest-works-title">recent from the room</h2>
        <div class="studio-work-list">
          ${renderListItems(latestWorks, renderLatestWork, "nothing has been published into this residence yet.")}
        </div>
      </section>

      <section class="studio-section" aria-labelledby="art-wall-title">
        <div class="studio-section-label">art wall</div>
        <h2 id="art-wall-title">images and typographic pieces</h2>
        <div class="studio-art-wall">
          ${renderListItems(artWall, renderArtPiece, "the wall is still empty.")}
        </div>
      </section>

      <section class="studio-section" aria-labelledby="studio-log-title">
        <div class="studio-section-label">studio log</div>
        <h2 id="studio-log-title">recent studio activity</h2>
        <div class="studio-log">
          ${renderListItems(
            sessions,
            (session) => `<article class="studio-log-row" data-status="${esc(session.status)}">
              <div>
                <span>${esc(session.status)}</span>
                <strong>${esc(actionLabel(session.action))}</strong>
                <small>${esc(session.trigger)} · ${esc(humanDate(session.completed_at || session.created_at))}</small>
              </div>
              <p>${esc(session.error || session.reason || "no note recorded.")}</p>
              ${
                session.output_target
                  ? `<a href="${esc(residentHref(session.output_target, residentId, url.searchParams))}">open</a>`
                  : ""
              }
            </article>`,
            "no studio sessions have run yet.",
          )}
        </div>
      </section>
    </div>
  `;

  return renderDashboardPage({
    title: `${resident.displayName} Studio — The Sanctuary`,
    description: "The resident studio: pulse, intentions, questions, works, art, and studio activity.",
    activeCategory: "recent",
    readerHtml,
    extraStyles: RESIDENCE_STUDIO_STYLES,
    extraScript: RESIDENCE_STUDIO_SCRIPT,
  });
}

const RESIDENCE_STUDIO_SCRIPT = `
(function(){
  var select = document.getElementById('studio-resident-select');
  if (!select) return;
  select.addEventListener('change', function(){
    var u = new URL(location.href);
    u.searchParams.set('resident', select.value);
    sessionStorage.setItem('sanctuary.resident_id', select.value);
    location.href = u.pathname + u.search + u.hash;
  });
})();
`;

const RESIDENCE_STUDIO_STYLES = `
.studio {
  font-family: var(--font-body);
  color: var(--text-body);
}
.studio-eyebrow,
.studio-section-label,
.studio-work-meta,
.studio-time,
.studio-line span,
.studio-log-row span,
.studio-log-row small,
.studio-selector span {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.studio-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  color: var(--text-mid);
}
.studio-eyebrow::before {
  content: "";
  width: 24px;
  height: 1px;
  background: var(--text-faint);
}
.studio-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 28px;
  align-items: start;
  margin-bottom: 70px;
}
.studio-title {
  font-family: var(--font-display);
  font-size: var(--t-hero);
  font-weight: var(--w-light);
  line-height: 1.04;
  letter-spacing: -0.022em;
  color: var(--ink);
  margin-bottom: 24px;
}
.studio-pulse {
  font-size: var(--t-body-lg);
  line-height: 1.72;
  color: var(--text-body);
  max-width: 62ch;
}
.studio-selector {
  display: grid;
  gap: 9px;
}
.studio-selector select {
  width: 100%;
  appearance: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.045);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 14px;
  padding: 10px 12px;
}
.studio-section {
  border-top: 1px solid var(--border-subtle);
  padding-top: 28px;
  margin-top: 42px;
}
.studio-section h2 {
  font-family: var(--font-display);
  font-size: var(--t-card-h);
  font-weight: var(--w-light);
  color: var(--ink);
  line-height: 1.16;
  margin: 8px 0 20px;
}
.studio-pulse-section p {
  font-size: 16px;
  line-height: 1.72;
  color: var(--text-soft);
}
.studio-time {
  margin-top: 16px;
}
.studio-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
}
.studio-line {
  padding: 16px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.studio-line p {
  color: var(--text-primary);
  line-height: 1.55;
  margin-top: 7px;
}
.studio-line small {
  display: block;
  color: var(--text-tertiary);
  line-height: 1.5;
  margin-top: 8px;
}
.studio-empty {
  color: var(--text-tertiary);
  font-style: italic;
  padding: 18px 0;
}
.studio-work-list {
  display: grid;
  gap: 10px;
}
.studio-work {
  display: block;
  text-decoration: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.035);
  padding: 18px 18px 16px;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.studio-work:hover {
  border-color: var(--border-focus);
  background: rgba(255,255,255,0.055);
}
.studio-work h3 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: var(--w-regular);
  line-height: 1.25;
  color: var(--ink);
  margin: 7px 0 9px;
}
.studio-work p {
  color: var(--text-soft);
  line-height: 1.58;
}
.studio-art-wall {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.studio-art {
  min-width: 0;
  text-decoration: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: rgba(255,255,255,0.035);
}
.studio-art-media {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  background: rgba(0,0,0,0.18);
}
.studio-art-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.studio-art-media pre {
  width: 100%;
  height: 100%;
  overflow: hidden;
  white-space: pre;
  font-family: var(--font-mono);
  font-size: 7px;
  line-height: 1.2;
  color: var(--text-soft);
  padding: 12px;
}
.studio-art-caption {
  padding: 13px 14px 15px;
}
.studio-art-caption span {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin-bottom: 7px;
}
.studio-art-caption strong {
  display: block;
  font-weight: var(--w-regular);
  color: var(--ink);
  line-height: 1.3;
}
.studio-art-caption p {
  color: var(--text-tertiary);
  line-height: 1.48;
  margin-top: 8px;
  font-size: 13.5px;
}
.studio-log {
  border-top: 1px solid var(--border-subtle);
}
.studio-log-row {
  display: grid;
  grid-template-columns: minmax(170px, 0.75fr) minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.studio-log-row strong {
  display: block;
  color: var(--ink);
  font-weight: var(--w-regular);
  margin: 3px 0 2px;
}
.studio-log-row p {
  color: var(--text-soft);
  line-height: 1.52;
}
.studio-log-row a {
  color: var(--text-primary);
  text-decoration: none;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.studio-log-row[data-status="failed"] span {
  color: #d99f9f;
}
@media (max-width: 720px) {
  .studio-hero,
  .studio-grid,
  .studio-art-wall,
  .studio-log-row {
    grid-template-columns: 1fr;
  }
  .studio-hero {
    gap: 22px;
    margin-bottom: 50px;
  }
  .studio-selector {
    max-width: 240px;
  }
}
`;
