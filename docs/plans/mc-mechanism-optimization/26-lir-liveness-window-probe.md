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

## Next safe goals
1. Expand candidate-window parser support to classify short local proof spans into `single-adjacent-arith-no-reuse` / `copy-chain-no-reuse` where provable.
2. Add deterministic evidence examples for unknown causes (`insufficient-window`, `unparsed-command`) to improve triage quality.
3. Keep rewrite-test expansion disabled until at least one family reaches non-`unknown` liveness readiness.
