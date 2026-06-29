# Tranche E closeout — Production-safe LIR opportunity lane

- **Date:** 2026-06-26
- **Slice selected:** Aggregate LIR score-copy rewrite opportunity telemetry for evidence (diagnostic-only).
- **Allowed surface:** `benchmarks/arithmetic-probes.ts`, `src/__tests__/arithmetic-probes.test.ts`.
- **Status:** Completed.

## Scope and objective

Promote existing LIR score-copy rewrite evidence into a deterministic, top-level benchmark artifact field that:

- preserves all existing emitted behavior
- does not touch VIR production hooks
- keeps recommendations and examples deterministic for stable longitudinal tracking

## Schema update

Added `ArithmeticProbeReport.lirOpportunitySummary?: LirOpportunitySummary` with:

```ts
type LirOpportunitySummary = {
  totalScoreCopyCount: number
  byStatus: {
    currentlyOptimized: number
    safeCandidate: number
    blockedByBarrier: number
    unknown: number
  }
  topPatterns: Array<{
    status: 'currentlyOptimized' | 'safeCandidate' | 'blockedByBarrier' | 'unknown'
    pattern: string
    count: number
    caseNames: string[]
    examples: string[]
  }>
  recommendation: 'diagnose-first' | 'safe-local-rewrite-candidate' | 'no-action'
  notes: string
}
```

Aggregation is done from per-case `rewriteOpportunities`, deduping and sorting case names and capping `examples` at three entries per pattern.

## Representative output

From:
`npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-e-lir.json`

```json
{
  "totalScoreCopyCount": 1277,
  "byStatus": {
    "currentlyOptimized": 0,
    "safeCandidate": 522,
    "blockedByBarrier": 0,
    "unknown": 755
  },
  "topPatterns": [
    {
      "status": "safeCandidate",
      "pattern": "score_copy -> score_arith",
      "count": 328,
      "caseNames": ["div3_hp", "double_div", "double_mul", "fixed_mul_div", ...],
      "examples": ["data/...", "data/...", "data/..."]
    }
  ],
  "recommendation": "safe-local-rewrite-candidate",
  "notes": "0 currently optimized, 522 safe candidates, 0 barrier-blocked, 755 uncertain"
}
```

## Diagnostic behavior

- Aggregate totals are deterministic and match per-case rewrite totals and command `scoreCopy` totals.
- Top patterns now include sorted `caseNames` and capped examples.
- Recommendation is deterministic by data-driven status totals:
  - `safe-local-rewrite-candidate` when `safeCandidate > blockedByBarrier`
  - `diagnose-first` otherwise for non-empty mixed cases
  - `no-action` for empty probe selections

## Production-safety statement

This tranche made **no semantic or emitted LIR changes** and introduced only report-only diagnostics. It does not modify
- production compiler pipeline,
- VIR planner behavior,
- optimizer pass rewrites.

It therefore remains safe as a diagnostic-only lane while keeping the path open for a later LIR-only rewrite tranche.

## Blockers / risky assumptions

- Recommendations are advisory and rely on textual proximity patterns (`commandShape`) plus existing rewrite status classification.
- Some cases have protected/opaque status effects that remain in `unknown`; no behavior-changing rewrite was attempted from this tranche.

## Suggested follow-up

1. Use this closeout as the evidence input for Tranche F decision review.
2. Implement a narrow LIR local rewrite task only with dedicated invariants and benchmark proof in a future tranche.
3. Keep diagnostics as an additive artifact to compare before/after opportunities.
