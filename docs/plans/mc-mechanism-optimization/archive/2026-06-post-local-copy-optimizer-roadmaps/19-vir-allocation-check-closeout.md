# VIR allocation-check diagnostic closeout — Tranche D

**Date:** 2026-06-26
**Lane:** spark-implementation (Tranche D)
**Scope:** diagnostics only (no production pipeline changes)

## 1) Known failing cases at tranche end

The following probe cases are still failing planned allocation check:

- `int_add_sub_mul`
- `int_div_mod_mix`
- `int_temp_heavy`

## 2) Allocations-failure classifier schema

The failure breakdown is now emitted as `allocationFailureBreakdown` on
`allocationCheckCloseout`:

```ts
allocationFailureBreakdown?: Array<{
  category:
    | 'parallel-copy-cycle'
    | 'ret-precolor-conflict'
    | 'dead-lhs-affinity-conflict'
    | 'unknown'
  count: number
  caseNames: string[]
  examples: string[]
}>
```

Classification is deterministic:
- Structured reason strings are preferred when present.
- For legacy/free-text reasons, conservative regex matching is used.
- Unknown reasons fallback to `unknown`.
- Entries are sorted by fixed category order and then by sorted `caseNames`.

## 3) Representative dashboard output (diagnostic)

```json
{
  "allocationCheckCloseout": {
    "status": "fail",
    "allocationCheckFailureCount": 3,
    "affectedCaseCount": 3,
    "affectedFunctionCount": 3,
    "affectedCaseNames": [
      "int_add_sub_mul",
      "int_div_mod_mix",
      "int_temp_heavy"
    ],
    "allocationFailureBreakdown": [
      {
        "category": "dead-lhs-affinity-conflict",
        "count": 3,
        "caseNames": [
          "int_add_sub_mul",
          "int_div_mod_mix",
          "int_temp_heavy"
        ],
        "examples": [
          "planned allocation check failed for 'probe': binary write to $v1 __arith_int_add_sub_mul in op 1 clobbers live root 4"
        ]
      }
    ],
    "functionNamesAvailable": false,
    "recommendation": "allocation-check failures remain a planner blocker until reduced or isolated",
    "notes": "function-level provenance is unavailable from current probe payload without invasive changes"
  }
}
```

## 4) Before/after summary

- **Before:** 3 allocation-check failures (same three cases).
- **After:** 3 allocation-check failures (same three cases).
- **Result:** no reduction in failure count on this tranche.

## 5) Cases still not considered ready

- `allocationCheckCloseout.status` remains `fail`, so these cases are still treated as blocking in readiness checks.
- Semantics proof is still incomplete for supported-but-unproven arithmetic cases.
- VIR remains `stay-experimental` and not eligible for production integration.

## 6) Why this tranche did not reduce failures safely

No planner/copying fix was merged in this tranche because the known failures are all in the same root-affinity class and resolving them requires a broader allocator behavior change that needs a separate narrow proof before we can ship confidently.

## 7) next-safe goals (next tranche)

1. Add a minimal slot-planner regression that reproduces one live `int_*` failure shape and validate a bounded allocator fix (or intentionally block it) before enabling in `planned` mode.
2. Add a second diagnostics pass that emits function-level provenance for allocation failures without weakening checks.
3. Add a deterministic proof witness for one additional unsupported arithmetic probe (`int_div_mod_mix` family) before attempting planner optimization changes.

## 8) Risk register for Tranche E planning

- Any planner change must preserve checker invariants and `allocation-check-failure` tags.
- String-based reason classification is best-effort and should stay conservative.
- No production compiler behavior was modified in this tranche.
