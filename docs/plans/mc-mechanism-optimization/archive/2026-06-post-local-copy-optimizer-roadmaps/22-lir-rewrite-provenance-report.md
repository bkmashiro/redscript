# LIR Rewrite Provenance Report

Status: draft
Scope: diagnostics-only follow-up to Tranche E + score_copy -> score_arith diagnostic slice
Date: 2026-06-27

## Summary

A narrow local rewrite proving pass was added in Tranche E (`src/optimizer/lir/rmw.ts`), but aggregate corpus totals in the arithmetic controller did not change.

This tranche adds deterministic shape-family diagnostics for the largest blocked family in command-provenance output:

- `totalScoreCopyCount`: `1277`
- by status: `currentlyOptimized=0`, `safeCandidate=522`, `blockedByBarrier=0`, `unknown=755`
- `recommendation`: `safe-local-rewrite-candidate`

`safeCandidate` status from `copy -> arithmetic` shape alone is not the same as **safe-adjacent** rewrite evidence from emitted command text.

## Representative output (`/tmp/redscript-lir-shape-families-controller.json`)

```json
{
  "lirOpportunitySummary": {
    "totalScoreCopyCount": 1277,
    "byStatus": {
      "currentlyOptimized": 0,
      "safeCandidate": 522,
      "blockedByBarrier": 0,
      "unknown": 755
    },
    "provenanceSummary": {
      "total": 1277,
      "safeAdjacentScoreCopyArithCount": 0,
      "blockedCount": 1223,
      "insufficientInfoCount": 54,
      "unknownCount": 54,
      "requiresLirLevelAnalysis": true,
      "byReason": [
        { "reason": "blocked-by-pattern-not-exact-adjacent-score-copy-arith", "count": 577 },
        { "reason": "blocked-by-cross-function-module-external-mention", "count": 349 },
        { "reason": "blocked-by-protected-slot", "count": 249 },
        { "reason": "insufficient-command-level-information", "count": 54 },
        { "reason": "blocked-by-barrier-or-non-adjacent-shape", "count": 48 }
      ],
      "shapeFamilySummary": {
        "totalPatternNotExactCount": 577,
        "families": [
          {
            "family": "arithmetic-copy-feeds-const-or-add-imm",
            "count": 86,
            "caseNames": ["div3_hp", "double_div", "double_mul", "..."],
            "examples": [
              "data/arith_int_arithmetic/function/probe.mcfunction:7: scoreboard players operation $probe_t6 __arith_int_arithmetic = $probe_t4 __arith_int_arithmetic",
              "data/arith_int_div_mod_mix/function/probe.mcfunction:11: scoreboard players operation $probe_t10 __arith_int_div_mod_mix = $probe_t8 __arith_int_div_mod_mix",
              "data/arith_int_const_var_mix/function/probe.mcfunction:8: scoreboard players operation $probe_t6 __arith_int_const_var_mix = $probe_t4 __arith_int_const_var_mix"
            ],
            "likelyNextAction": "local-canonicalization",
            "requiresLirLevelAnalysis": false
          },
          {
            "family": "copy-feeds-copy-chain",
            "count": 7,
            "caseNames": ["div3_hp", "double_div", "double_mul", "..."],
            "examples": [
              "data/arith_sqrt_fx1000/function/cbrt_newton__merge_1.mcfunction:4: scoreboard players operation $cbrt_newton_t3 __arith_sqrt_fx1000 = $cbrt_newton_t2 __arith_sqrt_fx1000",
              "data/arith_sqrt_fx10000/function/ln_hp.mcfunction:5: scoreboard players operation $ln_hp_t2 __arith_sqrt_fx10000 = $ln_hp_t1 __arith_sqrt_fx10000",
              "data/arith_sin_hp/function/ln_hp.mcfunction:5: scoreboard players operation $ln_hp_t2 __arith_sin_hp = $ln_hp_t1 __arith_sin_hp"
            ],
            "likelyNextAction": "local-canonicalization",
            "requiresLirLevelAnalysis": false
          },
          {
            "family": "const-or-boundary-copy",
            "count": 43,
            "caseNames": ["div3_hp", "double_div", "double_mul", "..."],
            "examples": [
              "data/arith_sqrt_fx1000/function/isqrt__loop_body_7.mcfunction:1: scoreboard players operation $isqrt_t6 __arith_sqrt_fx1000 = $isqrt_t4 __arith_sqrt_fx1000",
              "data/arith_sqrt_fx1000/function/isqrt__loop_exit_8.mcfunction:1: scoreboard players operation $isqrt_t8 __arith_sqrt_fx1000 = $isqrt_t3 __arith_sqrt_fx1000",
              "data/arith_sqrt_fx1000/function/isqrt__merge_16.mcfunction:1: scoreboard players operation $isqrt_t11 __arith_sqrt_fx1000 = $isqrt_t21 __arith_sqrt_fx1000"
            ],
            "likelyNextAction": "liveness-analysis",
            "requiresLirLevelAnalysis": true
          },
          {
            "family": "other-pattern-not-exact",
            "count": 441,
            "caseNames": ["div3_hp", "double_div", "double_mul", "..."],
            "examples": [
              "data/arith_int_arithmetic/function/probe.mcfunction:3: scoreboard players operation $probe_t4 __arith_int_arithmetic = $probe_t0 __arith_int_arithmetic",
              "data/arith_int_add_sub_mul/function/probe.mcfunction:5: scoreboard players operation $probe_t4 __arith_int_add_sub_mul = $probe_t0 __arith_int_add_sub_mul",
              "data/arith_int_add_sub_mul/function/probe.mcfunction:7: scoreboard players operation $probe_t8 __arith_int_add_sub_mul = $probe_t4 __arith_int_add_sub_mul"
            ],
            "likelyNextAction": "leave-blocked",
            "requiresLirLevelAnalysis": true
          }
        ],
        "topRecoverableFamilies": [
          "arithmetic-copy-feeds-const-or-add-imm",
          "copy-feeds-copy-chain"
        ],
        "recommendation": "Prioritize local canonicalization for arithmetic-copy-feeds-const-or-add-imm, copy-feeds-copy-chain first, then rerun LIR provenance."
      }
    }
  }
}
```

### Interpretation

- This tranche did not expose a corpus win because most existing `safeCandidate` entries are matched by existing heuristic windows that are not adjacent `score_copy -> score_arith` patterns.
- 349 candidates are blocked by cross-function/module external mentions (e.g., `$pN`, `__rf_...`).
- 249 candidates are blocked by protected slots.
- 577 candidates are non-adjacent pattern variants now split by shape:
  - `other-pattern-not-exact`: 441
  - `arithmetic-copy-feeds-const-or-add-imm`: 86
  - `const-or-boundary-copy`: 43
  - `copy-feeds-copy-chain`: 7
- Proof-miss taxonomy (new in this tranche) for the two target recoverable families:
  - `arithmetic-copy-feeds-const-or-add-imm`: 115 total misses
    - `no-exact-lir-local-proof`: 86
    - `insufficient-command-context`: 29
  - `copy-feeds-copy-chain`: 101 total misses
    - `external-or-protected-slot`: 94
    - `no-exact-lir-local-proof`: 7
- `topActionableFamilies` from proof-miss summary is empty in this command-text-only run; causes are mixed between external/protected and insufficient context, so no immediate rewrite-test target is surfaced yet.
- Top recoverable families are `arithmetic-copy-feeds-const-or-add-imm` and `copy-feeds-copy-chain`.
- 54 remain `insufficient-command-level-information` because command text alone cannot prove temp liveness or external scope.

## Recommended next 2–3 safe goals

1. Canonicalize `arithmetic-copy-feeds-const-or-add-imm` and `copy-feeds-copy-chain` (both local-canonicalization candidates) first, then rerun provenance.
2. Add lightweight liveness checks for `const-or-boundary-copy` before deciding leave-blocked.
3. Expand deterministic handling for `other-pattern-not-exact` only where a local proof exists; keep as blocked otherwise.

## Notes

- VIR remains read-only/experimental.
- This tranche is diagnostics-only; emitted LIR behavior and production pipeline are untouched.
- No dependency changes were made.
