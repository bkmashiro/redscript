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

Source revision: `146b199a34cd66f44a3b700fdd115def9023d081`

Twelve isolated stdlib cases passed on both managed Paper channels:

| Channel | Paper build | Result | Cleanup | Evidence |
|---|---|---:|---:|---|
| stable | `1.21.4-232-12d8fe0` | 12/12 | disposable root removed | `mcrs-runtime-stdlib-gap-stable-1.21.4.json` |
| compatibility | `26.2-87-a95ae8d` | 12/12 | disposable root removed | `mcrs-runtime-stdlib-gap-paper-26.2.json` |

The cases cover representative behavior from `advanced`, `bits`, `calculus`, `expr`, `linalg`, `list`, `math`, `sets`, `result`, `state`, and `timer`. The mapped public API scope is exactly `advanced.fib`, all 11 public `bits` APIs (`bit_and`, `bit_or`, `bit_xor`, `bit_not`, `bit_shl`, `bit_shr`, `bit_get`, `bit_set`, `bit_clear`, `bit_toggle`, `popcount`), all seven mapped `calculus` APIs (`deriv_forward`, `deriv_central`, `integrate_trapezoid`, `integrate_simpson`, `running_mean`, `running_m2`, `variance_from_m2`), `expr.expr_eval`, `linalg.vec2d_dot`, 16 fixed-parameter `list` APIs (`avg3`, `avg5`, `list_min3`, `list_min5`, `list_max3`, `list_max5`, `list_sum3`, `list_sum4`, `list_sum5`, `sort2_min`, `sort2_max`, `sort3`, `sort4`, `sort5`, `weighted2`, `weighted3`) and all 10 dynamic-array `list` APIs (`list_sum`, `list_avg`, `list_min`, `list_max`, `list_contains`, `list_index_of`, `list_dedup_count`, `list_sort_asc`, `list_sort_desc`, `list_shuffle`), eight `math` APIs (`abs`, `min`, `max`, `clamp`, `lerp`, `isqrt`, `pow_int`, `gcd`), `result.result_divide`, `result.result_value`, `state.set_state`, `state.is_state`, plus `sets.set_new`, `set_add`, `set_contains`, `set_remove`, and `set_clear`, all six timer conversion functions (`tick_to_seconds`, `tick_to_ms`, `seconds_to_ticks`, `format_time_s`, `format_time_m`, `format_time_h`), and all eight `Timer` methods (`new`, `start`, `pause`, `reset`, `done`, `elapsed`, `remaining`, `tick`). The bits case asserts every API independently and requires all 11 emitted-function markers. The calculus case uses 10 independent numeric assertions and requires the direct/specialized projection artifacts for all seven claimed APIs. The math case uses 16 independent numeric assertions; `clamp`, `gcd`, `isqrt`, and `pow_int` require function markers while auto-inlined `abs`, `min`, `max`, and `lerp` are proved through direct server-observed results. The fixed-list case uses 28 exact assertions, exercises every sort output position and every deterministic weighted branch, and requires the 10 actually executed non-inlined projection markers. The dynamic-list case requires all 10 specialized root markers and exact server readback for aggregate, search, deduplication, ascending/descending mutation, and deterministic shuffle; shuffle proves both the returned array and original in-place array equal `[3,2,1,4]` through the `rs:array_return` copy ABI. The timer case uses 22 exact server assertions, including two-instance isolation and inactive/pause/resume/cap/reset transitions; its conversion calls are auto-inlined and its methods use the compiler-authoritative Timer intrinsic path. The linalg case asserts both multiplication terms and the final dot product with bounded double-to-fixed conversion tolerance. The sets case asserts unique handles, duplicate-add idempotence, membership, removal, and clear semantics. Every case requires emitted-function marker readback where the claimed function is not inlined.

This is representative module evidence, not qualification of every declaration in those modules.

## Explicitly unqualified scope

### Remaining stdlib scope

The checked-in stdlib catalog records 50 modules, 717 total functions/methods, 58 internal functions, 659 public runtime-required probes, and 401 constants. Exactly 78 public APIs have scenario mappings on both channels; 581 remain explicitly unmapped. A representative case does not qualify every declaration in its module, and direct fixture references are not promoted to runtime proof.

### Removed invalid stdlib surface

The legacy `strings` module was removed instead of being counted as unqualified coverage. Its four APIs did not implement their advertised contracts: `str_len` returned NBT tag/list size rather than plain-string length, `str_concat` produced a list rather than a string, `str_contains` always returned `0`, and `str_slice` relied on unproven raw placeholder substitution. Compile-only self-tests and documentation that presented those behaviors as working features were removed with the module. This does not remove RedScript language string literals, format strings, or the verified string-return ABI.

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
