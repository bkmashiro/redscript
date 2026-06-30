# RedScript Typed Optimizer Opportunity Report

Source command:

```bash
npm run gate:lir-local-copy -- --output /tmp/redscript-megagoal-e-local-copy.json
```

## Gate result

- Gate: `pass`
- Rollout recommendation: `manual-experimental-opt-in-only`
- Evidence status: `benchmark-and-bounded-offline-evidence-only`
- Command delta: `-497`
- Score-copy delta: `-497`
- Regressions: command `0`, score-copy `0`

## Boundary sidecar mix

- Total instructions: `3446`
- Confidence: exact `2211`, conservative `355`, opaque `880`
- Provenance: typed-lir `2211`, lowering-compat `351`, macro-helper `5`, raw-user-command `879`
- Barriers: `1287`, raw text `880`, macro substitution `5`, opaque storage `1235`

## Per-case improvement summary

- `sqrt_fx1000`: command delta `-174`, score-copy delta `-174`
- `sin_hp`: command delta `-51`, score-copy delta `-51`
- `sqrt_fx10000`: command delta `-51`, score-copy delta `-51`
- `sin_cos_hp_separate`: command delta `-50`, score-copy delta `-50`
- `div3_hp`: command delta `-49`, score-copy delta `-49`
- `double_div`: command delta `-49`, score-copy delta `-49`
- `double_mul`: command delta `-49`, score-copy delta `-49`
- `int_temp_heavy`: command delta `-5`, score-copy delta `-5`

## Decision

- No default local-copy/RMW enablement. The gate still recommends manual experimental opt-in only.
- Do not start a new broad optimizer pass from this report alone: the largest remaining counts are raw/opaque or lowering-compat boundaries, not obviously safe typed-local peepholes.
- Safe next optimizer work should be report-only or a tiny existing-pattern peephole with RED equivalence tests first. If the next candidate requires non-local dataflow, stop and defer.

## Residual summary from gate JSON

```json
{
  "mode": "experimental-local-copy-rewrite",
  "status": "diagnostic",
  "onCaseCount": 14,
  "totalResidualCount": 991,
  "residualByStatus": [
    {
      "status": "unknown",
      "count": 732,
      "caseNames": [
        "branched_arithmetic",
        "div3_hp",
        "double_div",
        "double_mul",
        "fixed_mul_div",
        "int_add_sub_mul",
        "int_arithmetic",
        "int_const_var_mix",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_branched_arithmetic/function/probe__then_0.mcfunction:1: scoreboard players operation $ret __arith_branched_arithmetic = $probe_t0 __arith_branched_arithmetic",
        "data/arith_branched_arithmetic/function/probe__merge_1.mcfunction:1: scoreboard players operation $ret __arith_branched_arithmetic = $probe_t1 __arith_branched_arithmetic",
        "data/arith_branched_arithmetic/function/probe.mcfunction:1: scoreboard players operation $probe_t0 __arith_branched_arithmetic = $p0 __arith_branched_arithmetic"
      ]
    },
    {
      "status": "safeCandidate",
      "count": 259,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "int_arithmetic",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_div3_hp/function/sqrt_hp__merge_1.mcfunction:5: scoreboard players operation $sqrt_hp_t10 __arith_div3_hp = $sqrt_hp_t5 __arith_div3_hp",
        "data/arith_div3_hp/function/norm3_hp.mcfunction:25: scoreboard players operation $norm3_hp_t16 __arith_div3_hp = $norm3_hp_t14 __arith_div3_hp",
        "data/arith_div3_hp/function/ln_hp__merge_1.mcfunction:1: scoreboard players operation $ln_hp_t7 __arith_div3_hp = $ln_hp_t0 __arith_div3_hp"
      ]
    }
  ],
  "residualByPattern": [
    {
      "status": "safeCandidate",
      "pattern": "score_copy -> score_arith",
      "count": 157,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "int_arithmetic",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_div3_hp/function/sqrt_hp__merge_1.mcfunction:5: scoreboard players operation $sqrt_hp_t10 __arith_div3_hp = $sqrt_hp_t5 __arith_div3_hp",
        "data/arith_div3_hp/function/norm3_hp.mcfunction:25: scoreboard players operation $norm3_hp_t16 __arith_div3_hp = $norm3_hp_t14 __arith_div3_hp",
        "data/arith_div3_hp/function/ln_hp__merge_1.mcfunction:1: scoreboard players operation $ln_hp_t7 __arith_div3_hp = $ln_hp_t0 __arith_div3_hp"
      ]
    },
    {
      "status": "unknown",
      "pattern": "score_copy -> score_copy -> score_copy",
      "count": 86,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "int_add_sub_mul",
        "int_arithmetic",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_div3_hp/function/div3_hp.mcfunction:2: scoreboard players operation $div3_hp_t1 __arith_div3_hp = $p1 __arith_div3_hp",
        "data/arith_div3_hp/function/div3_hp.mcfunction:3: scoreboard players operation $div3_hp_t2 __arith_div3_hp = $p2 __arith_div3_hp",
        "data/arith_div3_hp/function/sqrt_hp__merge_1.mcfunction:10: scoreboard players operation $p0 __arith_div3_hp = $sqrt_hp_t0 __arith_div3_hp"
      ]
    },
    {
      "status": "unknown",
      "pattern": "execute -> score_copy -> boundary",
      "count": 72,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_div3_hp/function/sin_hp.mcfunction:8: scoreboard players operation $ret __arith_div3_hp = $sin_hp_t2 __arith_div3_hp",
        "data/arith_div3_hp/function/cos_hp.mcfunction:8: scoreboard players operation $ret __arith_div3_hp = $cos_hp_t2 __arith_div3_hp",
        "data/arith_div3_hp/function/div_hp.mcfunction:13: scoreboard players operation $ret __arith_div3_hp = $div_hp_t4 __arith_div3_hp"
      ]
    },
    {
      "status": "unknown",
      "pattern": "boundary -> score_copy -> score_copy",
      "count": 68,
      "caseNames": [
        "branched_arithmetic",
        "div3_hp",
        "double_div",
        "double_mul",
        "fixed_mul_div",
        "int_add_sub_mul",
        "int_arithmetic",
        "int_const_var_mix",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_branched_ar
```

## LIR opportunity summary from gate JSON

```json
{
  "totalScoreCopyCount": 991,
  "byStatus": {
    "currentlyOptimized": 0,
    "safeCandidate": 259,
    "blockedByBarrier": 0,
    "unknown": 732
  },
  "topPatterns": [
    {
      "status": "safeCandidate",
      "pattern": "score_copy -> score_arith",
      "count": 157,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "int_arithmetic",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_int_arithmetic/function/probe.mcfunction:3: scoreboard players operation $probe_t4 __arith_int_arithmetic = $probe_t0 __arith_int_arithmetic",
        "data/arith_int_div_mod_mix/function/probe.mcfunction:4: scoreboard players operation $probe_t3 __arith_int_div_mod_mix = $probe_t0 __arith_int_div_mod_mix",
        "data/arith_int_temp_heavy/function/probe.mcfunction:4: scoreboard players operation $probe_t3 __arith_int_temp_heavy = $probe_t0 __arith_int_temp_heavy"
      ]
    },
    {
      "status": "unknown",
      "pattern": "score_copy -> score_copy -> score_copy",
      "count": 86,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "int_add_sub_mul",
        "int_arithmetic",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_int_arithmetic/function/probe.mcfunction:2: scoreboard players operation $probe_t1 __arith_int_arithmetic = $p1 __arith_int_arithmetic",
        "data/arith_int_add_sub_mul/function/probe.mcfunction:2: scoreboard players operation $probe_t1 __arith_int_add_sub_mul = $p1 __arith_int_add_sub_mul",
        "data/arith_int_add_sub_mul/function/probe.mcfunction:3: scoreboard players operation $probe_t2 __arith_int_add_sub_mul = $p2 __arith_int_add_sub_mul"
      ]
    },
    {
      "status": "unknown",
      "pattern": "execute -> score_copy -> boundary",
      "count": 72,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_sqrt_fx10000/function/sin_hp.mcfunction:8: scoreboard players operation $ret __arith_sqrt_fx10000 = $sin_hp_t2 __arith_sqrt_fx10000",
        "data/arith_sqrt_fx10000/function/cos_hp.mcfunction:8: scoreboard players operation $ret __arith_sqrt_fx10000 = $cos_hp_t2 __arith_sqrt_fx10000",
        "data/arith_sqrt_fx10000/function/div_hp.mcfunction:13: scoreboard players operation $ret __arith_sqrt_fx10000 = $div_hp_t4 __arith_sqrt_fx10000"
      ]
    },
    {
      "status": "unknown",
      "pattern": "boundary -> score_copy -> score_copy",
      "count": 68,
      "caseNames": [
        "branched_arithmetic",
        "div3_hp",
        "double_div",
        "double_mul",
        "fixed_mul_div",
        "int_add_sub_mul",
        "int_arithmetic",
        "int_const_var_mix",
        "int_div_mod_mix",
        "int_temp_heavy",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_int_arithmetic/function/probe.mcfunction:1: scoreboard players operation $probe_t0 __arith_int_arithmetic = $p0 __arith_int_arithmetic",
        "data/arith_int_add_sub_mul/function/probe.mcfunction:1: scoreboard players operation $probe_t0 __arith_int_add_sub_mul = $p0 __arith_int_add_sub_mul",
        "data/arith_int_div_mod_mix/function/probe.mcfunction:1: scoreboard players operation $probe_t0 __arith_int_div_mod_mix = $p0 __arith_int_div_mod_mix"
      ]
    },
    {
      "status": "unknown",
      "pattern": "score_add_imm -> score_copy -> function_call",
      "count": 39,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_sqrt_fx1000/function/isqrt__loop_body_7.mcfunction:7: scoreboard players operation $isqrt_t3 __arith_sqrt_fx1000 = $isqrt_t7 __arith_sqrt_fx1000",
        "data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:4: scoreboard players operation $isqrt_t12 __arith_sqrt_fx1000 = $isqrt_t15 __arith_sqrt_fx1000",
        "data/arith_sqrt_fx1000/function/isqrt__merge_16.mcfunction:4: scoreboard players operation $isqrt_t16 __arith_sqrt_fx1000 = $isqrt_t23 __arith_sqrt_fx1000"
      ]
    },
    {
      "status": "unknown",
      "pattern": "score_arith -> score_copy -> function_call",
      "count": 39,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx1000",
        "sqrt_fx10000"
      ],
      "examples": [
        "data/arith_sqrt_fx1000/function/sqrt_fixed.mcfunction:4: scoreboard play
```

## Unknown-cause split summary from gate JSON

```json
{
  "totalUnknownLike": 31,
  "byUnknownCause": [
    {
      "cause": "boundary-or-cross-function",
      "count": 12,
      "caseNames": [
        "data/arith_div3_hp/function/ln_hp.mcfunction",
        "data/arith_double_div/function/ln_hp.mcfunction",
        "data/arith_double_mul/function/ln_hp.mcfunction",
        "data/arith_sin_cos_hp_separate/function/ln_hp.mcfunction"
      ],
      "examples": [
        "div3_hp:data/arith_sqrt_fx10000/function/div3_hp.mcfunction:2: scoreboard players operation $div3_hp_t1 __arith_sqrt_fx10000 = $p1 __arith_sqrt_fx10000",
        "double_div:data/arith_sqrt_fx10000/function/div3_hp.mcfunction:2: scoreboard players operation $div3_hp_t1 __arith_sqrt_fx10000 = $p1 __arith_sqrt_fx10000",
        "double_mul:data/arith_sqrt_fx10000/function/div3_hp.mcfunction:2: scoreboard players operation $div3_hp_t1 __arith_sqrt_fx10000 = $p1 __arith_sqrt_fx10000"
      ]
    },
    {
      "cause": "missing-predecessor-evidence",
      "count": 1,
      "caseNames": [
        "sqrt_fx1000"
      ],
      "examples": [
        "sqrt_fx1000:data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:2: scoreboard players operation $isqrt_t15 __arith_sqrt_fx1000 = $isqrt_t12 __arith_sqrt_fx1000"
      ]
    },
    {
      "cause": "opaque-window",
      "count": 18,
      "caseNames": [
        "data/arith_div3_hp/function/ln_5term__loop_body_1.mcfunction",
        "data/arith_div3_hp/function/norm3_hp.mcfunction",
        "data/arith_double_div/function/ln_5term__loop_body_1.mcfunction",
        "data/arith_double_div/function/norm3_hp.mcfunction"
      ],
      "examples": [
        "data/arith_div3_hp/function/ln_5term__loop_body_1.mcfunction:data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:2: scoreboard players operation $isqrt_t15 __arith_sqrt_fx1000 = $isqrt_t12 __arith_sqrt_fx1000",
        "data/arith_div3_hp/function/norm3_hp.mcfunction:data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:2: scoreboard players operation $isqrt_t15 __arith_sqrt_fx1000 = $isqrt_t12 __arith_sqrt_fx1000",
        "data/arith_double_div/function/ln_5term__loop_body_1.mcfunction:data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:2: scoreboard players operation $isqrt_t15 __arith_sqrt_fx1000 = $isqrt_t12 __arith_sqrt_fx1000"
      ]
    }
  ],
  "examples": [
    {
      "caseName": "data/arith_div3_hp/function/ln_5term__loop_body_1.mcfunction",
      "cause": "opaque-window",
      "evidence": "data/arith_div3_hp/function/ln_5term__loop_body_1.mcfunction:data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:2: scoreboard players operation $isqrt_t15 __arith_sqrt_fx1000 = $isqrt_t12 __arith_sqrt_fx1000"
    },
    {
      "caseName": "data/arith_div3_hp/function/norm3_hp.mcfunction",
      "cause": "opaque-window",
      "evidence": "data/arith_div3_hp/function/norm3_hp.mcfunction:data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:2: scoreboard players operation $isqrt_t15 __arith_sqrt_fx1000 = $isqrt_t12 __arith_sqrt_fx1000"
    },
    {
      "caseName": "data/arith_double_div/function/ln_5term__loop_body_1.mcfunction",
      "cause": "opaque-window",
      "evidence": "data/arith_double_div/function/ln_5term__loop_body_1.mcfunction:data/arith_sqrt_fx1000/function/isqrt__loop_body_10.mcfunction:2: scoreboard players operation $isqrt_t15 __arith_sqrt_fx1000 = $isqrt_t12 __arith_sqrt_fx1000"
    }
  ]
}
```

## VIR decision dashboard from gate JSON

```json
{
  "status": "stay-experimental",
  "statusReason": "unsupported cases: 8/14; allocation-check failures: 3; supported ratio 43% < 50%; semantic proof unsupported: 8; proven cases below minimum: 1/3; direct rejection dominance 50% > 45%; unsupported cases remain blockers and cannot count as semantic proof; allocation-check closeout: 3 across 3 case(s)",
  "recommendationReason": "stay-experimental: unsupported cases: 8/14; allocation-check failures: 3; supported ratio 43% < 50%; semantic proof unsupported: 8; proven cases below minimum: 1/3; direct rejection dominance 50% > 45%; unsupported cases remain blockers and cannot count as semantic proof; allocation-check closeout: 3 across 3 case(s)",
  "totalCaseCount": 14,
  "consideredCases": 14,
  "consideredFunctions": 6,
  "totalFunctionCount": 6,
  "supportedCases": 6,
  "unsupportedCases": 8,
  "plannedAcceptedFunctionCount": 3,
  "directAcceptedFunctionCount": 0,
  "directRejectedFunctionCount": 3,
  "directSelectedFunctionCount": 3,
  "plannedSelectedFunctionCount": 3,
  "acceptedPlannedCases": 3,
  "selectedDirectCases": 3,
  "rejectedDirectCases": 3,
  "unsupportedFunctionCount": 0,
  "unsupportedCaseCount": 8,
  "rejectionCategoryTotals": {
    "planned_unsupported": 0,
    "allocation_check_failed": 3,
    "higher_cost": 0,
    "direct_unsupported": 0,
    "unsupported_both": 0
  },
  "topRejectionCategories": [
    {
      "category": "allocation_check_failed",
      "count": 3
    },
    {
      "category": "direct_unsupported",
      "count": 0
    },
    {
      "category": "higher_cost",
      "count": 0
    },
    {
      "category": "planned_unsupported",
      "count": 0
    },
    {
      "category": "unsupported_both",
      "count": 0
    }
  ],
  "unsupportedReasonTotals": {
    "allocation-check-failure": 3,
    "planned-lowering-unsupported": 3,
    "unsupported-control-flow-shape": 2,
    "unsupported-mir-op-kind": 6
  },
  "topUnsupportedReasons": [
    {
      "reason": "unsupported-mir-op-kind",
      "count": 6
    },
    {
      "reason": "allocation-check-failure",
      "count": 3
    },
    {
      "reason": "planned-lowering-unsupported",
      "count": 3
    },
    {
      "reason": "unsupported-control-flow-shape",
      "count": 2
    }
  ],
  "blockerTagTotals": {
    "case-unsupported": 8,
    "proof-gap": 13,
    "reason:allocation-check-failure": 3,
    "reason:planned-lowering-unsupported": 3,
    "reason:unsupported-control-flow-shape": 2,
    "reason:unsupported-mir-op-kind": 6
  },
  "directCommandCount": 69,
  "plannedCommandCount": 25,
  "directScoreCopyCount": 27,
  "plannedScoreCopyCount": 3,
  "commandDeltaSummary": {
    "min": -14,
    "max": -3,
    "total": -44,
    "average": -7.333,
    "improvedCount": 6,
    "regressedCount": 0,
    "unchangedCount": 0
  },
  "scoreCopyDeltaSummary": {
    "min": -6,
    "max": -3,
    "total": -24,
    "average": -4,
    "improvedCount": 6,
    "regressedCount": 0,
    "unchangedCount": 0
  },
  "semanticProofSummary": {
    "provenEquivalentCount": 1,
    "unsupportedCount": 8,
    "missingProofCount": 5,
    "unprovenCount": 5
  },
  "directVsPlannedCommandDelta": -44,
  "directVsPlannedScoreCopyDelta": -24,
  "directToPlannedScoreCopyReductionPercent": 88.88888888888889,
  "unsupportedReasonBreakdown": [
    {
      "reason": "unsupported-mir-op-kind",
      "count": 6,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx10000"
      ],
      "controlledCaseNames": [],
      "broadCaseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx10000"
      ]
    },
    {
      "reason": "allocation-check-failure",
      "count": 3,
      "caseNames": [
        "int_add_sub_mul",
        "int_div_mod_mix",
        "int_temp_heavy"
      ],
      "controlledCaseNames": [
        "int_add_sub_mul",
        "int_div_mod_mix",
        "int_temp_heavy"
      ],
      "broadCaseNames": []
    },
    {
      "reason": "planned-lowering-unsupported",
      "count": 3,
      "caseNames": [
        "int_add_sub_mul",
        "int_div_mod_mix",
        "int_temp_heavy"
      ],
      "controlledCaseNames": [
        "int_add_sub_mul",
        "int_div_mod_mix",
        "int_temp_heavy"
      ],
      "broadCaseNames": []
    },
    {
      "reason": "unsupported-control-flow-shape",
      "count": 2,
      "caseNames": [
        "branched_arithmetic",
        "sqrt_fx1000"
      ],
      "controlledCaseNames": [
        "branched_arithmetic"
      ],
      "broadCaseNames": [
        "sqrt_fx1000"
      ]
    }
  ],
  "unsupportedMirOpKindBreakdown": [
    {
      "opKind": "call",
      "count": 6,
      "caseNames": [
        "div3_hp",
        "double_div",
        "double_mul",
        "sin_cos_hp_separate",
        "sin_hp",
        "sqrt_fx10000"
      ],
      "controlledCaseNames": [],
      "broad
```
