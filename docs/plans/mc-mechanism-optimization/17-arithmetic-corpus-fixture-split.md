# 17. Arithmetic Corpus Fixture Split Report

Date: 2026-06-26

Scope: Tranche A + B from [16 — Post-VIR Optimizer Spark Roadmap](./16-post-vir-optimizer-spark-roadmap.md).

## Summary

Tranche A audited the current optimizer/VIR/LIR state and confirmed Tranche B was still the safest next implementation slice. Tranche B added an additive fixture-boundary dashboard summary to the arithmetic probe report.

This remains diagnostic-only:

- no production compiler pipeline hook;
- no VIR call lowering;
- no parser/typechecker/LSP/registry/declaration/package metadata change;
- no public language semantics change.

## New dashboard field

`virDecisionDashboard.fixtureBoundarySummary`:

```ts
interface FixtureBoundarySummary {
  setupOnlyCaseNames: string[]
  setupOnlyUnsupportedCount: number
  trueArithmeticUnsupportedCaseNames: string[]
  trueArithmeticUnsupportedCount: number
  mixedOrUnknownCaseNames: string[]
  mixedOrUnknownCount: number
  dominantFixtureFamilies: Array<{
    family: string
    count: number
    caseNames: string[]
  }>
}
```

The field is additive and keeps existing per-case `virDecision` payloads stable.

## Representative result

Command:

```bash
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-b-fixture-split-controller.json
```

Representative dashboard snippet:

```json
{
  "status": "stay-experimental",
  "goNoGoStatus": "stay-experimental",
  "fixtureBoundarySummary": {
    "setupOnlyCaseNames": [
      "div3_hp",
      "double_div",
      "double_mul",
      "sin_cos_hp_separate",
      "sin_hp",
      "sqrt_fx10000"
    ],
    "setupOnlyUnsupportedCount": 6,
    "trueArithmeticUnsupportedCaseNames": [],
    "trueArithmeticUnsupportedCount": 0,
    "mixedOrUnknownCaseNames": [
      "branched_arithmetic",
      "sqrt_fx1000"
    ],
    "mixedOrUnknownCount": 2,
    "dominantFixtureFamilies": [
      {
        "family": "raw:summon-marker-setup",
        "count": 6,
        "caseNames": [
          "div3_hp",
          "double_div",
          "double_mul",
          "sin_cos_hp_separate",
          "sin_hp",
          "sqrt_fx10000"
        ]
      }
    ]
  },
  "semanticProofCloseout": {
    "status": "fail"
  }
}
```

## Decision

The dominant unsupported `call` family is now explicitly classified as setup-only fixture boilerplate (`raw:summon-marker-setup`) rather than a true arithmetic-lowering blocker.

However, the spike still stays experimental because:

- setup-only unsupported cases still count as unsupported and do not satisfy semantic proof;
- semantic proof remains `fail`;
- allocation-check failures remain on `int_add_sub_mul`, `int_div_mod_mix`, and `int_temp_heavy`.

## Verified commands

```bash
npm test -- src/__tests__/arithmetic-probes.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-b-fixture-split-controller.json
```

Results:

- arithmetic probe tests: 40 passed;
- build: passed;
- MC validation: 12 passed;
- diff check: passed;
- arithmetic benchmark: passed and produced the output above.

## Next safe tranche

Proceed to Tranche C or D, depending on priority:

1. Tranche C if the goal is to unblock the VIR continuation decision with proof evidence.
2. Tranche D if the goal is to reduce/diagnose the concrete planner allocation failures first.

Do not continue broad VIR feature expansion until one of those blockers is closed.
