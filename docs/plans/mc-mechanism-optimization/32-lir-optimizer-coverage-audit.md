# 32. LIR Optimizer Coverage Audit

> **P11 output for roadmap 31.** This audit classifies the current LIR optimizer/backend contract foundation after P1-P10. It is a planning artifact and does not authorize default enablement of experimental local-copy rewrites.

## Summary

The production LIR optimizer now has a shared effect model, verifier integration, pass-manager stats, typed immediate instructions, raw/macro opaque boundaries, and bounded semantic equivalence tests. The strongest default-safe areas are `constImmFold`, `deadSlotElimModule`, and default pass-manager idempotence. The experimental local-copy/RMW pass has meaningful evidence but remains opt-in only.

P12 started with the smallest typed no-op cleanup that does not require raw/macro/call/storage proof: remove typed `score_delta 0` in the existing peephole pass and prove equivalence with the bounded interpreter.

## Coverage table

| pass/helper | default or experimental | semantic read/write model usage | verifier coverage | equivalence coverage | opaque barrier behavior | remaining risk | recommended next action |
|---|---|---|---|---|---|---|---|
| `effects.ts` shared model | shared production helper | Defines source operands, semantic reads, writes, and barriers for every LIR instruction. | Indirect through optimizer and verifier tests; not itself a verifier. | Indirect through optimizer equivalence fixtures. | Marks raw, macro, calls, storage/NBT, and call contexts as barriers/opaque where appropriate. | `extractSlotsFromText` remains a conservative hint, not semantic proof. | Keep as the single source for pass effect queries; do not add raw parsing semantics. |
| `analysis.ts` liveness/reference helpers | shared production helper | Delegates semantic reads/source operands/writes to `effects.ts`; adds liveness and cross-function mention indexes. | Covered indirectly by `lir/verify.test.ts` and optimizer tests. | Covered through `dead_slot`, `rmw`, and equivalence tests. | Clears liveness across opaque barriers and treats raw/macro/calls conservatively. | `call_context` subcommand slot extraction is string-based and intentionally conservative. | Keep barrier behavior conservative; add negative fixtures before using it for stronger rewrites. |
| `const_imm.ts` | default production pass | Uses source operands for const use counts and avoids semantic read/write conflation. | `verifyLIR` covers invalid `score_delta` immediates; tests cover int32 min/out-of-range. | Covered by `equivalence.test.ts` for add/sub/copy/mul0/mod1/min/max fixtures. | Raw/macro text can block deletion of const materialization but never proves a rewrite safe. | Adjacent-only scope is safe but leaves possible non-adjacent optimizations on the table. | Keep default; expand only with local typed equivalence fixtures. |
| `dead_slot.ts` | default production pass | Uses semantic reads for liveness and protected-slot classification for ABI-like state. | Verifier protects slot objective invariants; tests cover protected `$ret`/`$pN`. | Covered by `equivalence.test.ts` for unobservable write removal. | Preserves writes before opaque barriers unless safety is proven; scans raw/macro mentions only as blockers. | Non-ABI user-visible scoreboard conventions are not globally knowable. | Add ABI-negative fixtures before broader temp lifetime cleanup. |
| `peephole.ts` | default production pass | Mostly local typed pattern checks; one legacy raw comparison peephole remains shape-limited. | Verifier covers typed output shape; raw peephole relies on existing mc-syntax/static tests. | Covered directly for typed `score_delta 0` and indirectly by pipeline tests; raw pattern equivalence remains intentionally limited. | Does not reason through arbitrary raw text; only one exact raw shape is rewritten. | Raw regex peephole should not be expanded without typed sidecar proof. | P12 first slice complete; keep future additions typed/local unless a sidecar proof exists. |
| `rmw.ts` | explicit experimental pass | Uses liveness, reference indexes, protected slots, and local rewrite windows. | Verifier covers output LIR shape when the pass is run in compile/gate paths. | Covered by `rewrite_equivalence.test.ts`, new `equivalence.test.ts`, and gate offline pack. | Treats raw/macro/calls as barriers and blocks externally mentioned slots. | Still evidence-only; second explicit runs can further canonicalize return paths. | Keep opt-in; expand fixture families before any ADR. |
| `pipeline.ts` | default pass manager plus experimental option | Runs shared passes in fixed order and reports pass stats. | Compile pipeline verifies LIR before/after optimization/finalization. | Default idempotence is tested; experimental equivalence is bounded. | Barrier behavior comes from child passes. | Experimental option is not release-ready proof. | Keep default flags unchanged; use stats in future ADR evidence. |
| `verify.ts` | production compile/backend guard | Structural guard over slots, function refs, macro placement, and `score_delta` immediates. | Directly covered by `src/__tests__/lir/verify.test.ts` and compile tests. | Not an equivalence layer. | Rejects structural macro/function mistakes; does not model raw/storage semantics. | Storage/NBT side effects remain conservatively opaque. | Keep strict by default; add validators before relaxing anything. |
| LIR scoreboard interpreter | test-only helper | Executes only typed local scoreboard instructions and `return_value`. | Not a verifier. | Directly powers `interpreter.test.ts` and `equivalence.test.ts`. | Rejects raw, macro, calls, storage/NBT, and execute/call boundaries as unsupported. | No call graph, storage, NBT, selector, or command-result semantics. | Use for local typed peepholes only; do not use it as Minecraft oracle proof. |

## P12 candidate chosen

**Chosen slice:** remove typed `score_delta` with value `0` in `execStorePeephole`.

**Status:** Done as the first P12 slice.

**Why this slice is safe:**

- It is typed LIR, not raw/macro text.
- It is local and does not cross instructions.
- It does not touch storage, NBT, calls, execute contexts, or ABI slots.
- The emitter already treats `score_delta 0` as no emitted command.
- The interpreter can prove observable scoreboard state and `$ret` are unchanged.

**Required tests:**

- Shape test in `peephole.test.ts`.
- Semantic equivalence fixture in `equivalence.test.ts` with boundary values `-2147483648`, `-1`, `0`, `1`, `2147483647`.
- Pipeline/default flag test should remain unchanged except for allowed typed no-op cleanup.

## Remaining risks

- Offline equivalence remains bounded and is not a real Paper server oracle.
- Experimental local-copy/RMW evidence is still manual opt-in only.
- Raw/macro/storage/NBT remain opaque; do not expand optimizer semantics through those boundaries.
- Full local unit gates may depend on environments that allow loopback HTTP binding; CI should remain the source for complete suite proof when local sandboxing forbids `server.listen`.
