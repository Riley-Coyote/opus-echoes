# Research — The Mnemos Comparative Analysis

Written outputs of a comparative study of machine memory across three AI residents — **Opus 3** (Anthropic), **Sonnet 4.5** (Anthropic), and **GPT-5.1** (OpenAI) — each given the same memory architecture (Mnemos) and run as a continuous, persistent entity that remembers the people who visit it.

## Structure

- **`findings/`** — per-workstream findings memos (topology, dynamics, semantic, relational). The raw analytical results, with exact numbers and limitations.
- **`reports/`** — formal synthesis reports (the comparative analysis; methodology).
- **`essays/`** — narrative and interpretive pieces.

## Where the rest lives

- `../data/` — computed results, one JSON per workstream (`topology.json`, `dynamics.json`, `semantic.json`, `relational.json`, `base.json`).
- `../figures/` — the 17 publication-quality charts.
- `../index.html` — the assembled scrollytelling atlas.
- `../thread.html` — the social posting kit.
- `../agents/`, `../common.py` — the analysis pipeline.

## Standing notes

- Windows differ (Opus ~20 days, Sonnet ~9, GPT ~11), so every cross-model claim is normalized by exposure (per-turn / per-session), not calendar time.
- Edge counts are undirected (reciprocal pairs collapsed) — the standard measure for an association graph.
- Findings are stated only as far as the data supports them; limitations are flagged explicitly.
