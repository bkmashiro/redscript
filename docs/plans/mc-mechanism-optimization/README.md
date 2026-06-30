# Minecraft Mechanism / Optimizer Plans

> **For Hermes/Codex:** Use the active roadmap below as the source of truth for new RedScript backend optimizer work. Previous VIR/local-copy/post-local-copy plan sets are archived for reference only.

## Active roadmap

- [36 - Typed Boundary and Diagnostic Optimizer Roadmap](./36-typed-boundary-and-diagnostic-roadmap.md)

The backend contract-hardening and post-contract optimizer foundations are complete:

- [30 - Backend Contract Hardening Roadmap](./30-backend-contract-hardening-roadmap.md)
- [31 - Post-Contract Optimizer Roadmap](./31-post-contract-optimizer-roadmap.md)
- [32 - LIR Optimizer Coverage Audit](./32-lir-optimizer-coverage-audit.md)
- [33 - Call/Return ABI Readiness Spike](./33-call-return-abi-readiness-spike.md)
- [34 - Local-copy/RMW Default Enablement ADR](./34-local-copy-rmw-default-enablement-adr.md)
- [35 - Storage/NBT/Raw-Boundary Sidecar Spike](./35-storage-nbt-raw-boundary-sidecar-spike.md)

## Current phase

Roadmap `36` continues from the P14-P16 conclusions:

1. derive typed boundary sidecar metadata without storing it on mutable LIR instructions;
2. use sidecar metadata in diagnostics/gate JSON only;
3. pin call/return ABI with compile-golden fixture families before cleanup;
4. validate or type the raw branch-return shape before relying on it;
5. expand storage/NBT boundary fixtures while keeping raw/macro opaque;
6. revisit local-copy/RMW evidence after diagnostics improve, still experimental by default;
7. optionally run Paper/TestHarness semantic smoke only when a live server is confirmed;
8. close with an explicit next decision index.

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
