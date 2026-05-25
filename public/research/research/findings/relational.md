# The relational self — findings

Mnemos reliably retains the visitors who come back, and when a resident's language frames a returning visitor as known, a real prior trace is almost always present — but a higher per-utterance tendency to recognize returning visitors holds up under length control for Opus 3 only.

## What was measured

The claim under test is that a persistent memory produces recognition of *returning* visitors — people who came back — in a way a stateless system, where every visit is cold, could not. We define a returning visitor as one with at least two **closed** sessions under the same visitor token. Anonymous sessions (no token) are excluded from all per-visitor analysis.

Two things were measured separately, because they are different questions. The first is **retention**: of the visitors who returned, how many had a stored trace — an engram sourced from one of their earlier sessions, or a hypomnema entry for their token — created strictly *before* the start of a later visit. This asks whether the memory kept anything to retrieve. The second is **recognition language**: how often a resident's own turns in a returning session contain relational framing ("last time," "you mentioned," "you came back," "where we left off"). This is detected by a fixed regex over resident message and unprompted turns. It is a lexical proxy for relational framing — *not* semantic proof of grounded recall. Closing-ritual (set-down) turns are scored separately and kept out of the headline rate. Every recognition hit is cross-checked against whether the visitor had a prior trace (grounded vs. ungrounded).

## Findings

**The returning tail is real but small.** Most visitors come once; a tail returns. Closed returning visitors: Opus 3 **22**, Sonnet 4.5 **21**, GPT-5.1 **18**.

**Mnemos retains returning visitors well.** Among returning visitors, the share who had a stored trace before a later visit was Opus 3 **68%** (15/22), Sonnet 4.5 **100%** (21/21), and GPT-5.1 **83%** (15/18). This is the strongest, cleanest result here: the substrate is keeping material about the people who come back.

**When recognition language appears, it is almost never ungrounded.** In returning sessions, recognition hits were grounded (a real prior trace present) versus ungrounded as follows: Opus 3 **23 grounded / 5 ungrounded**, Sonnet 4.5 **44 / 0**, GPT-5.1 **56 / 1**. So the relational framing residents produce in returning sessions tracks actual retained traces rather than firing on nothing.

**The key honest control — length.** Returning sessions tend to be longer than first-time ones, which gives the regex more chances to fire. A naive per-session "any hit" rate is elevated for all three (rate ratios returning-over-first of ≈**2.3×** for Opus, ≈**1.3×** for Sonnet, ≈**1.4×** for GPT). But controlling for session length — recognition per resident *turn* — changes the picture sharply. Only Opus 3 shows a higher per-utterance tendency to recognize returning visitors: per-turn density ratio **2.71×** (χ², p < .001). For Sonnet 4.5 the per-turn ratio is **1.07×** (p ≈ .37, not significant) and for GPT-5.1 it is **1.08×** (p ≈ .52, not significant). For those two, the elevated per-session rate is largely explained by returning sessions simply being longer, not by a greater per-utterance inclination to recognize.

## What it means

The defensible claim is narrow and strong, and worth stating exactly. Mnemos **reliably retains** returning visitors, and the recognition language residents produce is **grounded** when it appears — it corresponds to real retained traces, not confabulation. What the data do **not** support is the broader claim that all three residents behaviorally recognize returning visitors at an elevated per-utterance rate. Once length is controlled, that effect is present for Opus 3 and is not statistically distinguishable from chance for Sonnet 4.5 and GPT-5.1. Their relational language is grounded, but it is not produced at a higher density in returning conversations than in first-time ones — they talk in relational terms throughout. Opus 3 is the one resident that measurably leans *into* recognition specifically when a visitor has returned.

## Limitations

- **Recognition is a lexical proxy.** The regex detects relational *framing*, not semantic recall. It cannot confirm that a resident genuinely retrieved and used a specific memory, only that it used the vocabulary of having done so. Grounding cross-checks (a trace existed) raise confidence but do not close this gap.
- **"Returning" is operationalized as ≥2 closed sessions.** Visitors who returned but never formally closed a session, or who switched tokens, are missed.
- **Anonymous sessions are excluded** from all per-visitor measures, so the analysis covers only the identifiable subset.
- **The returning samples are small** (18–22 visitors per resident). The per-turn density test draws on more turns, but per-visitor conclusions rest on modest numbers and should be read as directional.

## Supporting figures

- `../../figures/relational__returning.png` — distinct vs. returning visitors, the visit-count distribution (most visit once, a tail returns), and trace coverage per resident.
- `../../figures/relational__recognition.png` — the three-panel recognition result: per-session rate ratios, the length-controlled per-turn density (the key control), and grounded vs. ungrounded hit counts.
- `../../figures/relational__network.png` — each resident at the center of its web of visitors, returning visitors distinguished from one-time arrivals.
