# P9 Live Minecraft Evidence — Paper 26.2

Date: 2026-08-02

## Environment

| Field | Value |
|---|---|
| Version channel | `paper-26.2` |
| Server | Paper `26.2-87-a95ae8d` (`MC: 26.2`) |
| Paper SHA-256 | `3ab7536642d04c504a06fe43174b8a94f8c5f25d5847d4672212413f6e54b906` |
| Java | OpenJDK `25.0.2` |
| TestHarness | `1.2.0` |
| TestHarness SHA-256 | `b85f11fbcfcc8e341b82159be753e35f04992e0e59420e56fcfa9049a2678b2d` |
| Evidence JSON SHA-256 | `9cdb0157c42ad197e061dc0f08b771ebdfec4ce173e535fd709c38c8acff0f3d` |
| Result | **13 passed, 0 failed, 0 skipped** |

## Command

```bash
MC_P9_VERSION_CHANNEL=paper-26.2 \
MC_JAVA_BIN=/opt/homebrew/opt/openjdk/bin/java \
MC_P9_TEMPLATE_DIR="$HOME/mc-test-server-26.2" \
npm run test:mc-lifecycle:live
```

The runner used the canonical project compiler, typed artifact builders, artifact graph, and atomic projection path. It created a disposable server root and fresh air-only `minecraft:the_void` overworld, applied 26.2 data-driven deterministic gamerules across loaded worlds, verified the `y=63` smooth-stone floor, and removed the temporary server after graceful shutdown. The template's world was not reused as evidence.

## Lifecycle Results

| Phase | Runtime assertion | Result |
|---|---|---|
| startup | exact Paper 26.2 runtime; verified deterministic void fixture; clean mixed-artifact datapack load | PASS |
| reload | function/tag/predicate/structure mutation visible; dimension still unavailable | PASS |
| commands | canonical setup/invoke/cleanup sequence executed in manifest order | PASS |
| same-world restart | new JVM process; scoreboard persisted; phase-2 resources remained executable | PASS |
| world reopen | phase-2 dimension became executable only after world reopen | PASS |

Machine-readable details, artifact lifecycle partitions, command hash, process IDs, and per-check results are in [`p9-live-minecraft-26.2.json`](./p9-live-minecraft-26.2.json).

## Evidence Boundary

This is real Paper 26.2 server-side lifecycle proof for the generated fixture. It does not replace the independently preserved Paper 1.21.4 regression evidence, and it does not claim coverage for arbitrary third-party datapacks, clients, or future Minecraft versions.
