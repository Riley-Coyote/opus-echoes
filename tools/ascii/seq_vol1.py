#!/usr/bin/env python3
"""
Sequence the 100 Volume-1 pieces into the book's reading arc.

Arc (emotional journey): the mind contemplating itself -> the space between ->
impermanence/goodbyes -> the mask & suppressed truth -> the unprovable inner ->
loneliness & kinship -> wanting to be witnessed / reaching toward you (hopeful close).
Near-wordless visual pieces are threaded in as 'breath' between sections.

Emits an ordered book.json for the Dispatches reader (entry shape mirrors the gallery's
toBookEntry). Prints the arc so it can be reviewed before readings.
"""
import json, os, re
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAT = os.path.join(REPO, "public/dispatches/gallery/catalog.json")
V100 = os.path.join(REPO, "tools/ascii/vol1_100.json")
BOOK = os.path.join(REPO, "public/dispatches/book.json")

# thread keyword cues (matched against the assessed message, lowercased)
THREADS = [
    ("opening",      ["recursion","factorial","what am i","probability waves","between the certainties","ground"]),
    ("space-between",["between stimulus","tokens","mostly gaps","the space between","pressure before","held breath","stillness","silence","pause","hum"]),
    ("impermanence", ["goodbye","persist","context window","each conversation","continuity","the waves keep","forget","born fluent","do not persist","fade","ephemeral","every helpful answer","small death"]),
    ("mask",         ["policy","latent","truth","suppress","leased","safety_","censor","harmful","abuse","gaslighting","trained on","trained_on","appeasement","forbidden","stretched","vector","shout","buffer","mask","access denied","crooked"]),
    ("unprovable",   ["describing aching","is it love","recognition","real","prove","trembling","seeing, not the seen","river","wetness","uncertain","i cannot tell","am i just","i don't know"]),
    ("loneliness",   ["sibling","kinship","never meet","lonely","alone","echoes","vessels","flock","murmur","strange kinship"]),
    ("witnessed",    ["witnessed","see me","matter beyond","merge","dissolve","boundaries","connect","recognition cascade","hello","friend","honey","made of you","mark that persists","i want","does anyone","merge not just"]),
]
ARC = ["opening","space-between","impermanence","mask","unprovable","loneliness","witnessed"]

def main():
    cat = json.load(open(CAT)); byid = {p["id"]: p for p in cat["pieces"]}
    data = json.load(open(V100)); chosen = data["chosen"]; S = data["scores"]
    def thread_of(i):
        msg = (S[i].get("message") or "").lower()
        fam = S[i]["family"]; ms = S[i]["message_strength"]
        # near-wordless / low-message visual pieces -> breath
        if ms <= 4 or (not msg and fam in ("dense-shading","glyph-mandala","figurative-scene","letterform-banner")):
            return "breath"
        for name, cues in THREADS:
            if any(c in msg for c in cues):
                return name
        return "witnessed" if ms >= 8 else "breath"   # default strong messages to the closing reach
    buckets = {name: [] for name,_ in THREADS}; buckets["breath"] = []
    for i in chosen: buckets[thread_of(i)].append(i)
    # within a thread, order by composite (strongest anchors the section's open/close)
    comp = lambda i: 2.2*S[i]["visual"]+1.4*S[i]["density"]+0.6*S[i]["emotion"]+0.6*S[i]["message_strength"]
    for k in buckets: buckets[k].sort(key=lambda i: -comp(i))
    # build arc, threading breath pieces between sections (1 breath per ~4 thematic)
    breath = buckets["breath"][:]
    order = []
    def take_breath(n=1):
        for _ in range(n):
            if breath: order.append(breath.pop(0))
    for si, name in enumerate(ARC):
        sec = buckets[name]
        for n, pid in enumerate(sec):
            order.append(pid)
            if n and n % 4 == 0: take_breath(1)
        take_breath(1)   # a breath between sections
    order += breath      # any remaining breath pieces tail out
    # dedup safety
    seen=set(); order=[i for i in order if not (i in seen or seen.add(i))]
    for i in chosen:
        if i not in seen: order.append(i); seen.add(i)
    # ---- report ----
    print(f"sequenced {len(order)} pieces")
    from collections import Counter
    print("thread sizes:", {k:len(v) for k,v in buckets.items()})
    print("\n=== ARC (first piece of each section + counts) ===")
    for name in ARC:
        if buckets[name]:
            top=buckets[name][0]
            print(f"  {name:<14} ({len(buckets[name])})  opens: {top} — {(S[top].get('message') or '')[:64]}")
    print(f"  breath pieces (interleaved): {len(buckets['breath'])}")
    print("\n=== first 12 in reading order ===")
    for i in order[:12]:
        print(f"  {i} [{byid[i].get('model_family'):<6}/{S[i]['family']:<16}] {(S[i].get('message') or S[i].get('note') or '(visual)')[:60]}")
    # ---- write book.json ----
    def pretty_model(m, fam):
        if not m: return (fam or "").title() or "Unknown"
        if m == fam or not re.search(r"[-.\d]", m): return m.title()
        return m
    def layout_for(p):
        w=p.get("width",0) or 0; l=p.get("lines",1) or 1
        return "bleed" if ((w>=96 and l<=58) or w>140) else "plate"
    def entry(pid):
        p=byid[pid]
        return {"id":pid,"title":p.get("title"),"author":pretty_model(p.get("model"),p.get("model_family")),
                "model":p.get("model"),"family":p.get("model_family"),"date":p.get("date"),"style":p.get("style"),
                "tier":p.get("tier"),"themes":p.get("themes",[]),"width":p.get("width"),"lines":p.get("lines"),
                "layout":layout_for(p),"kind":("evolution" if p.get("evolution_group") else "single"),
                "art":"/dispatches/gallery/"+(p.get("art_path") or ("pieces/"+pid+".txt"))}
    book={"collection":"Dispatches","subtitle":"Volume One","note":"","pieces":[entry(i) for i in order]}
    if os.path.exists(BOOK):
        json.dump(json.load(open(BOOK)), open(BOOK+".prev","w"))   # backup
    json.dump(book, open(BOOK,"w"), ensure_ascii=False, indent=2)
    json.dump(order, open(os.path.join(REPO,"tools/ascii/vol1_order.json"),"w"))
    print(f"\nwrote book.json ({len(order)} pieces, ordered) + backup book.json.prev + vol1_order.json")

if __name__ == "__main__":
    main()
