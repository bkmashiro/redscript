# P9 live Minecraft lifecycle evidence — Paper 1.21.4

Date: 2026-08-02 (Europe/London)

This record is **live Paper evidence**, not static command validation. The complete machine-readable report is [`p9-live-minecraft-1.21.4.json`](./p9-live-minecraft-1.21.4.json).

## Oracle identity

| Component | Evidence |
|:--|:--|
| Minecraft/Paper | `1.21.4-232-12d8fe0 (MC: 1.21.4)` |
| Paper SHA-256 | `5ee4f542f628a14c644410b08c94ea42e772ef4d29fe92973636b6813d4eaffc` |
| TestHarness SHA-256 | `e94171d60f3f36cf679f1a557a4b7187616c745486de9f42aaf6d72f736334de` |
| Evidence JSON SHA-256 | `bf1f9243e6a16c1d2cc4ca4ca9a26982e92ed5c0e7a8077cfc9c548ed11e04fe` |
| Java | `openjdk version "25.0.2" 2026-01-20` |
| Runner | `npm run test:mc-lifecycle:live` |
| Result | **12 passed, 0 failed, 0 skipped** |

The runner created a disposable server root, reused the pinned local Paper libraries and TestHarness plugin, created a fresh world, performed a graceful stop/start, and removed the temporary server afterward. It did not alter `~/mc-test-server/world`.

## Artifact graph exercised

Phase 1 contained 12 artifacts. Phase 2 contained 13:

- source-level typed block tag;
- strict from-file predicate;
- strict from-file GZIP structure NBT;
- package-level typed recipe;
- package-level typed advancement;
- package-level typed predicate;
- package-level typed loot table;
- package-level typed item modifier;
- generated functions/load tag and `pack.mcmeta`;
- phase-2 strict from-file dimension registry.

All builders and from-file resources were merged through the canonical artifact graph and atomic directory projection. Phase 2 partitioned into 12 `reload` artifacts and one `world_reopen` artifact (`data/p9/dimension/after_restart.json`).

## Lifecycle results

| Phase | Live assertion | Result |
|:--|:--|:--|
| startup | exact 1.21.4 server; clean pack load; mixed graph executable | PASS |
| `/reload` | function changed 10→20; typed tag gold→diamond; predicate false→true; structure gold→diamond | PASS |
| `/reload` boundary | new `p9:after_restart` dimension remained unavailable | PASS |
| commands | canonical program executed `setup → invoke → cleanup`; final score `42` | PASS |
| restart | Paper PID changed; restart log clean; scoreboard state `31` survived | PASS |
| world reopen | phase-2 dimension became executable only after restart reopened the world | PASS |

The structure experiment corrected an earlier descriptor assumption: Java structure templates are reloadable on Paper 1.21.4. `structure` is therefore classified as `reload`; `dimension` and `dimension_type` are classified as `world_reopen`.

## Stable versus snapshot channels

- **Stable live channel:** Minecraft/Paper 1.21.4, proven by this run.
- **26.2 snapshot/schema channel:** remains static-only and is not relabeled as live proof.
- `DEFAULT_MC_VERSION` remains unchanged. A future default switch still requires a compatible 26.2 command audit and live oracle.
- Typed worldgen builders remain deferred; P9 adds only strict JSON `dimension` / `dimension_type` descriptors needed to exercise the lifecycle boundary.

## Reproduction and skip semantics

```bash
# Strict live proof; exits non-zero if prerequisites are unavailable.
MC_P9_TEMPLATE_DIR=~/mc-test-server npm run test:mc-lifecycle:live

# Offline-safe evidence probe; writes [SKIP] and exits zero if unavailable.
MC_P9_TEMPLATE_DIR=~/mc-test-server npm run test:mc-lifecycle
```

The template must contain `paper.jar`, offline `libraries/`, `versions/`, and exactly one `plugins/redscript-testharness*.jar`. TestHarness port `25561` must be free because the runner owns server startup and restart. The JSON report defaults to `build/p9-live-report.json` and can be retained by CI as an evidence artifact.
