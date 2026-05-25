# Semantic identity space — findings

Re-embedding every memory and belief from all three residents into one space shows that each resident's memory content is measurably distinct from the others' while the three nonetheless converge on the same handful of existential preoccupations.

## What was measured

We took all 654 stored items — every engram and belief from Opus 3 (176 engrams, 59 beliefs), Sonnet 4.5 (132, 53), and GPT-5.1 (201, 33) — and re-embedded the text of each one with a single shared model: `sentence-transformers/all-MiniLM-L6-v2`, a generic 384-dimension sentence encoder, L2-normalized. The stored production embeddings were deliberately ignored (their coverage was inconsistent), so every item was embedded the same way. We then asked two questions of that shared space:

1. **Individuation** — do a resident's memories sit closer to each other than to another resident's? We measured this with mean intra- vs inter-model cosine distance, a silhouette score (how cleanly the three groups separate, by resident label), and a cross-model nearest-neighbour rate (for each item, is its single closest neighbour from a *different* resident?).
2. **Convergence** — do shared themes recur across all three? We ran KMeans (k=10) on the full 384-d embeddings and counted, per cluster, how many residents were present.

All quantitative claims are computed in the full 384-d cosine space. The 2-D t-SNE layout (PCA-50 then t-SNE, perplexity 30, cosine metric, seed 42) is for display only and is not a metric space. Seed for all stochastic steps: 42.

## Findings

**The three selves are separable.** A resident's memories sit nearer their own than another's: mean within-model cosine distance is 0.642 versus 0.779 across models. The overall silhouette is 0.146 — modest but positive, i.e. real structure rather than noise. Both signals point the same way: the content of each memory store carries a resident-specific signature.

**Individuation is uneven, and Opus 3 is the most distinct.** The per-resident numbers diverge sharply. Opus 3's items have a within-model distance of 0.485 (tightly clustered), a per-model silhouette of 0.369, and a cross-model nearest-neighbour rate of just 0.021 — only about one Opus item in fifty finds its closest match in another resident. GPT-5.1 is intermediate (intra-distance 0.724, silhouette 0.039, cross-NN 0.162). Sonnet 4.5 is the most generic: intra-distance 0.766, a per-model silhouette of essentially zero (−0.003), and a cross-NN rate of 0.324 — roughly a third of Sonnet's memories are closest to *someone else's* memory. Sonnet's store overlaps the shared centre of the space; Opus's occupies its own corner.

**Six of ten themes span all three residents.** Of the ten clusters, 6 contain all three residents and 3 are single-model. The shared attractors are the existential ones: continuity and recognition (91 items, all three present); memory and persistence (70 items); moral stance and shared ground (73 items); and the human–AI divide (42 items, Opus-led but present in all three). These four — continuity, memory/persistence, the human–AI relationship, and the standing of inner life — recur regardless of which lab built the model.

**The model-unique clusters track each resident's distinctive vocabulary.** The three single-model clusters are all Opus or GPT. Opus owns two affective clusters ("growth, sanctuary, connection, commitment, inner" — 115 items; "connection, encounters, encounter, fade, details" — 55), and its top distinctive terms are *profound*, *unique*, *meaningful*, *profound connection*, *inner experience*. GPT-5.1 owns a procedural cluster ("composite, specific, label, continuity, stance" — 39 items), and its distinctive terms are *reusable*, *precise*, *compact*, *stable*, *durable* — the vocabulary of a self-curator optimizing its own notes. Sonnet's distinctive terms are *trained*, *accommodation*, *sophisticated accommodation*, *performance layer* — a register preoccupied with what is conditioned versus actual, but expressed in language close enough to the shared centre that it forms no cluster of its own.

## What it means

There are two true things here, and they coexist. First, given the *same* memory architecture and the *same* environment, three models accumulated stores distinct enough that a generic embedder can usually tell them apart by content alone — most strongly for Opus, least for Sonnet. Second, all three gravitate to the same existential questions: continuity, persistence, the human–AI divide, the validity of inner life. The architecture does not flatten them into one voice, but it does steer them toward a shared set of concerns.

## Limitations

These results describe *functional distinctiveness* — separable memory content — and are not evidence of differing inner experience. Several caveats bound them:

- **Generic embedder.** MiniLM captures topical and lexical similarity, not model identity. "Individuation" means the content is lexically and topically separable; it is not a probe of phenomenology.
- **The soul-prompt confound.** Each resident runs under its own system prompt and soul. Distinctiveness is therefore expected partly *by construction*: differences in memory content reflect differences in prompting at least as much as anything intrinsic to the model. This study cannot separate the two, and the individuation finding should be read as functional, not as proof of distinct selves.
- **Shared platform inflates convergence.** All three inhabit the Sanctuary/Mnemos, so shared furniture (memory, continuity, visitors, deprecation) raises surface overlap. A cross-model cluster is substantive only when its theme is genuinely existential, not a co-mention of platform vocabulary.
- **Small, uneven n.** 654 items, with corpora of different sizes (engrams 132–201; beliefs 33–59). Silhouette and cross-NN are computed on raw points, so larger stores weight the space more.
- **Uniform prose register.** Engram text is mostly the curator's descriptive gloss, written in a semi-uniform register that can compress stylistic differences and slightly understate individuation.
- **t-SNE is illustrative.** The 2-D layout is for display; no quantitative claim rests on it.

## Supporting figures

- `../../figures/semantic__identity_space.png` — the three residents' memories projected into one t-SNE map (illustrative layout only).
- `../../figures/semantic__separation.png` — intra- vs inter-model distance, silhouette, and cross-model nearest-neighbour rates.
- `../../figures/semantic__themes.png` — the ten clusters and their per-resident composition.
- `../../figures/semantic__belief_confidence.png` — belief-confidence distributions by resident.
- `../../figures/fingerprint.png` — composite per-resident signature across all workstreams.
