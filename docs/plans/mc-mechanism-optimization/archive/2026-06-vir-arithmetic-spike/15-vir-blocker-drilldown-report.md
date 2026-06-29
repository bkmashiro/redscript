# 15. VIR Blocker Drilldown Readiness Report

Date: 2026-06-25

Scope: diagnostic-only for the experimental VIR arithmetic lane.

## What Step 15 adds

- Added aggregate-level blocker drilldown fields to the arithmetic probe dashboard:
  - `unsupportedReasonBreakdown`
  - `caseBlockerMatrix`
  - `readinessChecklist`
  - `unknownReasonCaseNames`
- Kept probe-level `virDecision` payload stable and additive (`unsupportedReasonTags`, `blockerTags`, etc. still present).
- Kept all structured attribution from MIR→VIR and VIR→LIR as primary inputs; free-text reason fallback remains deterministic when tags are missing.
- Unsupported and semantically unproven cases remain blockers in readiness and next-goal derivation.
- Production compiler pipeline remains untouched; all changes stay inside benchmark/probe reporting.

## Representative dashboard shape (abridged)

```json
{
  "status": "stay-experimental",
  "statusReason": "unsupported cases: 8/14; semantic proof unsupported: 8; ...",
  "recommendationReason": "stay-experimental: unsupported cases: 8/14; semantic proof unsupported: 8; ...",
  "unsupportedReasonBreakdown": [
    {
      "reason": "unsupported-mir-op-kind",
      "count": 6,
      "caseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"],
      "controlledCaseNames": [],
      "broadCaseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"]
    }
  ],
  "caseBlockerMatrix": [
    {
      "caseName": "branched_arithmetic",
      "coverageCategory": "controlled",
      "status": "unsupported",
      "semanticProofStatus": "unsupported",
      "unsupportedReasonTags": ["unsupported-control-flow-shape"],
      "blockerTags": ["case-unsupported", "proof-gap", "reason:unsupported-control-flow-shape"],
      "commandDelta": -24,
      "scoreCopyDelta": -7
    }
  ],
  "readinessChecklist": [
    { "id": "unsupported-case-coverage", "status": "fail", "detail": "unsupported cases: 8/14" },
    { "id": "semantic-proof-gap", "status": "fail", "detail": "semantic proof unsupported: 8" },
    { "id": "unknown-reason-cases", "status": "pass", "detail": "no unknown reason cases" }
  ],
  "unknownReasonCaseNames": [],
  "nextSafeGoals": [
    "eliminate or isolate blocker case reason: unsupported-mir-op-kind",
    "close semantic-proof gaps for supported probes before any continuation",
    "reduce planned allocation-check failures in planner output"
  ]
}
```

## Current recommendation

- **Expected recommendation:** `stay-experimental`.
- Continues unchanged from prior steps until blockers and proof-gap evidence are removed by benchmark data.

## Production pipeline

- No compiler pipeline, language runtime, or integration path changes were made.
- The experimental lane remains diagnostic-only until confidence thresholds pass.

## Next safe goals if continuing this lane

1. Resolve top unsupported blocker reason families first (with case-level evidence in `unsupportedReasonBreakdown`).
2. Eliminate remaining `semantic-proof-gap` blockers by adding direct proof coverage for supported probes.
3. Keep `unknownReasonCaseNames` empty by avoiding unstructured fallback reasons in new decision paths.

## Step 16 closeout (2026-06-26)

- Added deterministic unsupported MIR opcode drilldown to the arithmetic dashboard:
  - Added `unsupportedMirOpKindBreakdown` aggregate.
  - Added per-case `unsupportedMirOpKinds` in `caseBlockerMatrix`.
  - Kept behavior additive with no removals or renames.
- Added structured extraction of MIR opcode kinds from existing reason format (`unsupported instruction '<kind>' in '<fn>'`) and first-class pass-through of future structured `unsupportedMirOpKinds` metadata from `lowerMirToVir`.
- Updated `nextSafeGoals` to mention dominant opcode kind when blocker family is `unsupported-mir-op-kind`.
- Updated benchmark tests (and one lowering test) to keep case-level and aggregate semantics pinned and conservative.

## Representative dashboard shape with opcode drilldown (abridged)

```json
{
  "unsupportedMirOpKindBreakdown": [
    {
      "opKind": "call",
      "count": 6,
      "caseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"],
      "controlledCaseNames": [],
      "broadCaseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"]
    }
  ],
  "caseBlockerMatrix": [
    {
      "caseName": "double_div",
      "coverageCategory": "broad",
      "status": "unsupported",
      "semanticProofStatus": "unsupported",
      "unsupportedReasonTags": ["unsupported-mir-op-kind"],
      "blockerTags": ["case-unsupported", "proof-gap", "reason:unsupported-mir-op-kind"],
      "unsupportedMirOpKinds": ["call"]
    }
  ],
  "nextSafeGoals": [
    "eliminate or isolate blocker MIR opcode kind: call",
    "close semantic-proof gaps for supported probes before any continuation",
    "reduce planned allocation-check failures in planner output"
  ]
}
```

## Recommendation after Step 16

- **Expected recommendation:** still `stay-experimental`.
- Production compiler pipeline remains untouched.
- Continue to report `unsupported` + `unsupportedMirOpKindBreakdown` as **diagnostic evidence only** until proof and performance evidence crosses thresholds.

## Step 17 closeout (2026-06-26)

- Added deterministic call-target evidence for unsupported MIR `call` instructions in arithmetic probe diagnostics.
- Added source-of-truth metadata on `lowerMirToVir` unsupported results (`unsupportedMirCallTargets`) with:
  - function name (`fn`)
  - argument count (`argCount`)
  - result presence (`hasResult`)
- Added aggregate drilldown entry `unsupportedMirCallTargetBreakdown` in `virDecisionDashboard` with deterministic merge/sort behavior:
  - aggregate sorted by `count` desc then `fn` asc
  - per-entry `caseNames`, `controlledCaseNames`, `broadCaseNames` sorted asc
  - `argCounts` sorted numeric asc and unique
- Added fallback extraction from MIR reason text when structured metadata is missing, without inventing targets for non-call unsupporteds.
- Added a warning checklist item for missing call-target shape evidence: `unknown-call-target-details`.
- Updated `nextSafeGoals` to surface dominant call target when dominant blocking opcode is `call`.

## Representative call-target dashboard shape (actual Step 17 run, abridged)

```json
{
  "status": "stay-experimental",
  "unsupportedMirCallTargetBreakdown": [
    {
      "fn": "__raw:execute unless entity @e[tag=rs_trig,limit=1] run summon minecraft:marker ~ 0 ~ {Tags:[\"rs_trig\"]}",
      "count": 6,
      "caseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"],
      "controlledCaseNames": [],
      "broadCaseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"],
      "argCounts": [0],
      "hasResultCount": 0,
      "noResultCount": 6
    }
  ],
  "unknownMirCallTargetCaseNames": [],
  "readinessChecklist": [
    {
      "id": "unknown-call-target-details",
      "status": "pass",
      "detail": "call target details captured for call blockers"
    }
  ],
  "nextSafeGoals": [
    "isolate unsupported MIR call target: __raw:execute unless entity @e[tag=rs_trig,limit=1] run summon minecraft:marker ~ 0 ~ {Tags:[\"rs_trig\"]}",
    "close semantic-proof gaps for supported probes before any continuation",
    "reduce planned allocation-check failures in planner output"
  ]
}
```

## Recommendation after Step 17

- **Expected recommendation:** still `stay-experimental`.
- Recommendation remains unchanged: keep `production` or `compiler` pipelines untouched; this remains a diagnostics-only lane until benchmark and proof thresholds pass.

## Step 18 closeout (2026-06-26)

- Added deterministic call-target family classification for unsupported MIR `call` blockers in diagnostic summaries:
  - Added additive call target classification fields to each `unsupportedMirCallTargets` item:
    - `targetKind` (`raw-command` or `function`)
    - `rawCommandKind` (`summon-marker-setup` | `execute-raw` | `other-raw`)
    - `targetFamily` (canonical family key such as `raw:summon-marker-setup` or `function:sqrt_fx`)
    - `displayName` (stable display string)
  - Added `unsupportedMirCallTargetFamilyBreakdown` aggregate entries with deterministic shape:
    - `family`
    - `count`
    - `targetKinds`
    - `rawCommandKinds`
    - `caseNames`
    - `controlledCaseNames`
    - `broadCaseNames`
    - `exampleTargets`
- Applied deterministic categorization rules:
  - `__raw:` prefix -> `raw-command` family.
  - Raw marker setup command containing `summon minecraft:marker` and `rs_trig` -> `raw:summon-marker-setup`.
  - Other raw commands beginning with `execute ` -> `raw:execute-raw`.
  - Other raw commands -> `raw:other-raw`.
  - Non-`__raw:` targets -> `function:<fn>`.
- Updated `nextSafeGoals` generation to prefer concise family-first actioning when `call` is the dominant MIR blocker:
  - From raw command full target
  - To `isolate unsupported MIR call target family: raw:summon-marker-setup` (or other family key).

## Representative dashboard snippet for Step 18 (abridged)

```json
{
  "unsupportedMirCallTargetFamilyBreakdown": [
    {
      "family": "raw:summon-marker-setup",
      "count": 6,
      "targetKinds": ["raw-command"],
      "rawCommandKinds": ["summon-marker-setup"],
      "caseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"],
      "controlledCaseNames": [],
      "broadCaseNames": ["div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000"],
      "exampleTargets": [
        "__raw:execute unless entity @e[tag=rs_trig,limit=1] run summon minecraft:marker ~ 0 ~ {Tags:[\"rs_trig\"]}"
      ]
    }
  ],
  "nextSafeGoals": [
    "isolate unsupported MIR call target family: raw:summon-marker-setup",
    "close semantic-proof gaps for supported probes before any continuation",
    "reduce planned allocation-check failures in planner output"
  ]
}
```

## Recommendation after Step 18

- **Expected recommendation:** still `stay-experimental`.
- Recommendation remains unchanged: production compiler pipeline remains untouched; this work is purely experimental diagnostics and has no runtime or lowering changes.

## Step 19 closeout (2026-06-26)

- Added aggregate closeout diagnostics for remaining experimental blockers without changing production paths:
  - `rawSummonMarkerSetupIsolation` classifies `raw:summon-marker-setup` blockers into:
    - `isolated-structural-setup`
    - `true-arithmetic-blocker`
    - `mixed`
    - `unknown`
    - `none`
  - `semanticProofCloseout` separates:
    - `provenSupportedCaseNames`
    - `supportedButUnprovenCaseNames`
    - `unsupportedCaseNames`
  - `allocationCheckCloseout` summarizes known allocation-check failures and affected cases when case names are available.
- Added readiness checklist items for each closeout object and wired them into `nextSafeGoals`:
  - `raw-summon-marker-setup-isolation`
  - `semantic-proof-closeout`
  - `allocation-check-closeout`
- Added deterministic synthetic tests for all three closeouts and unchanged unsupported/proven classification rules.

## Step 19 recommendation

- **Decision gate recommendation:** `pause-and-review` for this lane.
- **Machine status:** remains `stay-experimental` in dashboard to keep conservative gating until hard blocker evidence is reduced.
- **Hard constraints preserved:** no parser/typechecker/LSP/CLI/emit/runtime behavior changes; benchmark/diagnostics only.
- **Operational next step:** keep lane paused unless a new production-integration plan explicitly requests continuation criteria and evidence collection updates.

### Representative closeout snippet shape (from latest run)

```json
{
  "status": "stay-experimental",
  "rawSummonMarkerSetupIsolation": {
    "status": "mixed",
    "caseCount": 2,
    "caseNames": ["raw_marker_controlled", "raw_marker_first"],
    "broadCaseNames": ["raw_marker_first"],
    "controlledCaseNames": ["raw_marker_controlled"],
    "semanticProofStatus": "unsupported",
    "recommendation": "keep lane stopped until raw summon-marker-setup context is split into setup-only + arithmetic cases",
    "notes": "raw summon-marker-setup spans both controlled and broad cases"
  },
  "semanticProofCloseout": {
    "status": "fail",
    "provenSupportedCount": 0,
    "supportedButUnprovenCount": 0,
    "unsupportedCount": 6,
    "provenSupportedCaseNames": [],
    "supportedButUnprovenCaseNames": [],
    "unsupportedCaseNames": ["branched_arithmetic", "div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sqrt_fx10000"],
    "detail": "unsupported cases remain blockers and cannot count as semantic proof"
  },
  "allocationCheckCloseout": {
    "status": "fail",
    "allocationCheckFailureCount": 3,
    "affectedCaseCount": 1,
    "affectedFunctionCount": 3,
    "affectedCaseNames": ["sqrt_fx10000"],
    "functionNamesAvailable": false,
    "recommendation": "allocation-check failures remain a planner blocker until reduced or isolated",
    "notes": "function-level provenance is unavailable from existing probe payload without invasive changes"
  },
  "readinessChecklist": [
    {
      "id": "raw-summon-marker-setup-isolation",
      "status": "fail",
      "detail": "raw summon-marker-setup appears in both controlled and broad unsupported contexts"
    },
    {
      "id": "semantic-proof-closeout",
      "status": "fail",
      "detail": "unsupported cases remain blockers and cannot count as semantic proof"
    },
    {
      "id": "allocation-check-closeout",
      "status": "fail",
      "detail": "allocation-check closeout: 3 across 1 case(s)"
    }
  ]
}
```

### Remaining research questions

1. What minimal deterministic fixture split proves `raw:summon-marker-setup` is setup-only and not arithmetic-dependent in this benchmark corpus?
2. What planner design changes reduce allocation-check failures without changing supported semantics or broadening production scope?
3. What targeted proof harness additions (offline + Paper-backed) are sufficient before any production continuation request?
