# 14. VIR Decision Evidence Pack (Step 14)

Date: 2026-06-25

Scope: experimental-only VIR spike only. No production compiler pipeline changes.

## Step 12 objective

Convert the Step 11 VIR dashboard from aggregate counts into an evidence pack that makes hardening decisions supportable and deterministic.

## Step 13 objective (current)

- Add controlled arithmetic probe fixtures for attribution-focused evidence.
- Add rejection attribution that identifies why each unsupported case fails (shape, lowering mode, and control-flow barriers).
- Extend dashboard schema with unsupported blocker totals while leaving existing Step 12 fields intact.

## Step 14 objective (current)

- Replace heuristic unsupported attribution from free-form reason strings with structured reason tags at:
  - MIR→VIR unsupported results.
  - VIR→LIR plan decision summaries.
  - Arithmetic probe dashboard aggregation.
- Keep all experimental behavior and public APIs narrow and non-breaking:
  - existing rejection fields (`rejectionCategory`, `rejectionReason`, `unsupportedReason`) remain.
  - no production pipeline hooks are changed.

## Step 13 probe coverage additions

- Controlled fixtures added:
  - `int_arithmetic` (baseline, re-classified as controlled)
  - `int_add_sub_mul`
  - `int_div_mod_mix`
  - `int_const_var_mix`
  - `int_temp_heavy`
  - `branched_arithmetic` (intentional unsupported-shape control-flow probe)
- Broad fixtures kept and explicitly marked broad:
  - `fixed_mul_div`
  - `sqrt_fx1000`
  - `sqrt_fx10000`
  - `sin_hp`
  - `sin_cos_hp_separate`
  - `double_mul`
  - `double_div`
  - `div3_hp`

## Step 13 evidence-pack schema extension

- Aggregate additions:
  - `unsupportedReasonTotals`: counts by blocker tag.
  - `topUnsupportedReasons`: deterministic sorted list of top reasons.
  - `blockerTagTotals`: counts by per-case `blockerTags`.
  - `supportedProbeNames`: names for supported cases.
  - `unsupportedProbeNames`: names for unsupported cases.
  - `corpusCoverageSummary`: controlled vs broad split by case names.
- Per-case additions (additive, no removals):
  - `unsupportedReasonTags` (`VirUnsupportedReasonTag[]` in Step 14, fallback-compatible with prior string heuristics)
  - `blockerTags` (`string[]`, already present in Step 12 but now includes richer blockers)
  - `coverageCategory` (`controlled`/`broad`)
- Existing Step 12 fields remain unchanged and untouched.

## Step 14 structured-attribution dashboard result (actual run)

Command:

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-step14-structured-attribution.json
```

Representative summary excerpt:

```json
{
  "totalCaseCount": 14,
  "supportedCases": 6,
  "unsupportedCases": 8,
  "status": "stay-experimental",
  "statusReason": "allocation-check failures: 3; direct rejection dominance 50% > 45%; planned acceptance 3/14; proven cases below minimum: 0/3; semantic proof unsupported: 8; supported ratio 43% < 50%; unsupported cases: 8/14",
  "recommendationReason": "stay-experimental: allocation-check failures: 3; direct rejection dominance 50% > 45%; planned acceptance 3/14; proven cases below minimum: 0/3; semantic proof unsupported: 8; supported ratio 43% < 50%; unsupported cases: 8/14",
  "topUnsupportedReasons": [
    { "reason": "unsupported-mir-op-kind", "count": 6 },
    { "reason": "allocation-check-failure", "count": 3 },
    { "reason": "planned-lowering-unsupported", "count": 3 },
    { "reason": "unsupported-unknown", "count": 3 },
    { "reason": "unsupported-control-flow-shape", "count": 2 }
  ],
  "blockerTagTotals": {
    "case-unsupported": 8,
    "proof-gap": 14,
    "reason:unsupported-mir-op-kind": 6,
    "reason:allocation-check-failure": 3,
    "reason:planned-lowering-unsupported": 3,
    "reason:unsupported-control-flow-shape": 2,
    "reason:unsupported-unknown": 3
  },
  "supportedProbeNames": [
    "fixed_mul_div",
    "int_add_sub_mul",
    "int_arithmetic",
    "int_const_var_mix",
    "int_div_mod_mix",
    "int_temp_heavy"
  ],
  "unsupportedProbeNames": [
    "branched_arithmetic",
    "div3_hp",
    "double_div",
    "double_mul",
    "sin_cos_hp_separate",
    "sin_hp",
    "sqrt_fx1000",
    "sqrt_fx10000"
  ],
  "corpusCoverageSummary": {
    "totalCaseCount": 14,
    "controlledCaseCount": 6,
    "broadCaseCount": 8
  }
}
```

## Step 15 drilldown/update note (current)

- Added deterministic drilldown evidence in the aggregate dashboard:
  - `unsupportedReasonBreakdown` with per-reason case sets.
  - `caseBlockerMatrix` for per-case blocker, proof, and delta visibility.
  - `readinessChecklist` with deterministic `pass|warn|fail` entries.
  - `unknownReasonCaseNames` for unresolved tag fallbacks.
- Added recommendations for continuation safety (`nextSafeGoals`) derived from readiness/breakdown signals.
- Recommendation remains `stay-experimental` while unsupported coverage and proof gaps remain.

Step 14 notes:

- Structured tags are now collected first from decision/decision-result tag fields and only fall back to deterministic text mapping when tags are absent.
- Unsupported cases continue to be blocked from semantic proof counts.
- Production compiler pipeline remains untouched.
- No public language semantics changed.

## Current Step 13 dashboard result (actual run)

Command:

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-step13-vir-corpus.json
```

Representative summary excerpt:

```json
{
  "status": "stay-experimental",
  "totalCaseCount": 14,
  "supportedCases": 6,
  "unsupportedCases": 8,
  "topUnsupportedReasons": [
    { "reason": "unsupported-mir-op-kind", "count": 6 },
    { "reason": "allocation-check-failure", "count": 3 },
    { "reason": "planned-lowering-unsupported", "count": 3 },
    { "reason": "unsupported-unknown", "count": 3 },
    { "reason": "unsupported-control-flow-shape", "count": 2 }
  ],
  "blockerTagTotals": {
    "case-unsupported": 8,
    "proof-gap": 14,
    "reason:unsupported-mir-op-kind": 6,
    "reason:allocation-check-failure": 3,
    "reason:planned-lowering-unsupported": 3
  },
  "supportedProbeNames": [
    "fixed_mul_div",
    "int_add_sub_mul",
    "int_arithmetic",
    "int_const_var_mix",
    "int_div_mod_mix",
    "int_temp_heavy"
  ],
  "unsupportedProbeNames": [
    "branched_arithmetic",
    "div3_hp",
    "double_div",
    "double_mul",
    "sin_cos_hp_separate",
    "sin_hp",
    "sqrt_fx1000",
    "sqrt_fx10000"
  ],
  "corpusCoverageSummary": {
    "totalCaseCount": 14,
    "controlledCaseCount": 6,
    "broadCaseCount": 8
  },
  "recommendationReason": "stay-experimental: allocation-check failures: 3; direct rejection dominance 50% > 45%; planned acceptance 3/14; proven cases below minimum: 0/3; semantic proof unsupported: 8; supported ratio 43% < 50%; unsupported cases: 8/14"
}
```

## Step 13 recommendation

- Recommendation remains **stay-experimental**.
- The added rejection attribution now makes each blocker explainable at probe granularity and keeps unsupported probes from counting as semantic proof.
- Production compiler pipeline is still untouched; this is still experimental-only benchmark tooling.
- No public language semantics were changed.

## Completed scope checkpoint

### Phase 0-5

- Probe harness and command-shape summaries are in place.
- Copy-origin and score-copy diagnostics exist.
- MIR/VIR/LIR integration remains isolated and experimental-only.

### Step 6-11 summary

- Benchmark/command instrumentation and case-level VIR payload are present.
- Experimental VIR compare/auto path exists in the optimizer (`chooseVirLoweringPlan` + `lowerVirToLir` options).
- Aggregate Step 11 dashboard includes rejection-category totals and command/score-copy deltas.
- Initial `bench:arithmetic` probe and Step 10-11 wiring remain prototype-only.

## Evidence-pack schema extension

- Aggregate fields added/extended in `benchmarks/arithmetic-probes.ts`:
  - `status`, `statusReason`, `recommendationReason`
  - `consideredCases`, `consideredFunctions`
  - `supportedCases`, `unsupportedCases`
  - `acceptedPlannedCases`, `selectedDirectCases`, `rejectedDirectCases`
  - `rejectionCategoryTotals`, `topRejectionCategories`
  - `commandDeltaSummary`, `scoreCopyDeltaSummary`
  - `semanticProofSummary`
  - `blockers`, `nextSafeGoals`
- Per-case optional fields preserved/added:
  - `semanticProofStatus` (`proven` / `unproven` / `unsupported`)
  - `rejectionCategory`
  - `commandDelta`
  - `scoreCopyDelta`
  - `blockerTags`

## Current dashboard result (actual run)

Command:

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-step12-evidence.json
```

Representative excerpt from the generated JSON:

```json
{
  "status": "stay-experimental",
  "statusReason": "planned acceptance 2/9; proven cases below minimum: 0/3; semantic proof unsupported: 7; supported cases below minimum: 2/3; unsupported cases: 7/9",
  "recommendationReason": "stay-experimental: planned acceptance 2/9; proven cases below minimum: 0/3; semantic proof unsupported: 7; supported cases below minimum: 2/3; unsupported cases: 7/9",
  "consideredCases": 9,
  "consideredFunctions": 2,
  "supportedCases": 2,
  "unsupportedCases": 7,
  "acceptedPlannedCases": 2,
  "selectedDirectCases": 0,
  "rejectedDirectCases": 0,
  "commandDeltaSummary": {
    "min": -3,
    "max": -3,
    "total": -6,
    "average": -3,
    "improvedCount": 2,
    "regressedCount": 0,
    "unchangedCount": 0
  },
  "scoreCopyDeltaSummary": {
    "min": -3,
    "max": -3,
    "total": -6,
    "average": -3,
    "improvedCount": 2,
    "regressedCount": 0,
    "unchangedCount": 0
  },
  "semanticProofSummary": {
    "provenEquivalentCount": 0,
    "unsupportedCount": 7,
    "missingProofCount": 2,
    "unprovenCount": 2
  }
}
```

## Spike recommendation

Current recommendation: **remain experimental**.

Reasoning:
- Unsupported coverage is still dominant (8 of 14 cases remain unsupported in Step 14).
- Rejection profile remains high for unsupported-cases.
- Command and score-copy improvements are present in supported cases; unsupported still blocks progression.
- Semantic proof evidence is not yet complete enough to treat unsupported outputs as pass-like.
- No production integration path has been enabled.

## Step 14 recommendation

- Recommendation remains **stay-experimental**.
- Textual recommendation did not change from Step 13 because unsupported/allocator blockers still dominate:
  - unsupported coverage still high (`8/14`) and
  - semantic proof unsupported count is still complete blocker (`8`).

## What this evidence pack now answers

- Which arithmetic functions/cases block continuation:
  - blocked via `unsupported case coverage` and category totals.
- Which rejection categories dominate:
  - from deterministic `rejectionCategoryTotals` and `topRejectionCategories`.
- Whether planned-vs-direct and score-copy deltas are stable:
  - via full delta summaries (min/max/total/average/improved/regressed/unchanged).
- Whether unsupported and semantic proof are clearly separated:
  - `unsupportedCount` is tracked independently from `provenEquivalentCount` and drives blockers.
- What evidence is still missing before production:
  - deterministic proof coverage across a broader arithmetic corpus,
  - direct-rejection dominance reduction,
  - no hidden unsupported semantics.

## Production integration prerequisites

1. Broad arithmetic support coverage with low unsupported ratio at function and case level.
2. Stable/beneficial command and score-copy regression thresholds on representative corpus.
3. Independent semantic equivalence evidence that is not based on unsupported-case heuristics.
4. Rejection reason precision and direct/indirect planner behavior hardened in code review plus design docs.
5. Explicit opt-in pipeline design (feature flag + staged rollout) before any defaults change.

## Next if continue (experimental-only, 2-3 goals)

1. Expand arithmetic corpus with controlled fixtures to isolate unsupported categories.
2. Improve VIR planner rejection reason precision for category-level attribution.
3. Add narrow experimental semantic-equivalence probes for one opcode family only.
