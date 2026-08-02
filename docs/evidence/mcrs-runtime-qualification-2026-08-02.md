# MCRS runtime qualification — 2026-08-02

## Qualified scope

Source revision: `663b2c9790922916bbe8b7f87e359b81bab24ed8`

The descriptor-driven **core semantic oracle** passed on two independently managed disposable Paper channels:

| Channel | Paper build | Result | Cleanup | Evidence |
|---|---|---:|---:|---|
| stable | `1.21.4-232-12d8fe0` | 30/30 | disposable root removed | `mcrs-runtime-core-stable-1.21.4.json` |
| compatibility | `26.2-87-a95ae8d` | 30/30 | disposable root removed | `mcrs-runtime-core-paper-26.2.json` |

The 30 tests comprise three static/drift checks and 27 isolated runtime descriptors. Runtime descriptors require all applicable layers to succeed:

1. compiler/project artifact generation;
2. unique owned datapack deployment;
3. Paper reload;
4. wrapper entrypoint started/completed receipts;
5. server-side semantic assertions; and
6. test-only emitted-function marker readback.

This qualifies the mapped core integer/scoreboard/control-flow/storage/lifecycle/command-boundary subset. It is **not** evidence that every RedScript language feature or stdlib API works in Minecraft.

### Stdlib representative semantic subset

Source revision: `c501f06bc0e5308af6e04ab365e1c80cc85b7d0d`

Six isolated stdlib representative cases passed on both managed Paper channels:

| Channel | Paper build | Result | Cleanup | Evidence |
|---|---|---:|---:|---|
| stable | `1.21.4-232-12d8fe0` | 6/6 | disposable root removed | `mcrs-runtime-stdlib-gap-stable-1.21.4.json` |
| compatibility | `26.2-87-a95ae8d` | 6/6 | disposable root removed | `mcrs-runtime-stdlib-gap-paper-26.2.json` |

The cases cover representative behavior from `advanced`, `expr`, `linalg`, `sets`, `result`, and `state`. The mapped public API scope is exactly `advanced.fib`, `expr.expr_eval`, `linalg.vec2d_dot`, `result.result_divide`, `result.result_value`, `state.set_state`, `state.is_state`, plus `sets.set_new`, `set_add`, `set_contains`, `set_remove`, and `set_clear`. The linalg case asserts both multiplication terms and the final dot product with bounded double-to-fixed conversion tolerance. The sets case asserts unique handles, duplicate-add idempotence, membership, removal, and clear semantics. Every case requires emitted-function marker readback.

This is representative module evidence, not qualification of every declaration in those modules.

## Explicitly unqualified scope

### Remaining stdlib scope

The checked-in stdlib catalog records 51 modules, 721 total functions/methods, 58 internal functions, 663 public runtime-required probes, and 401 constants. Exactly 12 public APIs have scenario mappings on both channels; 651 remain explicitly unmapped. A representative case does not qualify every declaration in its module, and direct fixture references are not promoted to runtime proof.

### Managed player lane

Mineflayer `TestBot` successfully joined the stable disposable server and the strict bot prerequisite ran. Diagnostic result: **29 passed / 9 failed / 38 total**, with successful bot/Paper cleanup. The failed scenarios cover interaction/sneaking/look/spawn behavior and ItemUse/EntityKill event paths. Therefore the player-required lane is not release-qualified.

### Legacy monolithic integration suite

After suite-pack isolation, the historical server-only suite improved from 66 to 61 failures (`406 passed / 61 failed / 16 skipped`). This remains diagnostic because the monolithic fixture graph can still conflate deploy/load/entrypoint and semantic failures. It is not canonical release evidence.

## Evidence boundaries

Repository validation before the evidence runs passed `npm run build` and the complete explicit-offline Jest matrix: **345 suites / 6155 tests passed**, with 3 live-only suites / 28 tests explicitly skipped. Those offline passes are regression evidence only, not Paper runtime proof.

- A Paper `Done (...)` line is startup evidence only.
- Offline Jest passes and compile-only checks are not Paper runtime proof.
- Stable and Paper 26.2 reports are separate artifacts and must not be relabeled across channels.
- Player/visual behavior is not inferred from server-only command success.
- All four canonical reports record `disposableRootRemoved: true`; the frozen template worlds were not used as runtime roots.
