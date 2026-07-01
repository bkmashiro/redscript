# Minecraft Mechanism / Optimizer Plans

> **For Hermes/Codex:** Use the active roadmap below as the source of truth for new RedScript backend optimizer work. Previous VIR/local-copy/post-local-copy plan sets are archived for reference only.

## Active roadmap

- [37 - Registry Resource and `.d.mcrs` Declaration Surface Roadmap](./37-registry-resource-and-declaration-surface.md)

The backend contract-hardening and post-contract optimizer foundations are complete:

- [36 - Typed Boundary and Diagnostic Optimizer Roadmap](./36-typed-boundary-and-diagnostic-roadmap.md)

- [30 - Backend Contract Hardening Roadmap](./30-backend-contract-hardening-roadmap.md)
- [31 - Post-Contract Optimizer Roadmap](./31-post-contract-optimizer-roadmap.md)
- [32 - LIR Optimizer Coverage Audit](./32-lir-optimizer-coverage-audit.md)
- [33 - Call/Return ABI Readiness Spike](./33-call-return-abi-readiness-spike.md)
- [34 - Local-copy/RMW Default Enablement ADR](./34-local-copy-rmw-default-enablement-adr.md)
- [35 - Storage/NBT/Raw-Boundary Sidecar Spike](./35-storage-nbt-raw-boundary-sidecar-spike.md)

## Current phase

Roadmap `37` is the active product-DX lane after release-readiness and backend diagnostic hardening:

1. add a registry catalog and LSP completions for existing string positions;
2. represent declaration-only functions and registry resources in parser/AST;
3. typecheck `.d.mcrs` declaration contracts and typed resource categories;
4. add declaration import/non-emitting compile behavior;
5. gradually migrate stdlib resource APIs while preserving string compatibility;
6. add contextual unquoted `namespace:path` literals only after typed contexts are pinned;
7. generate `.d.mcrs` package declaration surfaces from exports;
8. keep release/docs evidence honest about compile/static/golden/live proof.

## Archived plan sets

- [2026-06 VIR arithmetic spike archive](./archive/2026-06-vir-arithmetic-spike/README.md)
- [2026-06 post-local-copy optimizer roadmaps archive](./archive/2026-06-post-local-copy-optimizer-roadmaps/README.md)

The second archive contains the former active root docs `16`–`29`, including the post-VIR Spark log, local-copy proof-to-release tracker, optimizer roadmap index, and R5 call/return diagnostic.

## Current posture

- RedScript should not be rewritten from scratch.
- The existing Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit datapack architecture remains the production path.
- New work should harden stage contracts and correctness gates before adding higher-risk optimizer rewrites.
- Raw/macro text remains opaque; regex-like extraction may be used only as conservative safety/debug hints.
- Local-copy/RMW remains manual experimental opt-in unless a future ADR with stronger gates changes that decision.
- Spark/Codex work must be split into bounded tranches with explicit allowed files, forbidden scope, exact commands, and controller review.
- Mature compiler toolchains are guidance/oracle material only. Keep production optimizer infrastructure project-owned in TypeScript unless a future ADR approves a bounded dependency.
