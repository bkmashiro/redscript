# Minecraft Mechanism Arithmetic Optimization Workplan

> **For Hermes/Spark:** Use `subagent-driven-development` for implementation slices. Start with read-only probes/design lanes, then promote only verified mechanisms behind explicit helper APIs.

**Goal:** Turn the ChatGPT Pro mechanism report into a Spark-manageable roadmap for reducing RedScript numeric/helper command cost without changing language-level `fixed` semantics.

**Architecture:** Keep compiler-owned `fixed` at ×10000. Explore optimizations at helper/runtime/codegen layers: compile-time command-cost probes first, live Paper probes for server mechanisms second, public stdlib helper promotion last.

**Tech Stack:** RedScript compiler/toolchain, TypeScript/Jest, `benchmarks/arithmetic-probes.ts`, Paper/TestHarnessPlugin integration, Minecraft Java datapack commands.

---

## Source report split

- [00 — Cost model and benchmark contract](./00-cost-model-and-benchmark-contract.md)
- [01 — High-confidence mechanisms](./01-high-confidence-mechanisms.md)
- [02 — Speculative live probes](./02-speculative-probes.md)
- [03 — Low-priority / unreliable ideas](./03-low-priority-risks.md)
- [04 — Compiler/runtime optimization patterns](./04-compiler-runtime-optimization-patterns.md)
- [05 — Priority roadmap](./05-priority-roadmap.md)
- [06 — Spark delivery handoff](./06-spark-delivery-handoff.md)
- [07 — Scoreboard RMW optimizer design](./07-rmw-optimizer-design.md)

## Operating rules

1. Do **not** change language-level `fixed` semantics. Optimizations belong in helper APIs, runtime backends, codegen, or optimizer passes.
2. Do **not** promote a Minecraft mechanism from idea to stdlib helper until a live probe verifies server-side readback, determinism, version behavior, and command/tick cost.
3. Benchmark reports must separate static line count from real server cost:
   `C = (L, F, Q, R, T, S, V, tick_time_ns)`.
4. Prefer small Spark lanes with non-overlapping files. Controller owns final review, gates, commit, and no-push policy.
5. Any downstream stdlib docs must still be generated from the main `redscript` repository, not hand-edited in `redscript-docs`.

## Immediate next slices

Completed setup lanes:

1. Static arithmetic probe cost model: `estimatedCost` now tracks forks/selectors/NBT/macro/setup hints.
2. Live-probe scaffolds exist for display decomposition, item-modifier attributes, and enchantment level-based values. They are `MC_LIVE_PROBES=true` gated and skipped by default; offline skip is not MC proof.
3. Lane 6 produced the scoreboard RMW optimizer design: [07 — Scoreboard RMW optimizer design](./07-rmw-optimizer-design.md).

Near-term implementation order:

1. Implement the conservative LIR scoreboard RMW optimizer first.
2. Add a `scoreCopy`/RMW-specific counter to `benchmarks/arithmetic-probes.ts` if the first pass needs direct trend tracking.
3. Benchmark `sin_hp` + `cos_hp` separately before deciding whether `sincos_hp` is worth a public helper.
4. Run the existing live probes on the target Paper/TestHarness server before promoting display/attribute/enchantment backends.

Deferred / not near-term:

- AI/pathfinding/POI/mob-target mechanisms.
- Shulker bullet homing and general mob behavior oracles.
- Redstone analog ALU, light/sculk/leaves distance fields, worldgen noise, item merge reductions, XP/player-state oracles.

These remain in the source report as research notes only; they should not receive Spark implementation lanes unless a concrete user scenario justifies their real server cost.
