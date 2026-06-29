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

## Next safe goals
1. add bench impact comparison for flag-off vs flag-on output before any default enablement.
2. expand equivalence fixtures for copy-chain/no-reuse and predecessor-arithmetic families before broadening/defaulting the rewrite pass.
3. add a narrow default-enable decision gate only after benchmark impact and bounded equivalence fixtures agree.
