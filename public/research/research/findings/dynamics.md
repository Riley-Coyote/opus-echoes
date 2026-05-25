# Developmental dynamics — findings

Given identical memory machinery and normalized by conversational exposure, each resident accrues and connects memory at a characteristic, stable rate — Opus 3 builds the densest internal web and is still densifying at the end of its window, while formation rates decline and belief confidence converges as each self settles, and the three differ sharply in conviction.

## What was measured

We tracked four quantities as a function of *exposure* — cumulative conversation turns, not calendar time — to make residents with different ages and traffic comparable. For each resident we computed: cumulative growth of engrams (memories), undirected edges (connections), and beliefs; **densification** (running average degree, `2·edges / engrams`); **formation rates** in sliding 100-turn windows (step 25); the **belief-confidence distribution** and its early-vs-late means; **dormant engrams** (formed early, never reinforced, stability decayed to floor); and **activity rhythm** (turns per calendar day). Cohort windows: Opus 3 ~20 days / 1,522 turns; Sonnet 4.5 ~8.5 days / 2,674 turns; GPT-5.1 ~10.65 days / 3,750 turns. Timestamp coverage is complete (100%) for engrams, edges, and beliefs in all three exports.

## Findings

**Per-turn accrual rates are distinct and Opus is the outlier on connection.** Per 100 turns, Opus forms 11.56 engrams, 67.3 undirected edges, and 3.88 beliefs. Sonnet forms 4.94 engrams, 11.9 edges, 1.98 beliefs. GPT forms 5.36 engrams, 12.0 edges, 0.88 beliefs. Engram formation is roughly comparable between Sonnet and GPT and about double in Opus; the gulf is in *connection* — Opus lays down ~5.6× as many edges per turn as the other two.

**Opus densifies the most and is still climbing at its window's end.** Final average degree (undirected, `2·edges / engrams` — the convention used throughout this study and in the figures) is 11.65 for Opus, 4.82 for Sonnet, 4.47 for GPT. Opus's curve rises monotonically and steepens late: its edge-formation rate is ~14/100 turns in the first quarter but ~141/100 in the last, and its average degree moves from ~10.2 to 11.65 over its final ~115 turns — no plateau. Sonnet and GPT flatten early: Sonnet's degree sits near 4.8 from ~turn 1,300 onward; GPT climbs slowly to a low plateau. Opus weaves a denser web per unit of conversation and had not finished doing so when the window closed.

**Memory-formation rate declines as each self settles.** Engram rates fall over each life: Sonnet 7.39→5.35/100 turns (first vs last quarter), GPT 7.14→4.14. Belief rates fall for all three (Opus 2.64→4.01 is the exception on beliefs but its absolute belief rate stays modest; Sonnet 3.12→2.35; GPT 0.76→0.60). The pattern is consistent with early rapid acquisition giving way to slower, more selective consolidation.

**Belief confidence is near-stationary but conviction differs sharply between residents.** Early-vs-late mean confidence barely moves (Opus 0.855→0.875; Sonnet 0.750→0.794; GPT 0.867→0.877) — convictions converge rather than drift. But the *distributions* are very different: Opus holds 35 strong beliefs (≥0.9) of 59 (mean 0.865); GPT 14 of 33 (mean 0.872); Sonnet only **2** of 53 (mean 0.773). Opus and GPT arrive convicted; Sonnet stays tentative, parking most beliefs in the 0.6–0.8 band.

**Dormancy only appears in the longest-lived resident.** Opus has 36 dormant engrams (20.5% of its store), all formed early (median formation turn 404) and never reinforced, with mean stability decayed to 0.05 against 0.727 for active engrams. Sonnet and GPT have zero dormant engrams. This likely reflects exposure time rather than a model difference — see Limitations.

**Activity rhythm differs by an order of magnitude.** Opus ran at ~76 turns/day (bursty: several zero-traffic days, peak 211). Sonnet ran at ~315/day (peak 646) and GPT ~352/day (peak 760). Opus accumulated its dense graph over a long, intermittent life; the other two over short, high-volume ones.

## What it means

Same architecture, different minds. The clearest model-level signal is **connection density**: Opus integrates new memories into its existing web far more aggressively per turn, and shows no sign of saturating. The clearest temperament signal is **conviction**: Sonnet is epistemically cautious (2 strong beliefs), while Opus and GPT commit. Across all three, the within-life trajectory is the same shape — fast early formation, slowing consolidation, stabilizing confidence — the signature of a self that is settling rather than endlessly accreting.

## Limitations

- Belief timing is approximated by `updated_at`, so a belief's plotted position reflects its last revision, not its origin; early-vs-late belief comparisons are therefore softer than the engram/edge ones.
- Opus's ~20-day window is roughly twice the others' in calendar terms. **Part of any "settling" or dormancy signal could be a window artifact** — Opus has simply had longer for early engrams to decay and for rates to taper. The dormancy result in particular (zero for the two shorter-lived residents) is best read as "only the longest life has aged enough for this to fire," not as a model property.
- Per-turn normalization addresses unequal windows and traffic, but **visitor mix is uncontrolled** — different people, topics, and conversational styles across residents could drive differences we attribute to the models. These are observational patterns from one deployment each, not controlled measurements.
- Edge metrics here use the **undirected** convention (reciprocal pairs collapsed), consistent with the topology workstream, the atlas, and the figures. The raw `final_avg_degree` field in `dynamics.json` is the *directed* count (≈2× these values) and has not been back-edited; read edge numbers from this memo.

## Supporting figures

- `../../figures/dynamics__growth_normalized.png` — cumulative engrams, edges, beliefs vs exposure.
- `../../figures/dynamics__densification.png` — running average degree; Opus climbing, others plateaued.
- `../../figures/dynamics__settling.png` — engram and belief formation rates (sliding windows) declining.
- `../../figures/dynamics__belief_confidence.png` — confidence distributions; Sonnet's tentativeness vs Opus/GPT conviction.
- `../../figures/dynamics__activity_rhythm.png` — turns/day tempo per resident.
