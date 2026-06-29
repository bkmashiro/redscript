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

## Next safe goals
1. Expand candidate-window parser support to classify short local proof spans into `single-adjacent-arith-no-reuse` / `copy-chain-no-reuse` where provable.
2. Add deterministic evidence examples for unknown causes (`insufficient-window`, `unparsed-command`) to improve triage quality.
3. Keep rewrite-test expansion disabled until at least one family reaches non-`unknown` liveness readiness.
