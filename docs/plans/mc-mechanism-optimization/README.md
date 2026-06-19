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

## Operating rules

1. Do **not** change language-level `fixed` semantics. Optimizations belong in helper APIs, runtime backends, codegen, or optimizer passes.
2. Do **not** promote a Minecraft mechanism from idea to stdlib helper until a live probe verifies server-side readback, determinism, version behavior, and command/tick cost.
3. Benchmark reports must separate static line count from real server cost:
   `C = (L, F, Q, R, T, S, V, tick_time_ns)`.
4. Prefer small Spark lanes with non-overlapping files. Controller owns final review, gates, commit, and no-push policy.
5. Any downstream stdlib docs must still be generated from the main `redscript` repository, not hand-edited in `redscript-docs`.

## Immediate next slices

1. Extend `benchmarks/arithmetic-probes.ts` from static command categories to richer cost estimates: forks/selectors/NBT reads/macro calls/persistent state.
2. Add a live probe harness skeleton for mechanism experiments under a clearly isolated test namespace.
3. Run display decomposition characterization before adding any new SVD-backed helper.
4. Run attribute/enchantment ALU probes before designing dot/affine helper APIs.
5. Run combined `sincos_hp` as the first low-risk implementation slice.
