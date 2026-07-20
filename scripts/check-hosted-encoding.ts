import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  estimateHostedWorkingMemoryLoad,
  hasExplicitVisitorMemoryEmphasis,
  planHostedEngramEncoding,
  type HostedEncodingContext,
} from "../src/server/mnemos-emotion/hosted-encoding";
import { DEFAULT_STATE_FIXTURE } from "../src/server/mnemos-emotion/fixtures";

const neutralContext: HostedEncodingContext = {
  emotionalState: DEFAULT_STATE_FIXTURE,
  emotionalRevision: 4,
  authoritative: true,
};
const highEmotionContext: HostedEncodingContext = {
  emotionalState: { ...DEFAULT_STATE_FIXTURE, curiosity: 0.9 },
  emotionalRevision: 5,
  authoritative: true,
};
const sharedInput = {
  novelty: 1,
  workingMemoryLoad: 0.3,
  schemaRelevant: true,
  userEmphasis: false,
  initialStability: 0.45,
  existing: { strength: 0.2, stability: 0.4, accessibility: 0.3 },
} as const;

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} was not close to ${expected}`);
}

function checkPureWriteParameters(): void {
  const neutral = planHostedEngramEncoding({ context: neutralContext, ...sharedInput });
  const high = planHostedEngramEncoding({ context: highEmotionContext, ...sharedInput });

  assert.equal(neutral.depth, "moderate");
  assert.equal(neutral.policy, "hosted-extension-v1");
  assert.equal(neutral.pythonParity, false);
  assert.deepEqual(neutral.create, {
    strength: 0.3,
    stability: 0.45,
    accessibility: 0.5,
    resolution: 1,
  });
  assertClose(neutral.reinforce.strength, 0.3);
  assertClose(neutral.reinforce.stability, 0.48);
  assertClose(neutral.reinforce.accessibility, 0.45);
  assert.equal(neutral.reinforce.strengthDelta, 0.1);
  assert.equal(neutral.reinforce.stabilityDelta, 0.08);
  assert.equal(neutral.reinforce.accessibilityDelta, 0.15);

  assert.equal(high.depth, "deep");
  assert.equal(high.emotionalRevision, 5);
  assert.ok(high.signalFlags.includes("emotional_intensity"));
  assert.ok(high.create.strength > neutral.create.strength);
  assert.ok(high.create.stability > neutral.create.stability);
  assert.ok(high.create.accessibility > neutral.create.accessibility);
  assert.ok(high.reinforce.strength > neutral.reinforce.strength);
  assert.ok(high.reinforce.stability > neutral.reinforce.stability);
  assert.ok(high.reinforce.accessibility > neutral.reinforce.accessibility);

  const emphasized = planHostedEngramEncoding({
    context: highEmotionContext,
    ...sharedInput,
    userEmphasis: true,
  });
  assert.equal(emphasized.depth, "elaborative");
  assert.ok(emphasized.signalFlags.includes("user_emphasis"));
}

function checkExactLegacyFallback(): void {
  const fallback = planHostedEngramEncoding({
    context: { ...highEmotionContext, authoritative: false },
    ...sharedInput,
    userEmphasis: true,
  });
  assert.equal(fallback.depth, "moderate");
  assert.equal(fallback.policy, "legacy-fallback-v1");
  assert.equal(fallback.emotionalRevision, null);
  assert.deepEqual(fallback.create, {
    strength: 0.3,
    stability: 0.45,
    accessibility: 0.5,
    resolution: 1,
  });
  assert.equal(fallback.reinforce.strengthDelta, 0.1);
  assert.equal(fallback.reinforce.stabilityDelta, 0.08);
  assert.equal(fallback.reinforce.accessibilityDelta, 0.15);
}

function checkGenuineSignals(): void {
  const visitorTurns = [
    { role: "visitor", body: "Please remember that Juniper waits beside the blue gate." },
    { role: "resident", body: "I will hold the shape of that." },
  ];
  assert.equal(
    hasExplicitVisitorMemoryEmphasis(visitorTurns, "Juniper waits beside a blue gate"),
    true,
  );
  assert.equal(
    hasExplicitVisitorMemoryEmphasis(visitorTurns, "A different conversation about winter"),
    false,
  );
  assert.equal(
    hasExplicitVisitorMemoryEmphasis(
      [{ role: "resident", body: "Please remember that Juniper waits beside the blue gate." }],
      "Juniper waits beside a blue gate",
    ),
    false,
  );

  const shortLoad = estimateHostedWorkingMemoryLoad([{ body: "A short exchange." }]);
  const longLoad = estimateHostedWorkingMemoryLoad(
    Array.from({ length: 50 }, () => ({ body: "substantive ".repeat(500) })),
  );
  assert.ok(shortLoad < 0.3);
  assert.ok(longLoad >= 0.9);
}

async function checkProductionIntegration(): Promise<void> {
  const [substrate, loader, migration] = await Promise.all([
    readFile(new URL("../src/server/substrate.server.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/server/mnemos-emotion/hosted-encoding.server.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260715180000_hosted_emotional_encoding_audit.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  const stateLoadIndex = substrate.indexOf("loadHostedEncodingContext(resident.id)");
  const firstEngramWriteIndex = substrate.indexOf('.from("engrams")\n            .update');
  assert.ok(stateLoadIndex >= 0 && firstEngramWriteIndex > stateLoadIndex);
  assert.match(substrate, /novelty: 1 - maximumSimilarity/);
  assert.match(substrate, /hasExplicitVisitorMemoryEmphasis\(turns, e\.quote\)/);
  assert.match(substrate, /runtime_encoding_depth: plan\.depth/);
  assert.match(substrate, /runtime_mutation_session_id: sessionId/);
  assert.match(
    substrate,
    /hostedEncodingMetadataUnavailable\(reinforcementError\)[\s\S]*legacyEncodingPlan\.reinforce/,
  );
  assert.match(
    substrate,
    /hostedEncodingMetadataUnavailable\(engramInsertError\)[\s\S]*legacyEncodingPlan\.create/,
  );
  assert.match(
    substrate,
    /catch \(err\) \{\s*console\.error\("\[substrate\] consolidateSession failed:", err\);\s*throw err;/,
  );
  assert.match(
    loader,
    /authoritative emotional state unavailable[\s\S]*LEGACY_HOSTED_ENCODING_CONTEXT/,
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.runtime_encoding_audits/);
  assert.match(migration, /REVOKE ALL ON public\.runtime_encoding_audits FROM anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.runtime_encoding_audits TO service_role/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|ALL) ON public\.runtime_encoding_audits/);
  assert.match(migration, /CREATE TRIGGER capture_00_runtime_encoding_audit_v1/);
  assert.match(migration, /NEW\.runtime_encoding_depth := NULL/);
  assert.match(migration, /NEW\.runtime_encoding_policy := NULL/);
  assert.match(migration, /NEW\.runtime_encoding_emotion_revision := NULL/);
  assert.match(migration, /NEW\.runtime_encoding_signal_flags := NULL/);
  assert.match(migration, /'strength', NEW\.strength/);
  assert.doesNotMatch(migration, /'quote', NEW\.quote|'prose', NEW\.prose|'body', NEW\.body/);
}

checkPureWriteParameters();
checkExactLegacyFallback();
checkGenuineSignals();
await checkProductionIntegration();

console.log(
  "hosted emotional encoding: genuine signals, neutral/high write divergence, legacy fallback, atomic private audit, and truthful failure propagation passed",
);
