# 18. VIR Semantic Proof Harness v0 Report

Date: 2026-06-26

Scope: Tranche C from [16 — Post-VIR Optimizer Spark Roadmap](./16-post-vir-optimizer-spark-roadmap.md).

## Goal

Introduce a conservative offline semantic proof signal for a tightly scoped, controlled arithmetic subset without widening VIR semantics.

## Decision

- Keep probe result `virDecision` payload additive.
- Add per-case `semanticProofDetails` with:
  - `status`: `proven` | `unproven` | `unsupported`
  - `method`: `offline-arithmetic-model` | `fixture-expected-output` | `none`
  - `reason`: short deterministic reason string
- Add a deterministic harness gate that only marks a whitelisted controlled case as proven when lowering metadata satisfies conservative preconditions (controlled-only, planned mode, no reason tags).

## Current conservative witness

- `int_arithmetic` (controlled, single-function pure arithmetic)
  - `status: proven`
  - `method: fixture-expected-output`
  - reason: offline fixture witness exists and lowered in planned mode with no blocker tags

## Conservative constraints

- All other supported arithmetic probes remain `unproven` unless explicitly added to the witness registry.
- Unsupported probes remain `unsupported` and cannot contribute to proof counts.
- Probe output stays deterministic and sorted by existing case/proof sort logic.

## Verified commands

```bash
npm test -- src/__tests__/arithmetic-probes.test.ts --runInBand
npm test -- src/__tests__/optimizer/vir --runInBand
npm run build
npm run validate-mc
git diff --check
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-c-semantic-proof-controller.json
```

Results:

- arithmetic probe tests: 42 passed;
- VIR optimizer tests: 33 passed;
- build: passed;
- MC validation: 12 passed;
- diff check: passed;
- arithmetic benchmark: passed.

## Representative evidence fields

From `/tmp/redscript-tranche-c-semantic-proof-controller.json`:

```json
{
  "semanticProofSummary": {
    "provenEquivalentCount": 1,
    "unsupportedCount": 8,
    "missingProofCount": 5,
    "unprovenCount": 5
  },
  "semanticProofCloseout": {
    "status": "fail",
    "provenSupportedCount": 1,
    "supportedButUnprovenCount": 5,
    "unsupportedCount": 8,
    "provenSupportedCaseNames": ["int_arithmetic"]
  },
  "goNoGoStatus": "stay-experimental"
}
```

The semantic proof closeout remains conservative while any `unsupported` or `supported-but-unproven` cases remain. This harness is a first explicit witness signal, not a runtime/server oracle.
