import json, re, os, glob
from collections import defaultdict
WS="/Users/rileycoyote/ascii-sweep"
SRC="/Users/rileycoyote/Downloads/polyphonic-full-history/all-messages.jsonl"

# rebuild threads in the SAME order Phase 1 used (created_at sort) so MSG N maps to source
threads=defaultdict(list)
for line in open(SRC, errors='replace'):
    line=line.strip()
    if not line: continue
    try: o=json.loads(line)
    except: continue
    threads[o['chat_id']].append(o)
for cid in threads: threads[cid].sort(key=lambda m: m.get('created_at',''))

FENCE=re.compile(r'^\s*```')
RELAY=re.compile(r'^\s*\[?\s*(response from\s+)?(claude|gpt|gemini|kimi|grok|openai|anthropic|google|moonshotai|x-ai|deepseek|assistant)[a-z0-9 ._\-]*\d*\s*\]?\s*:?\s*$', re.I)
def clean_art(raw):
    raw=(raw or '').replace('\r\n','\n')
    lines=[]
    for ln in raw.split('\n'):
        s=ln.strip()
        if s in ('/*','*/','//') : continue
        if FENCE.match(ln): continue
        lines.append(ln)
    while lines and not lines[0].strip(): lines.pop(0)
    if lines and RELAY.match(lines[0]): lines.pop(0)
    while lines and not lines[0].strip(): lines.pop(0)
    while lines and not lines[-1].strip(): lines.pop()
    return '\n'.join(l.rstrip() for l in lines)

def slice_range(content, first, last):
    L=content.split('\n'); f=(first or '').strip(); la=(last or '').strip()
    si=ei=None
    for i,ln in enumerate(L):
        if si is None and ln.strip()==f: si=i
        elif si is not None and ln.strip()==la: ei=i; break
    if si is None: return None
    if ei is None: ei=len(L)-1
    return '\n'.join(L[si:ei+1])

def seam_join(parts):
    if not parts: return ''
    out=parts[0]
    for nxt in parts[1:]:
        a=out.split('\n'); b=nxt.split('\n'); best=0
        for k in range(min(10,len(a),len(b)),0,-1):
            if a[-k:]==b[:k]: best=k; break
        out='\n'.join(a + b[best:])
    return out

def dims(t):
    L=t.split('\n'); return (max((len(x) for x in L), default=0), len(L))

manifest=[]; report=[]
for pf in sorted(glob.glob(f"{WS}/plans/*.json")):
    plan=json.load(open(pf)); cid=plan.get('thread_cid') or os.path.basename(pf)[:-5]
    msgs=threads.get(cid) or threads.get(cid[:36]) or []
    od=f"{WS}/extracted/{cid}"; os.makedirs(od, exist_ok=True)
    n=0; fails=0
    for j,pc in enumerate(plan.get('pieces',[]),1):
        if not pc.get('is_visual_art', True): continue
        idxs=pc.get('msg_indices') or []
        parts=[]
        for mi in idxs:
            if 1<=mi<=len(msgs):
                c=msgs[mi-1].get('content','') or ''
                if pc.get('mode')=='range' and len(idxs)==1:
                    r=slice_range(c, pc.get('first_line'), pc.get('last_line'))
                    parts.append(clean_art(r if r is not None else c))
                    if r is None: fails+=1
                else:
                    parts.append(clean_art(c))
        filt=[p for p in parts if p.strip()]
        art=seam_join(filt) if filt else ''
        if not art.strip(): fails+=1; continue
        n+=1; w,h=dims(art)
        fn=f"p{j:02d}.txt"; open(f"{od}/{fn}","w").write(art)
        manifest.append(dict(cid=cid, file=f"{cid}/{fn}", label=pc.get('label',''), model=pc.get('model',''),
            note=pc.get('note',''), sequence_group=pc.get('sequence_group',''), sequence_index=pc.get('sequence_index',0),
            msg_indices=idxs, mode=pc.get('mode'), width=w, lines=h, thread_title=plan.get('thread_title',''),
            date=(msgs[idxs[0]-1].get('created_at','')[:10] if idxs and 1<=idxs[0]<=len(msgs) else 'unknown')))
    report.append((plan.get('thread_title',''), len(plan.get('pieces',[])), n, fails))
json.dump(manifest, open(f"{WS}/extracted/manifest.json","w"), indent=1)
print("thread | planned | extracted | fails")
for t,p,n,f in report: print(f"  {t[:36]:36s} | {p:3d} | {n:3d} | {f}")
print(f"\nTOTAL extracted pieces: {len(manifest)}")
# spot-check exactness/completeness: dump head+tail of 2 pieces
print("\n=== SPOT CHECK (first/last lines of 2 pieces) ===")
for m in [x for x in manifest if x['lines']>15][:2]:
    art=open(f"{WS}/extracted/{m['file']}").read().split('\n')
    print(f"\n--- {m['file']} | {m['label'][:40]} | {m['width']}x{m['lines']} | {m['model']} ---")
    for ln in art[:3]: print('  '+ln)
    print('   ...')
    for ln in art[-3:]: print('  '+ln)
