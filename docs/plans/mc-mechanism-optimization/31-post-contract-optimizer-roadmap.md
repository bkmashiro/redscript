# 31. Post-Contract Optimizer Roadmap

> **For Hermes/Spark:** This is the next active roadmap after backend contract hardening. Use `30-backend-contract-hardening-roadmap.md` as the completed contract foundation and start new optimizer/backend work here.

**Goal:** Build on the hardened LIR/backend contracts to add safe, evidence-backed optimizer improvements without default-enabling risky experimental paths.

**Architecture:** Keep Source -> AST -> TypeCheck -> HIR -> MIR -> Optimizer -> LIR -> Emit. New work must use the shared LIR effect model, `verifyLIR`, typed ScoreInt/immediate instructions, opaque raw/macro barriers, pass-manager stats, and semantic equivalence tests.

## Non-goals

- No compiler rewrite.
- No default local-copy experimental enablement yet.
- No raw/macro semantic parsing.
- No ABI/call cleanup without negative fixtures.
- No parser/typechecker/HIR/MIR/LSP/package/workflow churn unless a real blocker requires it.

## Tracks and order

```text
P11. Optimizer coverage audit and fixture classification.
P12. Safe algebraic/no-op peephole expansion using typed LIR + equivalence tests.
P13. Temp lifetime/dead materialization expansion with ABI barriers.
P14. Call/return ABI cleanup readiness spike, read-only or diagnostic first.
P15. Default-enablement ADR for local-copy/RMW only if gates justify it.
P16. Storage/NBT/raw-boundary typed sidecar spike, no production parser.
```

## P11 - Optimizer coverage audit and fixture classification

**Status:** Done. See [32 - LIR Optimizer Coverage Audit](./32-lir-optimizer-coverage-audit.md).

**Product promise:** The next optimizer tranche starts from a checked inventory of existing pass contracts, tests, opaque boundaries, and remaining risk.

**Acceptance:**

- Inventory existing LIR passes and shared helpers.
- Classify each pass/helper by default/experimental status, shared effect model usage, verifier coverage, equivalence coverage, opaque barrier behavior, remaining risk, and next action.
- Add low-risk tests only if the audit finds an obvious gap.

**P11 gate:**

```bash
git diff --check
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/optimizer/lir/equivalence.test.ts \
  src/__tests__/optimizer/lir/interpreter.test.ts \
  --runInBand
```

## P12 - Safe typed LIR peephole expansion

**Status:** Done.

**Product promise:** Add only local, typed scoreboard no-op/algebraic cleanup that can be proved by verifier-friendly LIR and the bounded interpreter.

**Initial safe slice:** Normalize typed `score_delta` by zero as an optimizer-level no-op. The emitter already treats it as no emitted command, so moving the no-op removal into the LIR pass manager makes the contract explicit without changing generated datapack behavior.

**Allowed files for first slice:**

- `src/optimizer/lir/peephole.ts`
- `src/__tests__/optimizer/lir/peephole.test.ts`
- `src/__tests__/optimizer/lir/equivalence.test.ts`
- this roadmap status section

**Acceptance:**

- Remove only typed `score_delta { value: 0 }`.
- Do not inspect or parse raw/macro text for semantic proof.
- Add targeted output-shape test.
- Add semantic equivalence fixture with boundary values in the new interpreter.
- Keep experimental local-copy disabled by default.

**P12 gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/optimizer/lir/peephole.test.ts \
  src/__tests__/optimizer/lir/equivalence.test.ts \
  src/__tests__/optimizer/lir/pipeline.test.ts \
  --runInBand
npm run test:lir
npm run test:probe
npm run build
npm run validate-mc
git diff --check
npm run gate:lir-local-copy -- --output /tmp/redscript-p12-safe-peephole.json
```

## P13 - Temp lifetime/dead materialization expansion

**Status:** Done.

**Outcome (2026-06-30):** Added negative ABI/barrier fixtures before any production change. Existing `deadSlotElim`/`deadSlotElimModule` behavior already preserves the covered `$ret_*`/`$pN`, macro, call-macro, call-context, storage/NBT, and cross-function mention cases, so no optimizer implementation change was made.

**Scope:** Expand dead materialization cleanup only where protected slots, cross-function mentions, call barriers, raw/macro barriers, and observed outputs are explicit in tests.

**First action:** Add negative ABI fixtures before production changes.

**Candidate fixture families:**

- Protected ABI slots: `$ret`, `$ret_*`, `$p0`, `$p1`, and future call-argument slots must not be removed or coalesced only because local liveness says they are dead.
- Cross-function mentions: module-level DSE may remove compiler-owned temps only when the slot is read by the same function and not mentioned by another function.
- Opaque barriers: raw, macro, call, call_macro, call_context, storage/NBT reads/writes must preserve nearby materialization unless the pass has typed proof.
- Observed outputs: equivalence fixtures should observe only real ABI/result slots or deliberately seeded visible slots, not removed compiler temps.
- Overwrite windows: adjacent pure writes can be considered only for compiler-owned temps and only when no read/barrier intervenes.

**Allowed files for first P13 slice:**

- `src/__tests__/optimizer/lir/dead_slot.test.ts`
- `src/__tests__/optimizer/lir/equivalence.test.ts`
- `src/optimizer/lir/dead_slot.ts` only after failing fixtures exist
- `src/optimizer/lir/analysis.ts` only for a proven liveness bug

**Forbidden in P13:**

- Do not rewrite call/return ABI paths.
- Do not parse raw/macro text as semantic proof.
- Do not alter default experimental local-copy flags.
- Do not weaken `verifyLIR`.

**P13 gate template:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/optimizer/lir/dead_slot.test.ts \
  src/__tests__/optimizer/lir/equivalence.test.ts \
  src/__tests__/optimizer/lir/pipeline.test.ts \
  --runInBand
npm run test:lir
npm run build
git diff --check
```

**P13 gates run (2026-06-30):**

- `npm test -- --selectProjects unit --runTestsByPath src/__tests__/optimizer/lir/dead_slot.test.ts src/__tests__/optimizer/lir/equivalence.test.ts src/__tests__/optimizer/lir/pipeline.test.ts --runInBand`
- `npm run test:lir`
- `npm run build`
- `git diff --check`

## P14 - Call/return ABI cleanup readiness spike

**Status:** Done.

**Outcome (2026-06-30):** Completed read-only inventory in [`33-call-return-abi-readiness-spike.md`](./33-call-return-abi-readiness-spike.md). Current `$pN`/`$ret*` slots are shared ABI-visible state, call/macro/context/storage boundaries remain conservative barriers, and no production ABI cleanup is safe without a narrower typed branch/return validation tranche first.

**Scope:** Read-only or diagnostic first. Inventory return/parameter materialization shapes and blockers. Do not rewrite ABI/call paths until negative fixtures exist.

**P14 gates run (2026-06-30):**

- `npm run build`
- `git diff --check`

## P15 - Local-copy/RMW default-enablement ADR

**Status:** Done.

**Decision (2026-06-30):** Default enablement rejected/deferred in [`34-local-copy-rmw-default-enablement-adr.md`](./34-local-copy-rmw-default-enablement-adr.md). The gate passes as evidence, but its own rollout recommendation remains `manual-experimental-opt-in-only`, the VIR dashboard says `stay-experimental`, and bounded offline evidence is not production correctness proof.

**Scope:** Use `gate:lir-local-copy` as evidence only. Default enablement requires an ADR with CI evidence, stable offline equivalence families, no benchmark regressions, and a rollback plan.

**P15 gates run (2026-06-30):**

- `npm run gate:lir-local-copy -- --output /tmp/redscript-p15-lir-local-copy-adr.json`
- `npm run build`
- `git diff --check`

## P16 - Storage/NBT/raw-boundary sidecar spike

**Status:** Done.

**Outcome (2026-06-30):** Completed exploratory sidecar design in [`35-storage-nbt-raw-boundary-sidecar-spike.md`](./35-storage-nbt-raw-boundary-sidecar-spike.md). Recommended next action is a derived diagnostic helper for typed `LIRInstr` effects; no production raw parser and no behavior-changing optimizer pass.

**Scope:** Explore typed sidecar metadata for storage/NBT/raw boundaries. Do not add a production raw command parser.

**P16 gates run (2026-06-30):**

- `npm run build`
- `git diff --check`

## Roadmap status

- [x] P11 optimizer coverage audit.
- [x] P12 safe typed LIR peephole expansion.
- [x] P13 temp lifetime/dead materialization expansion.
- [x] P14 call/return ABI readiness spike.
- [x] P15 local-copy/RMW default-enablement ADR.
- [x] P16 storage/NBT/raw-boundary sidecar spike.
