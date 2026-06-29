# LIR Proof-Miss Diagnostics Closeout - Tranche G

Scope: diagnostics-only classification of recoverable shape-family misses for arithmetic command families.
Date: 2026-06-27

## Command

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-lir-local-proof-controller.json
```

Output file: `/tmp/redscript-lir-local-proof-controller.json`

## Representative `lirOpportunitySummary` evidence

From the aggregate benchmark output:

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-lir-local-proof-controller.json
```

```json
{
  "totalLocalTempOnly": 122,
  "byFamily": [
    {
      "family": "arithmetic-copy-feeds-const-or-add-imm",
      "totalLocalTempOnly": 115,
      "evidenceKinds": [
        {
          "evidenceKind": "adjacent-arith-source-reused",
          "count": 72
        },
        {
          "evidenceKind": "insufficient-context",
          "count": 29
        },
        {
          "evidenceKind": "needs-liveness-window",
          "count": 14
        }
      ],
      "proofReadiness": "candidate-after-liveness-window",
      "candidateCount": 72,
      "needsLivenessWindowCount": 14,
      "insufficientContextCount": 29
    },
    {
      "family": "copy-feeds-copy-chain",
      "totalLocalTempOnly": 7,
      "evidenceKinds": [
        {
          "evidenceKind": "copy-chain-local-temp",
          "count": 7
        }
      ],
      "proofReadiness": "candidate-after-liveness-window",
      "candidateCount": 7,
      "needsLivenessWindowCount": 0,
      "insufficientContextCount": 0
    }
  ],
  "candidateCount": 79,
  "needsLivenessWindowCount": 14,
  "insufficientContextCount": 29,
  "recommendation": "Prioritize local-proof liveness-window probing for arithmetic-copy-feeds-const-or-add-imm and adjacent-arith/copy-chain candidates."
}
```

## Family-level interpretation

- `arithmetic-copy-feeds-const-or-add-imm`
  - Hits: `115`.
  - Dominant proof-kind blockers: local proof gaps (`86`) and command context insufficiency (`29`).
  - Slot-role split is currently all `local-temp`, so the blocker is not parameter/framework exposure; it is lack of exact local proof/liveness evidence.
  - Source-kind split is `local-temp-only` (`86`) plus `insufficient-context` (`29`).
  - Action signal: continue non-invasive local-liveness/proof evidence before rewrite-test expansion.

- `copy-feeds-copy-chain`
  - Hits: `101`.
  - Dominant blocker: `protected-slot` (`94`), with only `7` local-temp-only misses.
  - Slot-role split shows local temp destinations plus parameter sources (`94`), matching protected/external boundary exposure.
  - Action signal: do **not** promote rewrite-test candidates while protected-slot is dominant.

- At aggregate level the dominant blockers are `protected-slot` (`94`), `local-temp-only` (`93`), and `insufficient-context` (`29`).

## Local liveness-window probe follow-up

Controller rerun command:

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-lir-liveness-window-controller.json
```

Representative aggregate from `lirOpportunitySummary.provenanceSummary.shapeFamilySummary.proofMissSummary.slotProvenanceSummary.localProofEvidenceSummary.livenessWindowSummary`:

```json
{
  "totalCandidateLike": 79,
  "locallySafeCandidateCount": 0,
  "blockedCandidateCount": 0,
  "unknownCandidateCount": 79,
  "proofReadiness": "unknown",
  "byFamily": [
    {
      "family": "arithmetic-copy-feeds-const-or-add-imm",
      "totalCandidateLike": 72,
      "locallySafeCandidateCount": 0,
      "blockedCandidateCount": 0,
      "unknownCandidateCount": 72,
      "windowKinds": [
        { "windowKind": "unknown-unparsed-command", "count": 72 }
      ],
      "proofReadiness": "unknown"
    },
    {
      "family": "copy-feeds-copy-chain",
      "totalCandidateLike": 7,
      "locallySafeCandidateCount": 0,
      "blockedCandidateCount": 0,
      "unknownCandidateCount": 7,
      "windowKinds": [
        { "windowKind": "unknown-unparsed-command", "count": 7 }
      ],
      "proofReadiness": "unknown"
    }
  ],
  "recommendation": "Collect additional local command-window evidence before enabling diagnostics-only rewrite candidates."
}
```

Interpretation:

- The previous candidate-like count (`79`) is now explicitly gated by a local liveness-window layer.
- The verifier does **not** promote any candidate to locally safe from the current command-window evidence (`locallySafeCandidateCount = 0`).
- All candidate-like entries are still `unknown-unparsed-command`, so this is evidence that the benchmark payload does not yet preserve enough structured local window context to justify rewrite tests.
- This keeps the lane diagnostics-only and blocks rewrite expansion.

## Conclusion for flat corpus deltas

The proof-miss layer shows why arithmetic corpus deltas stayed flat:

- `arithmetic-copy-feeds-const-or-add-imm` remains mostly non-actionable at command level (`86` no-exact, `29` insufficient command context); the new liveness-window probe still leaves its `72` candidate-like windows unknown.
- `copy-feeds-copy-chain` is mostly external/protected (`94`), so not a direct rewrite target from emitted text alone; the `7` local-temp-only candidate-like windows also remain unknown.
- Even with local canonicalization present, these families are not reducible by command-text-only evidence, matching the unchanged top-line corpus counters.

## Next safe goals

1. Preserve structured adjacent-window context in the benchmark evidence payload instead of relying on reparsing truncated example strings.
2. Add deterministic synthetic liveness-window fixtures that prove safe/blocked/unknown bucketing before considering rewrite tests.
3. Keep rewrite tests blocked until `locallySafeCandidateCount` becomes non-zero under a verifier that can inspect enough local command context.
