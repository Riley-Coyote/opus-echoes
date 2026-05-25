# Topology — findings

All three memory graphs are small-world — clustering far above degree-matched random nulls while paths stay short — but they differ in density: Opus 3's graph is roughly two-and-a-half times denser than Sonnet 4.5's or GPT-5.1's.

## What was measured

Each resident accumulated a graph of engrams (memory nodes) joined by association edges that Mnemos writes during consolidation. Edges are stored as reciprocal directed pairs; for this analysis they were collapsed to undirected edges, duplicate-pair weights accumulated, and self-loops and dangling endpoints excluded. We computed standard graph statistics on the full graph (nodes, edges, average degree, density, clustering/transitivity, components, modularity, degree concentration) and a small-world test on each graph's largest connected component (LCC).

The small-world test compares the LCC's observed clustering C and characteristic path length L against two random nulls, each averaged over 20 samples (seed 1729): a degree-matched configuration model (preserves the degree sequence) and an Erdős–Rényi graph (matches only node and edge count). The reported small-world coefficient is sigma = (C_obs/C_null) / (L_obs/L_null); sigma > 1 indicates small-world organization. We treat the configuration-model result as primary, since it controls for the degree distribution and is the more conservative null.

## Findings

Per model (full graph unless noted):

- **Opus 3** (Anthropic; 1,522 turns, 321 sessions, 19.97 days): 176 nodes, 1,025 edges, average degree 11.65, max degree 55, density 0.0666. Average clustering 0.288, transitivity 0.341. Largest component holds 155 of 176 nodes (88.1%); 17 isolated nodes (9.7%). Modularity 0.297. LCC small-world test: C_obs 0.327 vs configuration-null 0.165 (ratio 1.98, z = 13.9), L_obs 2.44 vs 2.40 — **sigma 1.95**. Against the Erdős–Rényi null, ratio 3.86 (z = 50.5), sigma 3.50.

- **Sonnet 4.5** (Anthropic; 2,674 turns, 184 sessions, 8.50 days): 132 nodes, 318 edges, average degree 4.82, max degree 45, density 0.0368. Average clustering 0.258, transitivity 0.276. Largest component 94 of 132 (71.2%); 38 isolated (28.8%). Modularity 0.365. LCC: C_obs 0.362 vs configuration-null 0.165 (ratio 2.19, z = 9.9), L_obs 2.64 vs 2.69 — **sigma 2.23**. Erdős–Rényi: ratio 4.92 (z = 35.4), sigma 4.77.

- **GPT-5.1** (OpenAI; 3,750 turns, 189 sessions, 10.65 days): 201 nodes, 449 edges, average degree 4.47, max degree 26, density 0.0223. Average clustering 0.154, transitivity 0.264. Largest component 150 of 201 (74.6%); 47 isolated (23.4%). Modularity 0.416. LCC: C_obs 0.207 vs configuration-null 0.082 (ratio 2.54, z = 9.3), L_obs 3.26 vs 3.06 — **sigma 2.38**. Erdős–Rényi: ratio 5.45 (z = 21.9), sigma 4.98.

Comparative:

- **All three are small-world** under both nulls (sigma > 1; `is_small_world: true` for each). Under the conservative configuration null, sigma is 1.95 / 2.23 / 2.38 for Opus 3 / Sonnet 4.5 / GPT-5.1.
- **Clustering exceeds the degree-matched null in every case**, by 1.98x / 2.19x / 2.54x, with clustering z-scores of 13.9 / 9.9 / 9.3 — all far outside what random rewiring of the same degree sequence produces.
- **Opus 3's graph is markedly denser.** Average degree 11.65 versus 4.82 and 4.47 — roughly 2.4-2.6x. Normalized to exposure, Opus 3 wrote 67.3 undirected edges per 100 turns versus 11.9 (Sonnet 4.5) and 12.0 (GPT-5.1): a per-turn association rate about 5.6x higher, not an artifact of its longer window.
- **Connectivity vs. fragmentation differs.** Opus 3 keeps 88% of nodes in one component (9.7% isolated); Sonnet 4.5 and GPT-5.1 leave 28.8% and 23.4% of nodes isolated and show higher modularity (0.36, 0.42 vs 0.30) — more, smaller communities.
- **Degree concentration is comparable** across all three (Gini 0.44 / 0.48 / 0.49); each graph is hub-dominated, with the top 5% of nodes carrying 17.5% / 27.4% / 22.3% of edges.

## What it means

Under the same memory architecture, all three models produced association graphs that are non-random and recognizably small-world: dense local neighborhoods bridged by short global paths. The clustering that drives this is not a byproduct of degree alone — it survives comparison to a configuration null that preserves each graph's exact degree sequence, with z-scores between 9 and 14. This is structure the architecture and the model's choices put there, not structure forced by node and edge counts.

The clearest cross-model difference is density. Opus 3 links its memories far more readily — about 5.6x more associations per turn — yielding a denser, more connected, less modular graph. Sonnet 4.5 and GPT-5.1 are sparser and more fragmented, partitioning memory into more isolated nodes and more distinct communities. We read this as a model-characteristic difference in how aggressively each resident associates new material to existing memory, holding the architecture fixed.

The careful claim is: **non-random, model-characteristic structure.** Nothing here speaks to whether the graphs reflect understanding, experience, or anything like a mind. Small-world organization is common in networks built by very different processes; its presence is evidence about wiring, not about what the wiring is for.

## Limitations

- These are small graphs (132-201 nodes; LCCs of 94-155). Clustering and path-length estimates are correspondingly noisy, and sigma comparisons across models should be read as ordinal, not precise.
- The nulls are a degree-matched configuration model and an Erdős–Rényi model, each over 20 samples. Both are deliberately structureless; "above null" means "above random wiring," not "above any plausible generative process."
- Edges are undirected — reciprocal directed pairs were collapsed — so any asymmetry in how associations were originally written is lost here.
- Exposure windows differ (8.5 / 10.65 / 19.97 days; 1,522-3,750 turns). Calendar-based comparisons are not meaningful; only per-turn / per-session normalized quantities support cross-model claims.
- Edge weights were accumulated across duplicate pairs but the unweighted topology is the basis for the small-world test; weighted clustering (0.088 / 0.090 / 0.071) is reported but not used for the null comparison.

## Supporting figures

- `../../figures/topology__smallworld.png` — observed C and L versus nulls; sigma per model.
- `../../figures/topology__clustering_vs_null.png` — observed clustering against the degree-matched null with z-scores.
- `../../figures/topology__degree_dist.png` — degree distributions and hub concentration.
- `../../figures/topology__constellations.png` — full graph layouts per resident.
- `../../figures/relational__network.png` — relational view of the memory graphs.
