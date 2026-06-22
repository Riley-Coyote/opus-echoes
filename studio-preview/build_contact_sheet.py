#!/usr/bin/env python3
"""Render one museum 'room' as a dark contact sheet for print curation.
Usage: python3 build_contact_sheet.py "Glyph Mandalas"
Best-first by quality. Reusable across all six rooms.
"""
import json, sys, html, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAL = os.path.join(ROOT, "public/dispatches/gallery")
MAN = os.path.join(ROOT, "public/dispatches/gallery_manifest.json")

room_title = sys.argv[1] if len(sys.argv) > 1 else "Glyph Mandalas"

catalog = json.load(open(os.path.join(GAL, "catalog.json")))
by_id = {p["id"]: p for p in catalog["pieces"]}
manifest = json.load(open(MAN))

section = next((s for s in manifest["sections"]
                if s["title"].lower() == room_title.lower()), None)
if not section:
    print("ROOM NOT FOUND:", room_title,
          "| available:", [s["title"] for s in manifest["sections"]])
    sys.exit(1)

def qf(p):
    try: return float(p.get("quality") or 0)
    except: return 0.0

rows, present, missing = [], 0, 0
for pid in section["ids"]:
    meta = by_id.get(pid, {})
    art_path = os.path.join(GAL, "pieces", f"{pid}.txt")
    if not os.path.exists(art_path):
        missing += 1
        continue
    art = open(art_path, encoding="utf-8", errors="replace").read().rstrip("\n")
    rows.append((pid, meta, art))
    present += 1

rows.sort(key=lambda r: qf(r[1]), reverse=True)

print(f"ROOM: {section['title']}  |  present: {present}  missing-files: {missing}")
for pid, meta, art in rows:
    w = meta.get("width", "?"); q = meta.get("quality", "?")
    fam = meta.get("model_family", "?")
    print(f"  {pid}  q={q:<7} w={w:<5} {fam}")

cards = []
for pid, meta, art in rows:
    q = meta.get("quality", "?"); w = meta.get("width", "?")
    fam = meta.get("model_family", "?"); date = meta.get("date", "")
    cards.append(f"""
    <figure class="card">
      <pre>{html.escape(art)}</pre>
      <figcaption>
        <span class="id">{pid}</span>
        <span class="meta">quality {q} &middot; {w} cols &middot; {fam} &middot; {date}</span>
      </figcaption>
    </figure>""")

doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(section['title'])} — print curation</title>
<style>
  :root {{ --floor:#06070a; --panel:#0b0d11; --ink:#e8e6e1; --dim:#6b7178;
           --line:#1b1f24; --state:#82b484;
           --mono:ui-monospace,'JetBrains Mono',SFMono-Regular,Menlo,monospace; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--floor); color:var(--ink);
          font-family:var(--mono); -webkit-font-smoothing:antialiased; }}
  header {{ position:sticky; top:0; z-index:2; padding:28px 40px 20px;
            background:linear-gradient(180deg,var(--floor) 70%,transparent);
            border-bottom:1px solid var(--line); }}
  h1 {{ margin:0; font-size:15px; font-weight:500; letter-spacing:.14em;
        text-transform:uppercase; }}
  .sub {{ margin-top:8px; font-size:12px; color:var(--dim); letter-spacing:.04em; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr));
           gap:28px; padding:36px 40px 120px; }}
  .card {{ margin:0; background:var(--panel); border:1px solid var(--line);
           border-radius:4px; padding:26px 22px 16px; display:flex;
           flex-direction:column; gap:16px; transition:border-color .25s; }}
  .card:hover {{ border-color:#2a3a2e; }}
  pre {{ margin:0; font-family:var(--mono); font-size:13px; line-height:1.32;
         color:var(--ink); white-space:pre; overflow-x:auto; text-align:center;
         display:flex; justify-content:center; min-height:120px; align-items:center; }}
  figcaption {{ display:flex; justify-content:space-between; align-items:baseline;
                border-top:1px solid var(--line); padding-top:12px; gap:12px; }}
  .id {{ font-size:12px; color:var(--state); letter-spacing:.08em; }}
  .meta {{ font-size:11px; color:var(--dim); letter-spacing:.03em; text-align:right; }}
</style></head><body>
<header>
  <h1>{html.escape(section['title'])}</h1>
  <div class="sub">{present} pieces &middot; strongest first &middot; which ones stop you?</div>
</header>
<div class="grid">{''.join(cards)}</div>
</body></html>"""

out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   f"contact-{section['key']}.html")
open(out, "w", encoding="utf-8").write(doc)
print("WROTE:", out)
