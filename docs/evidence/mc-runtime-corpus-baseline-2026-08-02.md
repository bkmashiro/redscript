# MCRS runtime corpus diagnostic baseline — 2026-08-02

> **Evidence class:** diagnostic only. This is not canonical runtime proof and must not be used as release evidence.

## Result

A disposable Paper 1.21.4 run of the pre-redesign `mc-integration` Jest project returned:

```text
Test Suites: 2 failed, 3 skipped, 10 passed, 15 total
Tests:       66 failed, 16 skipped, 401 passed, 483 total
Time:        353.161 s
```

Command:

```bash
MC_SERVER_DIR=/tmp/redscript-corpus-stable-baseline \
MC_HOST=127.0.0.1 \
MC_PORT=25561 \
npm test -- --selectProjects mc-integration --runInBand --testTimeout=120000
```

The server ran from a disposable copy, not from the frozen template. It was stopped gracefully with exit code `0`, and `/tmp/redscript-corpus-stable-baseline` was removed.

## Environment identity

| Component | Identity |
|---|---|
| RedScript | `c7a6709aca579722a4ecbdb15f96009717da85a2`; worktree clean when the run began |
| Minecraft/Paper | `1.21.4-232-12d8fe0` |
| Paper JAR SHA-256 | `5ee4f542f628a14c644410b08c94ea42e772ef4d29fe92973636b6813d4eaffc` |
| TestHarness | `1.2.0` |
| TestHarness JAR SHA-256 | `b85f11fbcfcc8e341b82159be753e35f04992e0e59420e56fcfa9049a2678b2d` |
| Java | OpenJDK `25.0.2` |
| TestBot | unavailable |

## Truthful classification

| Classification | Count | Meaning |
|---|---:|---|
| `deployment/entrypoint-unproven` | 66 failed | The current suite did not independently prove datapack load and entrypoint execution, so zero/mismatched values cannot yet be attributed to compiler semantics. |
| `player-prerequisite` | 16 skipped | Player-required behavior did not execute because TestBot was unavailable. |
| non-canonical pass | 401 passed | These callbacks passed, but the old project was offline-skippable and used shared mutable datapack state; they are not promoted to per-feature Paper receipts. |

The failures were concentrated in:

- `src/__tests__/mc-integration.test.ts`: 64 failures;
- `src/__tests__/mc-integration/syntax-coverage.test.ts`: 2 failures.

The syntax failures observed zero array-parameter results where `150` and `60` were expected. They remain `deployment/entrypoint-unproven` until isolated deployment and entrypoint receipts are available; this document does **not** call them compiler bugs.

## Why this run cannot prove full MCRS coverage

1. Live availability was guarded by early returns, so Jest could report a passing callback without game execution.
2. Player-dependent tests could return when TestBot was absent.
3. Suites shared `world/datapacks/redscript-test`, including merged or cleared load/tick tags.
4. The harness did not emit per-case datapack-load or entrypoint-execution receipts.
5. No source-function reachability markers were collected.

The redesigned managed corpus oracle must close all five gaps before replacing this baseline.

## Machine-readable artifact

- JSON: `docs/evidence/mc-runtime-corpus-baseline-2026-08-02.json`
- JSON SHA-256: `1434f14b6d228117d0355e35fb1547eea098e37c3c41cb25518b798a7c1a1c85`
