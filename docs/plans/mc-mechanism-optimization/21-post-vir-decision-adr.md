# Post-VIR Decision ADR

Status: **closed**
Scope: documentation only
Related plan: [16 — Post-VIR Optimizer Spark Roadmap](./16-post-vir-optimizer-spark-roadmap.md)
Date: 2026-06-26

## Decision summary

Keep VIR in experimental/read-only mode and do not integrate it into the production compiler pipeline now.

- Production compiler pipeline and VIR production hooks remain untouched.
- Tranche E added diagnostics only; no emitted LIR behavior changes shipped.
- LIR and VIR are separated: LIR diagnostics indicate a narrow rewrite opportunity, but no LIR rewrite has shipped in Tranche E.

## Required tranche questions

1. Did fixture splitting remove false blockers from the arithmetic dashboard?

Yes for setup-only raw summon-marker-setup cases. The family now reports as setup-only and not as true arithmetic blockers.

2. How many supported cases are semantically proven?

Only one supported case is semantically proven.

3. Are allocation-check failures zero, reduced, or merely classified?

Currently merely classified. There are three allocation-check failures and the lane has a documented diagnosis but no production-affecting fix.

4. Did any production-safe LIR improvement ship independently of VIR?

No production-safe behavior change shipped in Tranche E. LIR work there is diagnostic-only.

5. Should VIR continue, pause, or stay as read-only experimental infrastructure?

Stay as read-only experimental infrastructure.

6. What exact conditions must be true before production integration is reconsidered?

- Unsupported-case coverage must become operationally acceptable for the arithmetic target set, not just documented.
- Semantic proof coverage must grow to meet tranche minimums with no unresolved proof gap blockers.
- Allocation-check failures must be resolved or fully eliminated for supported cases.
- Direct rejection dominance and planner readiness gates must pass, not remain fail states.
- Any future LIR rewrite must have explicit safety proof and integration-gated behavior tests before production hook changes.
- Production compiler integration must remain off until these conditions are independently demonstrated.

## Evidence table from tranches B–E

| Tranche | Evidence | Outcome |
| --- | --- | --- |
| B | `fixtureBoundarySummary` split `raw:summon-marker-setup` as setup-only | `trueArithmeticUnsupportedCount` for that family is 0; broad setup cases remain isolated as structural fixture debt |
| B | Mixed / unknown blockers now include `branched_arithmetic` and `sqrt_fx1000` | Dashboard now distinguishes true blockers from setup-only blockers |
| C | `provenEquivalentCount: 1` | `supportedButUnprovenCount: 5` and `unsupportedCount: 8`; only `int_arithmetic` is proven |
| D | `allocationCheckFailureCount: 3` | Affected: `int_add_sub_mul`, `int_div_mod_mix`, `int_temp_heavy`; class `dead-lhs-affinity-conflict`; status classified, not fixed |
| E | `lirOpportunitySummary` from `/tmp/redscript-tranche-e-lir-controller.json` | `totalScoreCopyCount 1277`, `safeCandidate 522`, `unknown 755`, recommendation `safe-local-rewrite-candidate`; diagnostic only |
| E | Tranche E integration effect | no emitted LIR behavior change; no production hooks modified |

## Current blockers and risks

- Unsupported cases remain `8/14`.
- Semantic proof gap remains open (`supportedButUnproven: 5`, `unsupported: 8`).
- Allocation-check failures remain `3`.
- Direct rejection dominance and planner readiness remain fail states in tranche readiness checks.
- LIR safe candidates are not proof of safe production rewrite without additional validation.

## External optimizer/toolchain posture

Use mature compiler optimizer tooling as concepts, test oracles, or offline research sidecars. Do **not** make LLVM/MLIR/Cranelift/Binaryen/egg/Z3 part of the production compile path without a separate, narrow spike and a measured win.

| Toolchain | Posture | Rationale |
| --- | --- | --- |
| LLVM / MLIR | Borrow concepts only; no production dependency now | RedScript targets Minecraft scoreboard/datapack commands, not CPU-like machine code. A custom dialect/backend/effect model would likely cost more than the saved generic passes. |
| Cranelift | Borrow backend/regalloc concepts only | The runtime model assumes machine registers and instructions; scoreboard fake-player/objective slots, protected ABI slots, and command barriers need custom handling. |
| Binaryen / WASM optimizers | Research-only unless a separate WASM pipeline appears | Useful for WASM projects, but too indirect for emitting Minecraft commands from the existing compiler path. |
| regalloc2-style allocators | Conceptual reference; project-owned slot planner remains preferred | Minecraft slot planning includes two-address destructive ops, protected `$ret`/`$pN`/const slots, raw command barriers, and command-count tradeoffs that do not map cleanly to a generic register allocator. |
| Z3 / SMT | Good as an offline proof oracle | Use for bounded arithmetic equivalence, rewrite preconditions, overflow/div/mod/fixed-scale checks, and proof-harness tests. Keep it out of production emission. |
| egg / egglog | Good as an offline rewrite exploration oracle | Use to discover candidate algebraic rewrites and costs, then promote only hand-audited rewrites into LIR with project tests. |
| fast-check | Good production-test dependency candidate if already acceptable for dev tooling | Use for property tests over LIR rewrites, slot/barrier invariants, and arithmetic equivalence. |

The default implementation direction remains project-owned TypeScript LIR infrastructure: liveness/next-use, slot reference indexing, barrier-aware local rewrite windows, verifier checks, deterministic benchmark dashboards, and a tiny pass manager. External tools can reduce proof/search work, but the Minecraft-specific semantics and safety gates stay in RedScript-owned code.

## Suggested next 2–3 Spark goals

1. Start a new LIR-only rewrite spike for the top `score_copy -> score_arith` candidate class, but ship behavior only if slot/barrier invariants and before/after tests prove it safe. Allow `fast-check`-style property tests or a small SMT oracle only as test/dev infrastructure, not production emission.
2. Add LIR blocker-provenance diagnostics for the remaining `unknown` score-copy bucket so future rewrites have exact safety reasons instead of textual guesses.
3. If exploring mature optimizers, run a docs/test-only oracle spike comparing Z3 or egg/egglog against 3-5 arithmetic rewrites; do not wire those tools into the production compiler path unless that spike produces a clear ADR and measured value.

## Spiked follow-up (2026-06-26)

- Follow-up outcome: implemented and shipped a narrow `score_copy -> score_arith` direct-adjacent rewrite in `src/optimizer/lir/rmw.ts` under the existing `scoreboardRmwPass` safety model.
- Safety gates now required for this rewrite: temporary-slot protection, module-level external mention rejection, liveness death-after-arithmetic check, adjacent-only/barrier-aware matching, and conservative non-commutative alias rejection (`dst == copied source` for `score_sub`/`score_div`/`score_mod`).
- Test evidence: targeted RED cases in `src/__tests__/optimizer/lir/rmw.test.ts` plus the existing LIR optimizer and arithmetic-probe suites validate unchanged safety for protected/read-before, external-mention, barrier, and alias scenarios.
- Corpus evidence: `/tmp/redscript-lir-score-copy-arith-spike-controller.json` still reports the same aggregate `scoreCopy` opportunity totals as Tranche E (`totalScoreCopyCount: 1277`, `safeCandidate: 522`, `unknown: 755`). Treat this rewrite as unit-proven infrastructure, not as a measured corpus win yet; the next LIR-only tranche should add blocker/provenance diagnostics for why benchmark candidates remain after this local rule.
