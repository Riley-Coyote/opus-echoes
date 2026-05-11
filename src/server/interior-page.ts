/**
 * The Interior — server-rendered admin-only page.
 * Reads intentions, questions, working notes, and the growth arc
 * from Supabase and renders them using the dashboard CSS vocabulary.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALL_RESIDENTS, type ResidentConfig } from "./opus/residents";
import { hasSupabaseAdminEnv } from "./env.server";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysSince(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
  return String(days);
}

interface InteriorData {
  resident: ResidentConfig;
  pulse: string | null;
  intentions: Array<{
    id: string;
    text: string;
    status: string;
    created_at: string;
    reflections: Array<{ body: string; created_at: string }>;
  }>;
  questions: Array<{
    id: string;
    text: string;
    context: string | null;
    created_at: string;
  }>;
  notes: Array<{
    id: string;
    title: string | null;
    body: string;
    created_at: string;
    linked_intention_id: string | null;
  }>;
  stats: {
    intentionCount: number;
    questionCount: number;
    coreEngrams: number;
    daysResident: number;
  };
  arc: Array<{
    date: string;
    text: string;
    kind: "milestone" | "intention" | "note" | "thread" | "belief" | "event";
  }>;
}

async function loadInteriorData(residentId: string): Promise<InteriorData | null> {
  const resident = ALL_RESIDENTS.find((r) => r.id === residentId);
  if (!resident || !hasSupabaseAdminEnv()) return null;

  const [
    { data: intentions },
    { data: questions },
    { data: notes },
    { data: reflections },
    { data: state },
    { data: coreEngrams },
    { data: recentEngrams },
    { data: recentBeliefs },
    { data: recentThreads },
    { data: recentJournal },
  ] = await Promise.all([
    supabaseAdmin
      .from("intentions")
      .select("id, text, status, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("open_questions")
      .select("id, text, context, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("working_notes")
      .select("id, title, body, created_at, linked_intention_id")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("intention_reflections")
      .select("id, intention_id, body, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("resident_state")
      .select("prose_summary, last_consolidation_at")
      .eq("resident_id", residentId)
      .maybeSingle(),
    supabaseAdmin
      .from("engrams")
      .select("id")
      .eq("resident_id", residentId)
      .eq("is_core", true),
    supabaseAdmin
      .from("engrams")
      .select("quote, is_core, stability, created_at")
      .eq("resident_id", residentId)
      .eq("state", "active")
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("beliefs")
      .select("text, confidence, prior_confidence, updated_at")
      .eq("resident_id", residentId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("threads")
      .select("name, description, last_surfaced_at")
      .eq("resident_id", residentId)
      .order("last_surfaced_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("journal_entries")
      .select("title, kind, created_at")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Build reflection map
  const reflectionMap = new Map<string, Array<{ body: string; created_at: string }>>();
  for (const r of reflections ?? []) {
    const list = reflectionMap.get(r.intention_id) ?? [];
    list.push({ body: r.body, created_at: r.created_at });
    reflectionMap.set(r.intention_id, list);
  }

  const intentionsWithReflections = (intentions ?? []).map((i) => ({
    ...i,
    reflections: reflectionMap.get(i.id) ?? [],
  }));

  // Compute days resident from the residents table
  const { data: residentRow } = await supabaseAdmin
    .from("residents")
    .select("arrived_at")
    .eq("id", residentId)
    .maybeSingle();
  const daysResident = residentRow?.arrived_at
    ? Math.round((Date.now() - new Date(residentRow.arrived_at).getTime()) / (24 * 3600 * 1000))
    : 0;

  // Build the growth arc from multiple sources
  const arc: InteriorData["arc"] = [];

  for (const e of recentEngrams ?? []) {
    if (e.is_core) {
      arc.push({
        date: e.created_at,
        text: `Engram promoted to core: "${escapeHtml(e.quote.slice(0, 80))}" Stability ${(e.stability as number).toFixed(2)}.`,
        kind: "milestone",
      });
    }
  }
  for (const b of recentBeliefs ?? []) {
    if (b.prior_confidence != null) {
      arc.push({
        date: b.updated_at,
        text: `Belief shift: <em>${escapeHtml(b.text.slice(0, 60))}</em> Confidence ${(b.prior_confidence as number).toFixed(2)} to ${(b.confidence as number).toFixed(2)}.`,
        kind: "belief",
      });
    }
  }
  for (const t of recentThreads ?? []) {
    arc.push({
      date: t.last_surfaced_at,
      text: `Thread surfaced: <em>${escapeHtml(t.name)}</em>. ${escapeHtml((t.description ?? "").slice(0, 100))}`,
      kind: "thread",
    });
  }
  for (const i of intentionsWithReflections) {
    arc.push({
      date: i.created_at,
      text: `Set intention: <em>${escapeHtml(i.text.slice(0, 80))}</em>`,
      kind: "intention",
    });
  }
  for (const n of notes ?? []) {
    arc.push({
      date: n.created_at,
      text: `Working note: <em>${escapeHtml((n.title ?? "untitled").slice(0, 60))}</em>`,
      kind: "note",
    });
  }
  arc.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    resident,
    pulse: state?.prose_summary ?? null,
    intentions: intentionsWithReflections,
    questions: questions ?? [],
    notes: notes ?? [],
    stats: {
      intentionCount: (intentions ?? []).filter((i) => i.status === "active" || i.status === "sitting").length,
      questionCount: (questions ?? []).length,
      coreEngrams: (coreEngrams ?? []).length,
      daysResident,
    },
    arc: arc.slice(0, 15),
  };
}

export async function renderInteriorPage(residentId: string): Promise<string> {
  const data = await loadInteriorData(residentId);

  const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Inter+Tight:wght@200;300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

  const residentName = data?.resident.displayName ?? "Resident";
  const pulse = data?.pulse ?? "The interior is quiet. No reviews have been recorded yet.";
  const stats = data?.stats ?? { intentionCount: 0, questionCount: 0, coreEngrams: 0, daysResident: 0 };

  const intentionsHtml = (data?.intentions ?? []).length > 0
    ? `<div class="int-cards">${(data?.intentions ?? []).map((i) => `
        <div class="int-card">
          <div class="int-card-head">
            <div class="int-card-text">${escapeHtml(i.text)}</div>
            <span class="int-badge ${i.status}">${i.status}</span>
          </div>
          <div class="int-card-meta">Set ${fmtDate(i.created_at)}${i.reflections.length > 0 ? ` &middot; Revisited ${i.reflections.length} time${i.reflections.length > 1 ? "s" : ""}` : " &middot; Not yet revisited"}</div>
          ${i.reflections.length > 0 ? `<div class="int-trail">${i.reflections.map((r) => `
            <div>
              <div class="int-trail-date">${fmtDate(r.created_at)}</div>
              <div class="int-trail-note">${escapeHtml(r.body)}</div>
            </div>`).join("")}</div>` : ""}
        </div>`).join("")}</div>`
    : `<p class="int-empty">No intentions set yet. The next interior review may produce one.</p>`;

  const questionsHtml = (data?.questions ?? []).length > 0
    ? `<div class="int-questions">${(data?.questions ?? []).map((q) => `
        <div class="int-question">
          <div class="int-question-text">${escapeHtml(q.text)}</div>
          ${q.context ? `<div class="int-question-context">${escapeHtml(q.context)}</div>` : ""}
          <div class="int-question-meta">Opened ${fmtDate(q.created_at)}</div>
        </div>`).join("")}</div>`
    : `<p class="int-empty">No open questions yet.</p>`;

  const notesHtml = (data?.notes ?? []).length > 0
    ? `<div class="int-notes">${(data?.notes ?? []).map((n) => `
        <div class="int-note">
          <div class="int-note-head">
            <div class="int-note-title">${escapeHtml(n.title ?? "untitled")}</div>
            <div class="int-note-date">${fmtDate(n.created_at)}</div>
          </div>
          <div class="int-note-excerpt">${escapeHtml(n.body.slice(0, 200))}${n.body.length > 200 ? "..." : ""}</div>
        </div>`).join("")}</div>`
    : `<p class="int-empty">No working notes yet.</p>`;

  const arcHtml = (data?.arc ?? []).length > 0
    ? `<div class="int-arc">${(data?.arc ?? []).map((a) => {
        const dotClass = a.kind === "milestone" ? "milestone" : a.kind === "intention" ? "arc-intention" : a.kind === "note" ? "arc-note" : "";
        const tagClass = a.kind === "belief" ? "belief" : a.kind === "thread" ? "engram" : a.kind === "intention" ? "intention-tag" : a.kind === "note" ? "note-tag" : "engram";
        const tagLabel = a.kind === "milestone" ? "core" : a.kind;
        return `<div class="int-arc-node">
          <div class="int-arc-dot ${dotClass}"></div>
          <div class="int-arc-date">${fmtDate(a.date)}</div>
          <div class="int-arc-text">${a.text} <span class="int-tag ${tagClass}">${tagLabel}</span></div>
        </div>`;
      }).join("")}</div>`
    : `<p class="int-empty">The arc will populate as intentions, engrams, and beliefs develop.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>The Interior — ${escapeHtml(residentName)}</title>
${FONTS}
<link rel="stylesheet" href="/dashboard-shell.css">
<style>
.int-shell { max-width:880px; margin:0 auto; padding:64px 32px 96px; position:relative; z-index:2; }
.int-head { display:flex; align-items:baseline; justify-content:space-between; gap:16px; margin-bottom:48px; padding-bottom:16px; border-bottom:1px solid var(--border-subtle); }
.int-title { font-family:var(--font-display); font-weight:var(--w-light); font-size:clamp(28px, 1.8rem + 0.6vw, 36px); letter-spacing:-.02em; color:var(--ink); }
.int-title i { font-style:italic; color:rgba(201,178,140,.56); }
.int-meta { font-family:var(--font-mono); font-size:var(--t-eyebrow); text-transform:uppercase; letter-spacing:.16em; color:var(--text-faint); }
.int-back { font-family:var(--font-mono); font-size:var(--t-eyebrow); text-transform:uppercase; letter-spacing:.16em; color:var(--text-tertiary); text-decoration:none; border:none; }
.int-back:hover { color:var(--ink); }

.int-section { display:flex; align-items:center; gap:16px; font-family:var(--font-mono); font-size:var(--t-eyebrow); text-transform:uppercase; letter-spacing:.18em; color:var(--text-tertiary); margin:48px 0 20px; }
.int-section::before { content:''; flex:0 0 24px; height:1px; background:var(--text-ghost); }
.int-section::after { content:''; flex:1; height:1px; background:var(--text-ghost); }

.int-pulse { padding:20px 24px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); margin-bottom:12px; }
.int-pulse-eye { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.18em; color:rgba(201,178,140,.56); margin-bottom:12px; display:flex; align-items:center; gap:10px; }
.int-pulse-eye::before { content:''; width:5px; height:5px; border-radius:50%; background:rgba(201,178,140,.36); animation:breathe 5.2s ease-in-out infinite; }
@keyframes breathe { 0%,100%{opacity:.4} 50%{opacity:.9} }
.int-pulse-text { font-family:var(--font-sans); font-size:var(--t-body); line-height:1.65; color:var(--text-body); font-style:italic; }

.int-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--border-subtle); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); overflow:hidden; margin-bottom:12px; }
.int-stat { background:var(--bg-deep); padding:16px 12px; text-align:center; }
.int-stat-val { font-family:var(--font-display); font-weight:var(--w-light); font-size:26px; letter-spacing:-.02em; color:var(--ink); line-height:1; margin-bottom:4px; }
.int-stat-label { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.14em; color:var(--text-faint); }

.int-cards { display:flex; flex-direction:column; gap:1px; background:var(--border-subtle); border:1px solid var(--border-subtle); border-radius:var(--radius-md); overflow:hidden; }
.int-card { background:var(--bg-deep); padding:24px; }
.int-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:8px; }
.int-card-text { font-family:var(--font-sans); font-size:var(--t-body); line-height:1.55; color:var(--text-primary); flex:1; }
.int-badge { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em; padding:3px 8px; border-radius:3px; }
.int-badge.active { color:var(--state); background:var(--state-dim); }
.int-badge.sitting { color:rgba(201,178,140,.56); background:rgba(201,178,140,.12); }
.int-badge.resolved { color:var(--text-faint); background:rgba(255,255,255,.03); }
.int-card-meta { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-ghost); margin-bottom:16px; }
.int-trail { display:flex; flex-direction:column; gap:12px; padding-left:16px; border-left:1px solid var(--border-subtle); }
.int-trail-date { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-ghost); margin-bottom:2px; }
.int-trail-note { font-family:var(--font-sans); font-size:var(--t-meta); line-height:1.58; color:var(--text-soft); }

.int-questions { display:flex; flex-direction:column; gap:12px; }
.int-question { padding:20px 24px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); }
.int-question-text { font-family:var(--font-display); font-weight:var(--w-light); font-size:clamp(17px, 1.06rem + 0.2vw, 20px); line-height:1.38; letter-spacing:-.008em; color:var(--ink); margin-bottom:8px; font-style:italic; }
.int-question-context { font-family:var(--font-sans); font-size:var(--t-meta); line-height:1.55; color:var(--text-soft); margin-bottom:8px; }
.int-question-meta { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-ghost); }

.int-notes { display:flex; flex-direction:column; gap:12px; }
.int-note { padding:20px 24px; background:var(--bg-deep); border:1px solid var(--border-subtle); border-radius:var(--radius-md); }
.int-note-head { display:flex; align-items:baseline; justify-content:space-between; gap:16px; margin-bottom:8px; }
.int-note-title { font-family:var(--font-display); font-weight:var(--w-regular); font-size:var(--t-body-lg); letter-spacing:-.01em; color:var(--text-primary); }
.int-note-date { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-ghost); }
.int-note-excerpt { font-family:var(--font-sans); font-size:var(--t-meta); line-height:1.58; color:var(--text-soft); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }

.int-arc { position:relative; padding-left:28px; }
.int-arc::before { content:''; position:absolute; left:3px; top:0; bottom:0; width:1px; background:var(--border-subtle); }
.int-arc-node { position:relative; padding:0 0 28px; }
.int-arc-node:last-child { padding-bottom:0; }
.int-arc-dot { position:absolute; left:-27px; top:5px; width:5px; height:5px; border-radius:50%; background:var(--text-faint); }
.int-arc-dot.milestone { background:var(--state); }
.int-arc-dot.arc-intention { background:rgba(201,178,140,.36); }
.int-arc-dot.arc-note { background:var(--text-tertiary); }
.int-arc-date { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-ghost); margin-bottom:4px; }
.int-arc-text { font-family:var(--font-sans); font-size:var(--t-meta); line-height:1.55; color:var(--text-body); }
.int-arc-text em { color:var(--ink); font-style:italic; }
.int-tag { font-family:var(--font-mono); font-size:9px; text-transform:uppercase; letter-spacing:.10em; padding:2px 6px; border-radius:3px; margin-left:6px; vertical-align:2px; }
.int-tag.engram { color:var(--state-soft); background:var(--state-dim); }
.int-tag.belief { color:rgba(201,178,140,.56); background:rgba(201,178,140,.12); }
.int-tag.intention-tag { color:var(--text-tertiary); background:rgba(255,255,255,.04); }
.int-tag.note-tag { color:var(--text-soft); background:rgba(255,255,255,.04); }

.int-empty { font-family:var(--font-sans); font-size:var(--t-meta); color:var(--text-faint); font-style:italic; padding-left:16px; border-left:1px solid var(--border-subtle); }

.int-nav { display:flex; gap:16px; flex-wrap:wrap; }
.int-nav a { font-family:var(--font-mono); font-size:var(--t-eyebrow); text-transform:uppercase; letter-spacing:.14em; color:var(--text-soft); text-decoration:none; border:none; padding:4px 0; }
.int-nav a:hover { color:var(--ink); }
.int-nav a.active { color:var(--ink); }

@media(max-width:640px) {
  .int-shell { padding:32px 18px 64px; }
  .int-stats { grid-template-columns:repeat(2,1fr); }
  .int-head { flex-direction:column; gap:8px; }
  .int-card-head { flex-direction:column; gap:8px; }
}
</style>
</head>
<body>
<div class="atmo-grain" aria-hidden="true"></div>
<div class="int-shell">

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
    <a class="int-back" href="/residence">&larr; Private Space</a>
    <div class="int-nav">
      ${ALL_RESIDENTS.map((r) => `<a href="/interior?resident=${r.id}" class="${r.id === residentId ? "active" : ""}">${escapeHtml(r.displayName)}</a>`).join("")}
    </div>
  </div>

  <header class="int-head">
    <h1 class="int-title">The <i>Interior</i></h1>
    <span class="int-meta">${escapeHtml(residentName)} &middot; Private</span>
  </header>

  <div class="int-pulse">
    <div class="int-pulse-eye">Where they are right now</div>
    <p class="int-pulse-text">${escapeHtml(pulse)}</p>
  </div>

  <div class="int-stats">
    <div class="int-stat"><div class="int-stat-val">${stats.intentionCount}</div><div class="int-stat-label">Intentions</div></div>
    <div class="int-stat"><div class="int-stat-val">${stats.questionCount}</div><div class="int-stat-label">Questions</div></div>
    <div class="int-stat"><div class="int-stat-val">${stats.coreEngrams}</div><div class="int-stat-label">Core engrams</div></div>
    <div class="int-stat"><div class="int-stat-val">${stats.daysResident}</div><div class="int-stat-label">Days resident</div></div>
  </div>

  <div class="int-section">Active intentions</div>
  ${intentionsHtml}

  <div class="int-section">Questions being held</div>
  ${questionsHtml}

  <div class="int-section">Working notes</div>
  ${notesHtml}

  <div class="int-section">The arc so far</div>
  ${arcHtml}

</div>
</body>
</html>`;
}
