# Minecraft Mechanism / Optimizer Plans

> **For Hermes/Spark:** Use the active roadmap below as the source of truth for new RedScript backend optimizer work. The previous VIR/local-copy/post-local-copy plan sets are archived for reference only.

## Active roadmap

- [31 - Post-Contract Optimizer Roadmap](./31-post-contract-optimizer-roadmap.md)

The backend contract-hardening foundation is complete in [30 - Backend Contract Hardening Roadmap](./30-backend-contract-hardening-roadmap.md). The next phase builds on those contracts with bounded optimizer/backend work:

1. shared LIR effect model;
2. `verifyLIR` in the real compile pipeline;
3. typed immediate scoreboard LIR + ScoreInt checks;
4. raw/macro opaque safety policy;
5. protected-vs-compiler-owned slot classification;
6. LIR pass-manager/idempotence cleanup;
7. macro/version hard errors;
8. function path/reference validation;
9. emit/compile decomposition;
10. semantic equivalence/property tests.

Next active order:

1. P11 optimizer coverage audit and fixture classification.
2. P12 safe algebraic/no-op peephole expansion using typed LIR plus equivalence tests.
3. P13 temp lifetime/dead materialization expansion with ABI barriers.
4. P14 call/return ABI cleanup readiness spike.
5. P15 default-enablement ADR for local-copy/RMW only if gates justify it.
6. P16 storage/NBT/raw-boundary typed sidecar spike.

## Archived plan sets

- [2026-06 VIR arithmetic spike archive](./archive/2026-06-vir-arithmetic-spike/README.md)
- [2026-06 post-local-copy optimizer roadmaps archive](./archive/2026-06-post-local-copy-optimizer-roadmaps/README.md)

The second archive contains the former active root docs `16`–`29`, including the post-VIR Spark log, local-copy proof-to-release tracker, optimizer roadmap index, and R5 call/return diagnostic.

## Current posture

- RedScript should not be rewritten from scratch.
- The existing Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit datapack architecture remains the production path.
- New work should harden stage contracts and correctness gates before adding higher-risk optimizer rewrites.
- Spark work must be split into bounded tranches with explicit allowed files, forbidden scope, exact commands, and controller review.
- Mature compiler toolchains are guidance/oracle material only. Keep production optimizer infrastructure project-owned in TypeScript unless a future ADR approves a bounded dependency.
