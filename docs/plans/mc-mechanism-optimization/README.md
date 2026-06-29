# Minecraft Mechanism / Optimizer Plans

> **For Hermes/Spark:** The previous VIR arithmetic spike plan is archived. Use the active roadmap below for new Spark-sized implementation tranches.

**Active decision:** [21 — Post-VIR Decision ADR](./21-post-vir-decision-adr.md)
**Active roadmap/tracker:** [27 — LIR Local-Copy Manual Opt-In Active Roadmap](./27-lir-local-copy-active-roadmap.md)
**Historical tranche log:** [16 — Post-VIR Optimizer Spark Roadmap](./16-post-vir-optimizer-spark-roadmap.md)

## Archived plan set

The old mechanism optimization + experimental VIR arithmetic lane is preserved here:

- [2026-06 VIR arithmetic spike archive](./archive/2026-06-vir-arithmetic-spike/README.md)

That archive contains the original 00–15 docs, including the cost-model split, RMW/LIR infrastructure notes, VIR architecture recommendation, near-term roadmap, decision dashboard, evidence pack, and blocker drilldown closeout.

## Current posture

- The experimental VIR arithmetic lane is closed for now.
- Production compiler pipeline remains untouched by the VIR prototype.
- New work should be split into bounded Spark tranches with explicit allowed files, forbidden layers, tests, and controller review gates.
- Do not resume broad VIR expansion until semantic proof and allocation-check blockers are addressed by a dedicated tranche.
- Mature compiler toolchains are guidance/oracle material, not current production dependencies: keep production optimization project-owned in TypeScript LIR; consider Z3/egg/egglog/fast-check only as bounded offline proof/search/test sidecars unless a future ADR approves dependency adoption.

## Current decision

Use [21](./21-post-vir-decision-adr.md) as the decision source and [27](./27-lir-local-copy-active-roadmap.md) as the active tracker for future `/goal` or Spark continuation prompts.
The older [16](./16-post-vir-optimizer-spark-roadmap.md) remains a historical tranche log through Phase Y.
