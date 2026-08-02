# P9 live Minecraft lifecycle evidence — Paper 1.21.4

Date: 2026-08-02 (Europe/London)

This record is **live Paper evidence**, not static command validation. The complete machine-readable report is [`p9-live-minecraft-1.21.4.json`](./p9-live-minecraft-1.21.4.json).

## Oracle identity

| Component | Evidence |
|:--|:--|
| Version channel | `stable-1.21.4` |
| Minecraft/Paper | `1.21.4-232-12d8fe0 (MC: 1.21.4)` |
| Paper SHA-256 | `5ee4f542f628a14c644410b08c94ea42e772ef4d29fe92973636b6813d4eaffc` |
| TestHarness | `1.2.0` |
| TestHarness SHA-256 | `b85f11fbcfcc8e341b82159be753e35f04992e0e59420e56fcfa9049a2678b2d` |
| Evidence JSON SHA-256 | `ed14dca9f48399cd28abeb2fc665d09b4cbd639528936d6eb0c3c99467994b6d` |
| Java | `openjdk version "25.0.2" 2026-01-20` |
| Runner | `npm run test:mc-lifecycle:live` |
| Result | **13 passed, 0 failed, 0 skipped** |

The runner created a disposable server root, reused the pinned local Paper libraries and TestHarness plugin, created a fresh air-only `minecraft:the_void` world, applied version-correct deterministic rules, cleared the bounded test volume, restored and verified a smooth-stone floor at `y=63`, performed a graceful stop/start without resetting persisted state, and removed the temporary server afterward. It did not alter `~/mc-test-server/world`.

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
| startup | exact 1.21.4 server; verified air-only void fixture and `y=63` floor; clean pack load; mixed graph executable | PASS |
| `/reload` | function changed 10→20; typed tag gold→diamond; predicate false→true; structure gold→diamond | PASS |
| `/reload` boundary | new `p9:after_restart` dimension remained unavailable | PASS |
| commands | canonical program executed `setup → invoke → cleanup`; final score `42` | PASS |
| restart | Paper PID changed; restart log clean; scoreboard state `31` survived | PASS |
| world reopen | phase-2 dimension became executable only after restart reopened the world | PASS |

The structure experiment corrected an earlier descriptor assumption: Java structure templates are reloadable on Paper 1.21.4. `structure` is therefore classified as `reload`; `dimension` and `dimension_type` are classified as `world_reopen`.

## Stable versus snapshot channels

- **Stable regression channel:** Minecraft/Paper 1.21.4, independently proven by this run.
- **Current runtime channel:** Paper 26.2 build 87, independently proven by the [Markdown](./p9-live-minecraft-26.2.md) and [JSON](./p9-live-minecraft-26.2.json) evidence with the same 13 lifecycle checks.
- `DEFAULT_MC_VERSION` remains unchanged; selecting Paper 26.2 for the runtime oracle does not silently switch the compiler default.
- Typed worldgen builders remain deferred; P9 adds only strict JSON `dimension` / `dimension_type` descriptors needed to exercise the lifecycle boundary.

## Reproduction and skip semantics

```bash
# Stable 1.21.4 regression proof.
MC_P9_TEMPLATE_DIR=~/mc-test-server npm run test:mc-lifecycle:live

# Current Paper 26.2 proof.
MC_P9_VERSION_CHANNEL=paper-26.2 \
MC_P9_TEMPLATE_DIR=~/mc-test-server-26.2 \
npm run test:mc-lifecycle:live

# Offline-safe evidence probe; writes [SKIP] and exits zero if unavailable.
MC_P9_TEMPLATE_DIR=~/mc-test-server npm run test:mc-lifecycle
```

Each template must contain `paper.jar`, offline `libraries/`, `versions/`, and exactly one `plugins/redscript-testharness*.jar`. TestHarness port `25561` must be free because the runner owns server startup and restart. Stable output defaults to `build/p9-live-report.json`; the 26.2 channel defaults to `build/p9-live-report-26.2.json`. CI may retain either as an evidence artifact.
