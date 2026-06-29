# LIR Liveness-Window Probe Tranche Report

Date: 2026-06-27

## Scope
Non-invasive, diagnostics-only liveness-window evidence for candidate-like local-temp proof misses in arithmetic families.

## Command

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-lir-liveness-window-controller.json
```

Output file (from this run): `/tmp/redscript-lir-liveness-window-controller.json`

## Representative local-window output

```json
{
  "localProofEvidenceSummary": {
    "totalLocalTempOnly": 122,
    "candidateCount": 79,
    "needsLivenessWindowCount": 14,
    "insufficientContextCount": 29,
    "livenessWindowSummary": {
      "totalCandidateLike": 79,
      "locallySafeCandidateCount": 0,
      "blockedCandidateCount": 0,
      "unknownCandidateCount": 79,
      "byFamily": [
        {
          "family": "arithmetic-copy-feeds-const-or-add-imm",
          "totalCandidateLike": 72,
          "locallySafeCandidateCount": 0,
          "blockedCandidateCount": 0,
          "unknownCandidateCount": 72,
          "windowKinds": [
            { "windowKind": "unknown-unparsed-command", "count": 72 }
          ]
        },
        {
          "family": "copy-feeds-copy-chain",
          "totalCandidateLike": 7,
          "locallySafeCandidateCount": 0,
          "blockedCandidateCount": 0,
          "unknownCandidateCount": 7,
          "windowKinds": [
            { "windowKind": "unknown-unparsed-command", "count": 7 }
          ]
        }
      ],
      "proofReadiness": "unknown",
      "recommendation": "Collect additional local command-window evidence before enabling diagnostics-only rewrite candidates."
    }
  }
}
```

## Outcome
- Candidate-like windows are correctly partitioned by family in diagnostics payloads.
- No windows are classified as `locally-safe` or `blocked` yet; all 79 candidate-like windows remain `unknown` under this local parse-window probe.
- `proofReadiness` stays diagnostics-only (`unknown`) as required.

### Tranche F outcome update
- Adjacent-window proof-miss context for candidate-like local-temp cases is now fed from real `summarizeProofMissByFamilyFromBuckets` data (line-level provenance buckets), so real bench output can produce non-empty `lirAdjacentWindowSummary.proofMissAdjacentWindowBreakdown`.
- The real pipeline still applies no production rewrite behavior; `lirAdjacentWindowSummary` remains a diagnostic-only evidence artifact for tuning next safe slices.
- Window buckets should include the canonical kinds:
  - `unknown-unparsed-command`
  - `adjacent-window-missing-or-incomplete`
  - `protected-boundary-blocked`
  - `local-temp-exact-proof-gap`
  - `candidate-shape-not-satisfying-lir-local-proof`

### Tranche G outcome update
- Added deterministic readiness partitioning under `lirAdjacentWindowSummary.localTempProofGapReadinessSummary` for `local-temp-exact-proof-gap` cases:
  - `rewrite-test-candidate-local-window`
  - `needs-predecessor-window-proof`
  - `needs-successor-window-proof`
  - `needs-cross-function-boundary-proof`
  - `unknown-local-temp-proof-gap`
- Added companion aggregate bucket arrays for candidate names vs blocked-or-unknown names so the output is directly usable for rewrite-test triage planning.
- `localTempProofGapReadinessSummary.totalCandidateLike` is the exact `local-temp-exact-proof-gap` population, and bucket counts are conservative and deterministic by case-path.
- This tranche is explicitly diagnostics-only and does **not** enable production rewrite behavior; it only increases readiness metadata for future, separate rewrite-test gates.

### Tranche H outcome update
- Added deterministic short-window proof-kind classification for local-temp exact-proof-gap misses under `shortWindowProofSummary` at `lirAdjacentWindowSummary.localTempProofGapReadinessSummary.shortWindowProofSummary` and in aggregate local proof evidence summaries.
- Added conservative fixture-selection signals:
  - `futureRewriteTestCandidateCaseNames` for short-window shapes that look directly testable.
  - `needsWiderWindowCaseNames` for shapes that require deeper local evidence before fixture consideration.
- Added deterministic family-aware merged ordering for `byProofWindowKind` and deduplicated case-name sets.
- This tranche is diagnostic-only and intended to pick high-signal rewrite-test fixtures, not to assert correctness or authorize production optimization enablement.

### Tranche I outcome update
- Added deterministic fixture-selection evidence output for short-window proof buckets (without enabling any production rewrite behavior).
- Added `fixtureSelectionSummary` under short-window summary output with:
  - `candidateFixtures`: deterministic entries with `bucket`, `caseName`, `example`, `reason`, and `recommendedTestKind`.
  - `blockedFixtureFamilies`: deterministic blocked families for cross-function / boundary / opaque contexts.
  - `rewriteEnablementStatus`: `'disabled-diagnostics-only'`.
  - `nextSafeDiagnosticGoals`: stable recommendation hints for the next safe fixture-design tranche.
- Added matching tests validating deterministic ordering, per-bucket caps, and real-bench emission.
- Next safe work remains explicit rewrite-test fixture design; this tranche does **not** enable production rewrites.

### Tranche J outcome update
- Added deterministic future fixture export summaries from existing evidence to prepare offline rewrite-test fixture planning.
- Added `futureRewriteFixtureExportSummary` at both `ArithmeticProbeReport` and `lirOpportunitySummary` with:
  - `exportedFixtureCount`
  - `blockedFixtureCount`
  - `candidateFixtureNames`
  - `blockedFixtureNames`
  - `byFixtureFamily`
  - `byBlockerKind`
  - `nextRequiredEvidence`
  - fixed `rewriteEnablementStatus: "disabled-diagnostics-only"`
- Added blocker-kind tagging for:
  - `insufficient-window`
  - `boundary-or-cross-function`
  - `opaque-or-unparsed-window`
  - `protected-boundary-blocked`
  - `missing-predecessor-evidence`
  - `missing-successor-evidence`
  - `unknown-other`
- Summary output is deterministically sorted and capped for stable review, and is explicitly marked as future-test preparation, not rewrite correctness proof.

### Tranche K outcome update
- Added conservative unknown-cause triage split so vague unknown buckets are classified into deterministic causes:
  - `unparsed-command`
  - `insufficient-window`
  - `opaque-window`
  - `boundary-or-cross-function`
  - `missing-predecessor-evidence`
  - `missing-successor-evidence`
  - `unknown-other`
- Added `unknownCauseSplitSummary` with totals, case buckets, and representative examples.
- Preserved previous unknown buckets in existing summaries (including `unknown-unparsed-command` context) while adding split metadata for better triage only.
- This tranche is diagnostics/test/docs-only and is not a correctness proof.

### Tranche L outcome update
- Added `offlineRewriteTestHarnessSummary` as an additive, offline, diagnostics-only harness metadata layer that consumes the exported fixture candidates.
- Added deterministic harness outputs:
  - `harnessStatus`: one of `fixture-selection-only`, `no-candidates`, `blocked-by-unknown-evidence`
  - `candidateFixtureCount`
  - `blockedFixtureCount`
  - `supportedTestKinds`
  - `requiredBeforeRewriteEnablement`
  - fixed `rewriteEnablementStatus: "disabled-diagnostics-only"`
- Added tests that fixture-export signals can be consumed by harness summaries and that future rewrite enablement remains disabled.
- This remains a future harness-only stage and explicitly does not enable production rewrites.

### Tranche M outcome update
- Added `src/optimizer/lir/equivalence.ts`, a test-only/offline bounded LIR equivalence checker for the smallest rewrite fixture shapes.
- The checker interprets straight-line scoreboard instructions over explicit bounded samples and compares declared observed slots; it returns `equivalent`, `counterexample`, or `unsupported` instead of treating opaque commands as proof.
- Added `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts` coverage for:
  - local copy forwarding equivalence,
  - counterexample reporting when a temp remains observable,
  - predecessor arithmetic feeding a local temp,
  - conservative refusal of `raw`/opaque instructions.
- This is still offline harness evidence only. It does not connect to `lirOptimizeModule`, does not add a production rewrite pass, and does not enable any rewrite by default.

### Tranche N outcome update

- Added an explicit opt-in gate for the existing local-copy/RMW rewrite pass via `LIROptimizeOptions.experimentalLocalCopyRewrite`.
- Wired the same gate through `compile` and `compileModules` as `experimentalLirLocalCopyRewrite`, defaulting to `false`.
- Updated pipeline coverage so `lirOptimizeModule(mod)` leaves local-copy/RMW rewrites off by default, while `lirOptimizeModule(mod, { experimentalLocalCopyRewrite: true })` enables the local copy/output and local copy/return collapses.
- This is a pipeline integration gate only; it is not default production enablement and does not claim corpus-wide correctness. Next proof work should compare flag-off vs flag-on benchmark impact and expand bounded equivalence fixtures before any default-on decision.

### Tranche O outcome update
- Added deterministic benchmark support for explicit experimental runs via `--experimental-lir-local-copy-rewrite`.
- Added additive aggregate evidence in `ArithmeticProbeReport.experimentalLocalCopyRewriteComparison` including:
  - `commandDelta` and `scoreCopyDelta` totals,
  - per-case command/score-copy deltas,
  - and deterministic delta summaries.
- Expanded bounded `checkBoundedLirEquivalence` fixtures for:
  - `copy-chain/no-reuse` output shape,
  - local-copy/output RMW shape,
  - local-copy/return RMW shape.
- This phase is evidence-only: default compilation behavior remains with local-copy rewrite disabled unless the flag is explicitly enabled.

### Tranche P outcome update
- Added explicit CLI/benchmark evidence gate for experimental local-copy comparison:
  - `--require-experimental-lir-local-copy-no-regressions`,
  - hard dependency on `--experimental-lir-local-copy-rewrite`,
  - exported `evaluateExperimentalLocalCopyRewriteNoRegressionGate` for deterministic regression checks.
- Added additive report field `experimentalLocalCopyRewriteNoRegressionGate` with additive status metadata when gate is enabled:
  - `mode: experimental-no-regression-evidence-only`,
  - `status: pass | fail`,
  - `failReasons`,
  - `rationale: benchmark-evidence-only-no-production`.
- Added conservative gate failure checks only for explicit evidence conditions:
  - missing comparison,
  - off/on case-count mismatch,
  - regressed cases in command/scoreCopy delta summaries,
  - per-case command/scoreCopy delta regressions,
  - positive aggregate command/scoreCopy deltas.
- This phase remains a no-regression evidence gate only and does not enable production rewrites.

### Tranche Q outcome update
- Expanded bounded rewrite-equivalence fixture evidence for local-temp safety/coverage goals without changing production rewrite behavior:
  - Added predecessor families for non-add arithmetic rewrites over local temp chains: `score_sub`, `score_mul`, `score_min`, `score_max`.
  - Added safe/unsafe local-temp read/write-window cases where temp is consumed into output/return and then:
    - unobserved beyond the rewrite window (equivalent),
    - explicitly observed post-window (counterexample).
  - Added nonzero-division/modulo local temp/output rewrite checks and kept division/modulo-by-zero unsupported behavior as explicit evidence boundaries.
  - Added non-add return-path predecessor arithmetic coverage (`$ret` via `score_mul`).
- This tranche is explicitly offline evidence, not correctness proof and not production behavior.

### Tranche R outcome update
- Added `src/optimizer/lir/rewrite_equivalence_fixtures.ts` to productize existing M/Q bounded rewrite fixtures into a reusable, deterministic offline pack:
  - fixture type with family classification and expected status;
  - exported deterministic fixture list `offlineRewriteEquivalenceFixtures`;
  - deterministic fixture runner `runOfflineRewriteEquivalenceFixtures()` with per-fixture expected/actual status and family/group totals.
- Added `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts` coverage over the pack that validates:
  - required family coverage,
  - deterministic family-ordered summary totals (`total`, `equivalent`, `counterexample`, `unsupported`, `failed`),
  - explicit checks that unsafe/unsupported fixtures are not reported as `equivalent`.
- This tranche remains offline, bounded-evidence-only prep for future local-copy rewrite activation decisions and does not imply rewrite correctness or production enablement.

### Tranche S outcome update
- Wired the offline fixture pack into explicit experimental local-copy benchmark paths as additive evidence-only metadata:
  - Added `ArithmeticProbeReport.offlineRewriteEquivalencePackSummary` populated only when experimental local-copy mode is enabled.
  - Added deterministic family-ordered, per-pack counts and capped failed fixture names for benchmark review.
  - Updated the no-regression gate evaluator to fail when the offline pack summary reports `status: fail`.
- No production optimizer behavior changed; this remains strict offline evidence required only for explicit gate runs.

### Tranche T outcome update
- Added an explicit CI-friendly gate wrapper path for Phase S evidence:
  - `scripts/check-lir-local-copy-gate.ts` runs the explicit experimental report comparison in one process (`runArithmeticProbeReport('all', [1], true)`), evaluates `evaluateExperimentalLocalCopyRewriteNoRegressionGate`, writes JSON to `/tmp/redscript-lir-local-copy-gate.json` by default (`--output` override supported), prints a concise evidence-only summary, and exits non-zero when gate status is not `pass`.
  - Added `gate:lir-local-copy` script and corresponding CI workflow step so this no-regression gate runs in explicit CI paths without dumping full benchmark JSON to logs.
  - This remains bounded to `bounded-offline-evidence-only` and does not authorize production behavior.

### Tranche U outcome update
- Expanded the bounded offline rewrite-equivalence fixture pack in `src/optimizer/lir/rewrite_equivalence_fixtures.ts` with three new evidence families while preserving existing family order:
  - `score-swap-window` (both safe local-window equivalent cases and explicit counterexamples when swap temp is externally observable);
  - `score-set-overwrite-window` (safe if overwritten temp is not observed, counterexample if it remains observable);
  - `unsupported-typed-boundary` (evidence-only unsupported cases for typed boundary commands, storage/NBT/call/macro forms).
- Updated test expectations so totals and deterministic family summaries reflect the expanded families.
- This tranche is evidence-only and does **not** represent production rewrite correctness or enable any production optimizer path.

### Tranche V outcome update
- Added bounded evidence-only readiness gating metadata under `offlineRewriteEquivalencePackSummary.offlineRewriteFamilyReadinessSummary` for explicit local-copy benchmark mode:
  - required families are explicitly listed and deterministically ordered:
    - `local-copy-forwarding`
    - `predecessor-arithmetic`
    - `read-write-window`
    - `score-swap-window`
    - `score-set-overwrite-window`
    - `unsupported-boundary`
    - `unsupported-typed-boundary`
  - each family is reported with `total`, `failed`, and family-local pass/fail status.
  - top-level readiness status/missing/failed arrays are surfaced.
  - evidence/notes explicitly call out bounded-offline evidence-only scope.
- Updated `evaluateExperimentalLocalCopyRewriteNoRegressionGate` to fail the gate if the readiness summary is missing, any required family is absent, or any required family has failed fixtures.
- Updated tests to assert deterministic required-family ordering, deterministic fail reasons, and presence of readiness metadata in explicit report/gate outputs.
- This tranche is diagnostics-only and does not change production optimizer behavior.

### Tranche W outcome update
- Added `ArithmeticProbeReport.experimentalLocalCopyRewriteRolloutReadinessSummary` and companion evaluator `evaluateExperimentalLocalCopyRewriteRolloutReadinessSummary` for deterministic readiness messaging on explicit experimental local-copy runs.
- The new rollout summary includes:
  - `status` (`pass`/`fail`),
  - `recommendation` (`manual-experimental-opt-in-only` or `stay-experimental`),
  - `evidenceStatus: 'benchmark-and-bounded-offline-evidence-only'`,
  - deterministic `reasons`,
  - copied aggregate/regression fields (`commandDelta`, `scoreCopyDelta`, regression counts),
  - explicit `requiredGateStatus` / `offlinePackStatus` / `familyReadinessStatus`,
  - capped deterministic `improvedCaseNames`.
- The script wrapper prints a concise rollout/readiness line derived from this summary while writing the full JSON artifact; it exits non-zero if either the no-regression gate or rollout readiness summary fails.
  - Summary pass criteria is conservative:
  - no regression gate/family evidence is allowed to fail,
  - no aggregate or per-case regressions are allowed,
  - at least one aggregate benchmark signal must improve.
  - Tranche W remains bounded offline-evidence only and does **not** change production/default optimizer behavior; it is explicitly for manual experimental opt-in review and does not authorize default enablement.

### Tranche X (CLI opt-in) outcome update
- Added and validated Phase X CLI exposure for manual local-copy/LIR experimental opt-in:
  - `--experimental-lir-local-copy-rewrite` is now a compile/publish CLI flag with explicit `Experimental` wording in help.
  - `compile` and `publish` call `compile(...)` with `experimentalLirLocalCopyRewrite` only when the flag is present.
  - `compile --incremental --experimental-lir-local-copy-rewrite` fails with explicit unsupported-scenario error.
  - Default compile/publish behavior remains unchanged when the flag is absent.
  - No production optimizer behavior changed; this tranche is manual experimental opt-in only.

### Tranche Y outcome update
- Added deterministic residual score-copy blocker/provenance output for explicit Phase X experimental benchmark runs in `benchmarks/arithmetic-probes.ts`.
- Added `ArithmeticProbeReport.experimentalLocalCopyRewriteResidualSummary` with buckets derived from existing per-case opportunity provenance:
  - `residualByStatus`,
  - `residualByPattern`,
  - `residualByFamily`,
  - `residualByProvenanceReason`,
  - sorted/capped `topResidualCaseNames`,
  - and deterministic `perCase` entries with per-case residual buckets.
- Added and preserved conservative fallback behavior for missing/empty data (including `no-residuals` recommendation).
- Added and validated residual cap constants to keep deterministic, review-stable output:
  - `MAX_RESIDUAL_CASE_SUMMARY_ENTRIES`
  - `MAX_RESIDUAL_PATTERNS_PER_SUMMARY`
  - `MAX_RESIDUAL_FAMILIES_PER_SUMMARY`
  - `MAX_RESIDUAL_EXAMPLES_PER_BUCKET`.
- Kept all behavior evidence-only; benchmark output remains off/on-compatible and no compiler/optimizer rewrite semantics changed.

## Next safe goals
1. keep running the explicit no-regression gate on benchmark CI paths that choose `--experimental-lir-local-copy-rewrite` via the new wrapper.
2. use residual-blocker provenance from explicit local-copy residual summaries to target the next gated rewrite candidates,
3. use the new Phase U/U+V fixture and readiness results to guide the next gated rewrite candidate tranche,
4. only after gate stability and coverage evidence improve, move to a narrowly scoped rewrite-safe tranche.
