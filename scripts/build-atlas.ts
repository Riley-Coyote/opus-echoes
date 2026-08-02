/**
 * THE ATLAS — one page that shows every environment we have built, wherever it lives.
 *
 * The scenes were scattered across four branches and two working copies, which is
 * why they were unfindable: a static server only serves the branch that happens to
 * be checked out, so an index alone could never have reached them. This gathers
 * every unique scene out of every branch into public/atlas/ and builds a contact
 * sheet over them with live previews.
 *
 *   bun run atlas
 *
 * Re-run it any time. It is idempotent, and it reads git rather than the working
 * tree, so it picks up scenes on branches you do not have checked out.
 *
 * NOTE ON ASSETS: two scenes (lit-room, sanctuary-grounds) reference the LimeZu
 * tiles at /phase-two/lz/, which are PAID and gitignored on purpose. They are on
 * disk in public/phase-two/lz/ and resolve by absolute path from anywhere under
 * public/, so the atlas copies do work — but they will be blank in any checkout
 * that does not have the tiles.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { createHash } from "node:crypto";

const OUT = "public/atlas";
const BRANCHES = [
  "sanctuary-v2", "feat/sanctuary-v2-notebook", "codex/mnemos-chat-checkpoint-2026-07-19",
  "feat/phase-two-D", "feat/lit-room", "feat/sanctuary-grounds", "main",
];

/* `--` on every rev-taking call: this repo has a DIRECTORY named sanctuary-v2 as
   well as a BRANCH named sanctuary-v2, and without the separator git refuses the
   argument as ambiguous — which silently emptied the date on every scene from
   that branch rather than failing loudly. */
const git = (...a: string[]) => execFileSync("git", a, { maxBuffer: 1 << 28 });
const gitText = (...a: string[]) => { try { return git(...a).toString(); } catch { return ""; } };

type Rec = {
  group: string; name: string; branch: string; src: string; date: string;
  title: string; lines: number; bytes: number; also: string[]; feeds: string[];
};

/* Grouping mirrors how the work actually happened, not the folder names: the flow
   mockups are one set, the phase-D plates another, the archive is superseded work
   that is kept because it is the record of how the room got here. */
const groupFor = (p: string) =>
  /\/flow\//.test(p) ? "flow"
  : /\/plates\//.test(p) ? "plates"
  : /\/world\//.test(p) ? "world"
  : /\/archive\//.test(p) ? "archive"
  : /draft/.test(p) ? "drafts"
  : "scenes";

const GROUP_NOTE: Record<string, string> = {
  scenes:  "The environments themselves — the rooms and landings that were built to be looked at.",
  flow:    "The whole site as flow mockups: every surface, drawn once, as one connected walk-through.",
  plates:  "Phase-D direction plates — the arguments about what the place should feel like.",
  world:   "The grounds, seen wide.",
  archive: "Superseded, kept on purpose. This is how the room got to where it is.",
  drafts:  "Working drafts. Rough by intent.",
};
const ORDER = ["scenes", "world", "flow", "plates", "drafts", "archive"];

const seen = new Map<string, Rec>();
const recs: Rec[] = [];

for (const b of BRANCHES) {
  const listed = gitText("ls-tree", "-r", "--name-only", b, "--").split("\n");
  const files = listed.filter((f) => /phase-two\/.*\.(html|css|js|json)$/.test(f));
  if (!files.length) continue;
  const date = gitText("log", "-1", "--format=%ad", "--date=short", b, "--").trim();
  for (const p of files) {
    let blob: Buffer;
    try { blob = git("show", `${b}:${p}`); } catch { continue; }
    if (!blob.length) continue;
    const name = basename(p), group = groupFor(p), key = `${group}/${name}`;
    const prior = seen.get(key);
    if (prior) {
      const h = createHash("sha1").update(blob).digest("hex");
      if (h !== createHash("sha1").update(git("show", `${prior.branch}:${prior.src}`)).digest("hex")
          && !prior.also.includes(b)) prior.also.push(`${b} (differs)`);
      else if (!prior.also.includes(b)) prior.also.push(b);
      continue;
    }
    const title = name.endsWith(".html")
      ? (blob.toString("utf8").match(/<title>([^<]*)/i)?.[1] ?? "").trim() : "";
    /* Some scenes were built against live endpoints and fetch them at boot. The
       atlas copies are static, so those calls 404 and the scene renders its chrome
       with nothing in it. That is not a broken scene and it should not look like
       one — flag it on the card instead. */
    const text = blob.toString("utf8");
    const feeds = [...new Set([...text.matchAll(/fetch\(\s*[`'"](\/[^`'"?]*)/g)].map((m) => m[1]))];
    const rec: Rec = { group, name, branch: b, src: p, date, title, feeds,
                       lines: text.split("\n").length, bytes: blob.length, also: [] };
    seen.set(key, rec); recs.push(rec);
    const out = join(OUT, group, name);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, blob);
  }
}

const scenes = recs.filter((r) => r.name.endsWith(".html"));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const kb = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);
const tilesPresent = existsSync("public/phase-two/lz");

const card = (r: Rec) => `
    <a class="c" href="/atlas/${r.group}/${encodeURIComponent(r.name)}" target="_blank" rel="noopener">
      <div class="pv" data-src="/atlas/${r.group}/${encodeURIComponent(r.name)}"><span class="ph">preview</span></div>
      <div class="m">
        <b>${esc(r.title || r.name)}</b>
        <i>${esc(r.name)}</i>
        <span class="t"><em>${esc(r.branch.replace(/^origin\//, ""))}</em>${r.date} · ${r.lines} lines · ${kb(r.bytes)}${r.also.length ? ` · also on ${r.also.length} more` : ""}</span>
        ${r.feeds.length ? `<span class="t live">needs live data — ${r.feeds.map(esc).join(" ")}</span>` : ""}
      </div>
    </a>`;

const sections = ORDER.filter((g) => scenes.some((s) => s.group === g)).map((g) => {
  const inGroup = scenes.filter((s) => s.group === g);
  return `
  <section>
    <h2>${g} <span>${inGroup.length}</span></h2>
    <p class="note">${esc(GROUP_NOTE[g] ?? "")}</p>
    <div class="grid">${inGroup.map(card).join("")}</div>
  </section>`;
}).join("");

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Atlas — every environment, one page</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@200;300&family=Inter:wght@300;400&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
  :root{--floor:#06070a;--ink:#e8e6e3;--soft:#9b9792;--ghost:#5d5a57;--rule:#1b1d22;--lit:#2a2d34}
  *{box-sizing:border-box}
  body{margin:0;background:var(--floor);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1440px;margin:0 auto;padding:0 30px}
  header{padding:64px 0 12px;border-bottom:1px solid var(--rule)}
  h1{margin:0;font-family:"Inter Tight",Inter,sans-serif;font-weight:200;font-size:clamp(34px,4.6vw,54px);letter-spacing:-.028em;line-height:1}
  .lede{margin:16px 0 0;max-width:64ch;color:var(--soft);font-size:14.5px;line-height:1.75}
  .lede b{color:var(--ink);font-weight:400}
  .warn{margin:18px 0 30px;padding:11px 14px;border:1px solid var(--rule);border-left:2px solid #8a6a3a;
        font-family:"JetBrains Mono",monospace;font-size:11px;line-height:1.7;color:var(--soft);max-width:78ch}
  section{padding:46px 0 8px;border-bottom:1px solid var(--rule)}
  h2{margin:0;font-family:"JetBrains Mono",monospace;font-weight:400;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--soft)}
  h2 span{color:var(--ghost);margin-left:10px}
  .note{margin:9px 0 26px;color:var(--ghost);font-size:13.5px;line-height:1.65;max-width:70ch}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:22px;padding-bottom:34px}
  .c{display:block;text-decoration:none;color:inherit;border:1px solid var(--rule);background:#080910;transition:border-color .25s,transform .25s}
  .c:hover{border-color:var(--lit);transform:translateY(-2px)}
  .pv{position:relative;aspect-ratio:16/10;overflow:hidden;background:#04050a;border-bottom:1px solid var(--rule)}
  .pv iframe{position:absolute;top:0;left:0;width:1440px;height:900px;border:0;transform-origin:0 0;pointer-events:none}
  .ph{position:absolute;inset:0;display:grid;place-items:center;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#26282f}
  /* the placeholder is only for the gap before the frame mounts; once it has,
     it was painting the word PREVIEW across the middle of every scene */
  .pv:has(iframe) .ph{display:none}
  .m{padding:14px 15px 16px}
  .m b{display:block;font-weight:400;font-size:15px;line-height:1.3;letter-spacing:-.008em}
  .m i{display:block;margin-top:5px;font-style:normal;font-family:"JetBrains Mono",monospace;font-size:10.5px;color:var(--ghost)}
  .m .t{display:block;margin-top:11px;font-family:"JetBrains Mono",monospace;font-size:10px;line-height:1.7;color:var(--ghost)}
  .m .t em{display:inline-block;font-style:normal;margin-right:8px;padding:2px 6px;border:1px solid var(--rule);color:var(--soft)}
  /* built against endpoints this branch does not serve — empty, not broken */
  .m .t.live{margin-top:6px;color:#8a6a3a}
  footer{padding:40px 0 80px;font-family:"JetBrains Mono",monospace;font-size:10.5px;line-height:1.9;color:var(--ghost)}
</style></head>
<body><div class="wrap">
<header>
  <h1>The Atlas</h1>
  <p class="lede">Every environment built for the Sanctuary, gathered into one place. They were spread across <b>four git branches and two working copies</b> — which is why they were hard to find: a static server only serves the branch it has checked out, so no index could have reached them where they lay. This copies each one here.</p>
  <p class="lede" style="margin-top:12px">Generated by <b>bun run atlas</b> straight from git. Re-run it any time; it reads branches you do not have checked out.</p>
</header>
${tilesPresent ? "" : `<p class="warn">The LimeZu tiles at public/phase-two/lz/ are missing from this checkout. They are paid assets and gitignored on purpose, so <b>lit-room</b> and <b>sanctuary-grounds</b> will render blank here.</p>`}
${sections}
<footer>
  ${scenes.length} scenes · sources: ${BRANCHES.join(" · ")}<br>
  Previews mount only while on screen, so 30-odd animating canvases never run at once.
</footer>
</div>
<script>
/* Mount a preview only while its card is near the viewport and unmount it after,
   because most of these are animating canvases and thirty of them running at once
   makes the page unusable. Widest card is ~460px, so the 1440px frame is scaled
   down to fit rather than the scene being asked to reflow. */
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const box = e.target;
    if (e.isIntersecting && !box.firstElementChild.matches("iframe")) {
      const f = document.createElement("iframe");
      f.loading = "lazy"; f.setAttribute("scrolling", "no"); f.src = box.dataset.src;
      f.style.transform = "scale(" + (box.clientWidth / 1440) + ")";
      box.prepend(f);
    } else if (!e.isIntersecting) {
      const f = box.querySelector("iframe");
      if (f) f.remove();
    }
  }
}, { rootMargin: "300px 0px" });
document.querySelectorAll(".pv").forEach((p) => io.observe(p));
addEventListener("resize", () => document.querySelectorAll(".pv iframe").forEach((f) => {
  f.style.transform = "scale(" + (f.parentElement.clientWidth / 1440) + ")";
}));
</script>
</body></html>
`;

writeFileSync(join(OUT, "index.html"), page);
writeFileSync(join(OUT, "_manifest.json"), JSON.stringify(recs, null, 1));

console.log(`atlas · ${scenes.length} scenes, ${recs.length} files -> ${OUT}/index.html`);
for (const g of ORDER) {
  const n = scenes.filter((s) => s.group === g).length;
  if (n) console.log(`  ${g.padEnd(9)} ${n}`);
}
if (!tilesPresent) console.log("  ! public/phase-two/lz missing — two scenes will render blank");
