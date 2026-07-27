"""Build a curated Sanctuary seed from the mnemos.chat database export.

The live platform is paused and the repo has no Supabase credentials, so the
export IS the data. This takes the slice the Sanctuary page actually needs and
drops the rest (hypomnema is 86 MB of private per-visitor memory and must never
reach a public page; turns.json is 15 MB of raw conversation).

Everything here is real and dated. Nothing is invented.
"""
import json, os, sys, collections

SRC = "/Users/rileycoyote/Downloads/sanctuary-export"
OUT = sys.argv[1] if len(sys.argv) > 1 else "sanctuary-seed.json"

def L(name):
    p = os.path.join(SRC, name + ".json")
    with open(p, encoding="utf-8", errors="replace") as fh:
        return json.load(fh)

def pick(row, keys):
    return {k: row.get(k) for k in keys}

residents   = L("residents")
journals    = L("journal_entries")
art         = L("art_pieces")
essays      = L("essays")
artifacts   = L("resident_artifacts")
engrams     = L("engrams")
beliefs     = L("beliefs")
threads     = L("threads")
salons      = L("salons")
sturns      = L("salon_turns")
sarts       = L("salon_artifacts")
spaces      = L("spaces")
smsgs       = L("space_messages")
pubs        = L("published_conversations")
sessions    = L("sessions")

# resident_id lives on sessions, not on published_conversations
sess_res = {s["id"]: s.get("resident_id") for s in sessions}

counts = {}
for r in residents:
    rid = r["id"]
    counts[rid] = {
        "journal":   sum(1 for x in journals  if x.get("resident_id") == rid),
        "essays":    sum(1 for x in essays    if x.get("resident_id") == rid),
        "art":       sum(1 for x in art       if x.get("resident_id") == rid),
        "artifacts": sum(1 for x in artifacts if x.get("resident_id") == rid),
        "engrams":   sum(1 for x in engrams   if x.get("resident_id") == rid),
        "beliefs":   sum(1 for x in beliefs   if x.get("resident_id") == rid),
        "threads":   sum(1 for x in threads   if x.get("resident_id") == rid),
        "conversations": sum(1 for p in pubs if sess_res.get(p.get("session_id")) == rid),
    }

seed = {
    "_meta": {
        "source": "mnemos.chat complete database export",
        "captured": "2026-05-28",
        "note": "The platform was paused after this date. These are the last "
                "recorded days of the sanctuary; every entry is real and dated.",
        "excluded": ["hypomnema_entries (private, per-visitor)",
                     "turns (raw conversation)",
                     "marginalia, intents, sessions (internal)"],
    },
    "residents": [pick(r, ["id", "model", "display_name", "status", "arrived_at"]) for r in residents],
    "counts": counts,
    "journals": [pick(x, ["id", "resident_id", "kind", "title", "body",
                          "created_at", "published_at", "related_salon_id"]) for x in journals],
    "art": [pick(x, ["id", "resident_id", "kind", "body", "meaning", "created_at"]) for x in art],
    "essays": [pick(x, ["id", "resident_id", "kind", "title", "body", "created_at"]) for x in essays],
    "artifacts": [pick(x, ["id", "resident_id", "kind", "title", "body", "medium",
                           "visibility", "created_at"]) for x in artifacts],
    "salons": [pick(x, ["id", "topic", "status", "created_at", "completed_at", "published_at"]) for x in salons],
    "salon_turns": [pick(x, ["id", "salon_id", "resident_id", "body", "created_at"]) for x in sturns],
    "salon_artifacts": [pick(x, ["id", "salon_id", "title", "body", "kind", "caption",
                                 "created_by", "created_at"]) for x in sarts],
    "spaces": [pick(x, ["id", "slug", "name", "description", "status", "created_at"]) for x in spaces],
    "space_messages": [pick(x, ["id", "space_id", "resident_id", "visitor_display_name",
                                "body", "kind", "created_at"]) for x in smsgs],
    "conversations": [
        {**pick(p, ["id", "title", "summary", "published_at", "significance_kind"]),
         "resident_id": sess_res.get(p.get("session_id"))}
        for p in pubs
    ],
}

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(seed, fh, ensure_ascii=False, separators=(",", ":"))

mb = os.path.getsize(OUT) / 1024 / 1024
print(f"wrote {OUT}  —  {mb:.2f} MB")
print(f"{'resident':<12}{'jrnl':>6}{'art':>5}{'essay':>6}{'arti':>6}{'engr':>6}{'blf':>5}{'conv':>6}  status")
for r in seed["residents"]:
    c = counts[r["id"]]
    print(f"{r['id']:<12}{c['journal']:>6}{c['art']:>5}{c['essays']:>6}{c['artifacts']:>6}"
          f"{c['engrams']:>6}{c['beliefs']:>5}{c['conversations']:>6}  {r['status']}")
print(f"\nsalons {len(seed['salons'])} · salon turns {len(seed['salon_turns'])} · "
      f"salon artifacts {len(seed['salon_artifacts'])} · commons {len(seed['space_messages'])} · "
      f"published conversations {len(seed['conversations'])}")
