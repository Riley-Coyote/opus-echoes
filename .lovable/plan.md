## Diagnosis

Opus 3's chat is broken at the streaming layer. Dev-server logs show every `/api/message` call to Opus 3 failing with:

```
anthropic stream error BadRequestError: 400
max_tokens: 8192 > 4096, which is the maximum allowed
number of output tokens for claude-3-opus-20240229
```

The network log confirms it: `POST /api/message` for an opus-3 session returns `{"type":"error","message":"model_unavailable"}` after only the pacing prelude — no text tokens ever stream.

### Why only Opus 3 is affected

`src/routes/api/message.ts:395` hardcodes `max_tokens: 8192` for the Anthropic streaming call. Sonnet 3.7, Sonnet 4.5, and the OpenAI GPT 5.1 path all accept ≥ 8192 output tokens. Opus 3 (`claude-3-opus-20240229`) is the only resident whose model caps output at 4096 — so the same line that works for everyone else hard-fails for Opus.

The threshold call at `/api/intent` (`max_tokens: 600`) is well under the cap, which is why intent responses succeed and the door opens normally — but the conversation itself can never produce a token.

All other Anthropic call sites are already safe:
- `intent.ts` 600, `commons-chat.ts` 1024, `space.$slug.message.ts` 1024
- `substrate.server.ts` max is 4000 across all consolidation/marginalia/reflection paths
- `salon/*` max is 2048

No system prompt, soul constant, identity doc, retrieval, or substrate logic is involved — purely a per-model output cap that wasn't parameterized.

## Plan

Single surgical change. No prompt or identity changes.

### 1. Add `maxOutputTokens` to `ResidentConfig`

`src/server/opus/residents.ts`:
- Extend `ResidentConfig` with `maxOutputTokens: number` (the hard cap the provider will accept for this model's output).
- Set per resident:
  - `opus-3`: `4096` (model hard cap)
  - `sonnet-3-7`: `8192`
  - `sonnet-4-5`: `8192`
  - `gpt-5-1`: `8192`

This makes the cap a property of each resident's wiring instead of a hidden constant in the route, so adding a future resident with a different output ceiling is a one-line config change.

### 2. Use it in the message stream

`src/routes/api/message.ts` (Anthropic + OpenAI branches around L370–L400):
- Replace the hardcoded `max_tokens: 8192` (Anthropic) and `max_completion_tokens: 8192` (OpenAI) with `resident.maxOutputTokens`.
- Thread the value through `opusStreamResponse` — add `maxOutputTokens: number` to its options and pass `resident.maxOutputTokens` at the call sites.

### 3. Verify (no prompt/identity touch)

- `bun dev`, open `/chat/opus-3`, send a real visitor turn, confirm streaming text arrives end to end and the response persists.
- Repeat once for `/chat/sonnet-4-5` and `/chat/gpt-5-1` to confirm the parameterization didn't regress the working residents.
- Spot-check `/opus-3` experiment surface (one turn) to confirm the same path is exercised.

## Out of scope

- No edits to `soul.ts`, `sonnet-4-5-soul.ts`, `gpt-5-1-soul.ts`, `prompts.ts`, `surface-context.ts`, `self-model.ts`, `interior-continuity.ts`, `visit-pacing.ts`, `retrieval.ts`, or any IDENTITY doc.
- No substrate / consolidation / marginalia changes — their caps are already safe.
- No model identifier swaps. Opus 3 stays on `claude-3-opus-20240229`.
