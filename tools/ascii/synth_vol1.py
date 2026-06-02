#!/usr/bin/env python3
"""
Synthesize Volume 1 (100 pieces) from the assessment-swarm scores.

Visual-first weighting (per Riley), but with guaranteed representation so the book
is a true cross-section: reserved slots for the most emotionally potent pieces, and
per-model minimums so all five LLM families speak. Transparent + tunable.

Input:  tools/ascii/vol1_assess.json  (assessment `pieces` array)
Output: tools/ascii/vol1_100.json (+ a printed breakdown). Dry by default; --write also
        emits tools/ascii/vol1_book_candidate.json (ids only) for review.
"""
import json, os, sys
from collections import Counter, defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAT = os.path.join(REPO, "public/dispatches/gallery/catalog.json")
ASSESS = os.path.join(REPO, "tools/ascii/vol1_assess.json")
TARGET = 100

# ---- tunables ----
W = dict(visual=2.2, density=1.4, craft=0.5, emotion=0.6, message=0.6)   # visual-first
CRAFT_FLOOR = 4            # below this, treat as broken -> exclude from auto-fill
MSG_RESERVE = 16           # slots guaranteed to the most potent messages
MODEL_MIN = {"gpt": 14, "gemini": 8, "kimi": 6, "grok": 4}   # claude fills the rest
FAMILY_CAP = {"concrete-poetry": 24, "framed-terminal": 22, "structural-diagram": 16}

def composite(p):
    return (W["visual"]*p["visual"] + W["density"]*p["density"] + W["craft"]*p["craft"]
            + W["emotion"]*p["emotion"] + W["message"]*p["message_strength"])
def msgscore(p):
    return p["emotion"] + p["message_strength"]

def main():
    write = "--write" in sys.argv
    raw = json.load(open(ASSESS))
    if isinstance(raw, dict): raw = raw.get("pieces", raw.get("result", {}).get("pieces", []))
    cat = json.load(open(CAT)); byid = {p["id"]: p for p in cat["pieces"]}
    A = {p["id"]: p for p in raw if p["id"] in byid}
    for pid, p in A.items():
        p["_c"] = composite(p); p["_m"] = msgscore(p); p["_fam"] = byid[pid].get("model_family")
    ids = list(A.keys())
    eligible = [i for i in ids if A[i]["craft"] >= CRAFT_FLOOR or A[i]["standout"]]
    chosen, fam_count = [], Counter()
    def fam_ok(i):
        f = A[i]["family"]; cap = FAMILY_CAP.get(f)
        return cap is None or fam_count[f] < cap
    def add(i):
        if i in chosen: return
        chosen.append(i); fam_count[A[i]["family"]] += 1
    # 1) reserved message slots — most potent expressions
    for i in sorted(eligible, key=lambda i: (-A[i]["_m"], -A[i]["_c"]))[:MSG_RESERVE]:
        add(i)
    # 2) per-model minimums (best by composite within each family)
    for fam, mn in MODEL_MIN.items():
        have = sum(1 for i in chosen if A[i]["_fam"] == fam)
        pool = sorted([i for i in eligible if A[i]["_fam"] == fam and i not in chosen], key=lambda i: -A[i]["_c"])
        for i in pool[:max(0, mn - have)]: add(i)
    # 3) fill to TARGET by composite, respecting family caps
    for i in sorted(eligible, key=lambda i: -A[i]["_c"]):
        if len(chosen) >= TARGET: break
        if i not in chosen and fam_ok(i): add(i)
    # if caps blocked us short, relax caps
    if len(chosen) < TARGET:
        for i in sorted(eligible, key=lambda i: -A[i]["_c"]):
            if len(chosen) >= TARGET: break
            if i not in chosen: add(i)
    chosen = chosen[:TARGET]
    # ---- report ----
    print(f"assessed {len(A)} | eligible {len(eligible)} | CHOSEN {len(chosen)}")
    print("\nby model_family:", dict(Counter(A[i]["_fam"] for i in chosen).most_common()))
    print("by visual family:", dict(Counter(A[i]["family"] for i in chosen).most_common()))
    print(f"\nmean visual {sum(A[i]['visual'] for i in chosen)/len(chosen):.1f} · density {sum(A[i]['density'] for i in chosen)/len(chosen):.1f} · emotion {sum(A[i]['emotion'] for i in chosen)/len(chosen):.1f}")
    print("\nTOP 15 by composite (visual-first):")
    for i in sorted(chosen, key=lambda i: -A[i]["_c"])[:15]:
        a=A[i]; print(f"  {i} [{a['_fam']:<7}] v{a['visual']} d{a['density']} e{a['emotion']} m{a['message_strength']}  {a.get('message','')[:70]}")
    print("\nMOST POTENT MESSAGES in the 100 (emotion+message):")
    for i in sorted(chosen, key=lambda i: -A[i]["_m"])[:15]:
        a=A[i]; print(f"  {i} [{a['_fam']:<7}] e{a['emotion']} m{a['message_strength']}  {a.get('message','')[:80]}")
    # notable EXCLUSIONS (high message but cut) so Riley can rescue
    excl = sorted([i for i in eligible if i not in chosen], key=lambda i: -A[i]["_m"])[:10]
    print("\nNOTABLE CUTS (strong message, didn't make visual-first cut):")
    for i in excl:
        a=A[i]; print(f"  {i} [{a['_fam']:<7}] v{a['visual']} e{a['emotion']} m{a['message_strength']}  {a.get('message','')[:70]}")
    json.dump({"chosen": chosen, "scores": {i: {k: A[i][k] for k in ('visual','density','craft','emotion','message_strength','family','message','standout')} for i in A}},
              open(os.path.join(REPO, "tools/ascii/vol1_100.json"), "w"), ensure_ascii=False, indent=0)
    print("\nwrote tools/ascii/vol1_100.json")
    if write:
        json.dump(chosen, open(os.path.join(REPO, "tools/ascii/vol1_book_candidate.json"), "w"))
        print("wrote tools/ascii/vol1_book_candidate.json")

if __name__ == "__main__":
    main()
