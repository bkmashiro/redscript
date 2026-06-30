# 36. Typed Boundary and Diagnostic Optimizer Roadmap

> **For Hermes/Codex:** This is the next active roadmap after `31-post-contract-optimizer-roadmap.md`. Implement task-by-task with controller review. Do not stop after one tiny slice if the goal says to continue; after each coherent slice, update this roadmap, run the slice gates, commit/push if requested/default, then continue until blocked.

**Goal:** Convert the completed backend-contract and optimizer-spike work into a safer diagnostic/validation layer that can explain optimizer decisions, pin call/return/storage/raw boundaries, and prepare future optimization without changing default compiler semantics prematurely.

**Architecture:** Keep the production pipeline as Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit. The next phase adds derived metadata, validators, golden fixtures, and diagnostic reports around existing LIR/effect infrastructure before any risky optimizer behavior. Raw/macro text remains opaque; local-copy/RMW stays manual experimental opt-in.

**Tech Stack:** TypeScript, Jest, existing RedScript LIR/effect model, `verifyLIR`, MC static validator, optional Paper/TestHarness only when explicitly available.

---

## Why this roadmap exists

Roadmap `31` closed P11-P16:

- P13 proved current dead-slot cleanup preserves covered ABI/barrier cases.
- P14 concluded call/return ABI cleanup is not yet safe as production behavior.
- P15 rejected/deferred default local-copy/RMW enablement.
- P16 recommended a derived typed sidecar helper for diagnostics, not a production raw parser.

The next useful phase is therefore **boundary diagnostics and typed validation**, not more default optimizer rewrites.

## Non-goals

- No compiler rewrite.
- No new default optimizer behavior until a tranche explicitly proves it.
- No raw/macro semantic parser.
- No default local-copy/RMW enablement.
- No weakening `verifyLIR` default strictness.
- No ABI/call convention rewrite without negative compile-level fixtures and a separate ADR.
- No parser/typechecker/HIR/MIR/LSP/package/workflow churn unless a tranche explicitly requires it.

## Active order

```text
P17. Derived LIR boundary sidecar helper and exhaustive tests.
P18. Use sidecar only in diagnostics/gate JSON; no optimizer behavior change.
P19. Call/return ABI compile-golden fixture family.
P20. Typed branch-return validation spike for raw `execute ... return run function ...`.
P21. Storage/NBT boundary fixture family and validator diagnostics.
P22. Local-copy/RMW evidence closeout v2 after P17-P21, still experimental by default.
P23. Optional Paper/TestHarness semantic smoke for core ABI/storage cases.
P24. Roadmap/ADR closeout and next decision index.
```

## P17 - Derived LIR boundary sidecar helper

**Status:** Planned.

**Product promise:** Every LIR instruction kind has a derived boundary/effect summary that diagnostics can consume without reinterpreting raw command text.

**Allowed files:**

- Create: `src/optimizer/lir/boundary_sidecar.ts`
- Create: `src/__tests__/optimizer/lir/boundary_sidecar.test.ts`
- Modify only if needed: `src/optimizer/lir/effects.ts`
- Modify: this roadmap status section

**Forbidden:**

- Do not store sidecar metadata directly on mutable LIR instructions.
- Do not parse arbitrary `raw`/`macro_line` text as exact semantics.
- Do not change optimizer output.

**Implementation shape:**

Add a pure helper such as:

```ts
export type BoundaryConfidence = 'exact' | 'conservative' | 'opaque'
export type BoundaryProvenance = 'typed-lir' | 'macro-helper' | 'raw-user-command' | 'lowering-compat'

export interface BoundarySidecar {
  reads: Slot[]
  writes: Slot[]
  storageReads: StorageRef[]
  storageWrites: StorageRef[]
  opaqueScoreboardRead: boolean
  opaqueScoreboardWrite: boolean
  opaqueStorageRead: boolean
  opaqueStorageWrite: boolean
  macroSubstitution: boolean
  rawText: boolean
  barrier: boolean
  provenance: BoundaryProvenance
  confidence: BoundaryConfidence
}

export function deriveBoundarySidecar(instr: LIRInstr): BoundarySidecar
```

Use existing `getSlotEffect()` as the source of truth for scoreboard slot effects. Add small storage-ref helpers for typed NBT instructions only.

**Tests:**

- One table-driven case per `LIRInstr.kind`.
- Assert typed scoreboard instructions are `confidence: 'exact'`.
- Assert typed storage/NBT instructions expose storage reads/writes.
- Assert `raw` and `macro_line` are `confidence: 'opaque'` and never exact.
- Assert nested `store_cmd_to_score` preserves nested opacity/barrier flags.

**Gate:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/optimizer/lir/boundary_sidecar.test.ts \
  src/__tests__/optimizer/lir/analysis.test.ts \
  --runInBand
npm run test:lir
npm run build
git diff --check
```

## P18 - Diagnostic-only sidecar integration

**Status:** Planned.

**Product promise:** Existing optimizer/gate reports can explain blocked rewrite candidates with typed boundary labels, without changing optimization behavior.

**Allowed files:**

- `scripts/check-lir-local-copy-gate.ts`
- Existing arithmetic probe/report helpers under `src/` or `scripts/` as discovered.
- `src/__tests__/arithmetic-probes.test.ts`
- `src/__tests__/optimizer/lir/boundary_sidecar.test.ts`
- this roadmap status section

**Acceptance:**

- Add sidecar-derived blocker labels to diagnostic output only.
- Preserve existing gate pass/fail semantics.
- JSON output remains deterministic.
- Existing P15 decision remains unchanged: manual experimental opt-in only.

**Gate:**

```bash
npm run test:probe
npm run gate:lir-local-copy -- --output /tmp/redscript-p18-sidecar-diagnostics.json
npm run build
git diff --check
```

## P19 - Call/return ABI compile-golden fixture family

**Status:** Planned.

**Product promise:** Scalar return, aggregate return, macro call return, context call, and dynamic NBT helper return shapes are pinned at compile-output level before any ABI cleanup.

**Allowed files:**

- Add/modify focused tests under `src/__tests__/compiler/` or `src/__tests__/emit/`.
- Add tiny source fixtures only if existing inline-source tests become unreadable.
- Modify this roadmap status section.

**Fixture families:**

- Scalar function call with `$ret` copyback.
- Tuple/field return with `$ret_0`, `$ret_1` or representative `$ret_*` slots.
- Macro function call with `rs:macro_args` and return capture where applicable.
- `call_context`/execute helper call that must remain a barrier.
- Dynamic NBT read helper using `store_cmd_to_score` around `call_macro`.

**Forbidden:**

- Do not rewrite call ABI.
- Do not normalize `$pN`/`$ret*` away.

**Gate:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/compiler/tuple-type.test.ts \
  src/__tests__/double.test.ts \
  src/__tests__/emit/compile.test.ts \
  --runInBand
npm run build
git diff --check
```

## P20 - Typed branch-return validation spike

**Status:** Planned.

**Product promise:** The existing raw branch shape `execute ... run return run function ...` is explicitly validated or represented before any cleanup relies on it.

**Allowed files:**

- `src/lir/types.ts` only if adding an experimental typed node is chosen.
- `src/lir/lower.ts` only for a tiny opt-in/internal typed representation spike.
- `src/emit/command.ts`
- `src/lir/verify.ts`
- `src/__tests__/lir/verify.test.ts`
- `src/__tests__/emit/execute-chain.test.ts`
- this roadmap status section

**Preferred first slice:** Add validator/test coverage for the current raw shape. Only add a typed node if validation exposes a maintenance problem.

**Acceptance:**

- Current generated branch-return shape is pinned.
- Macro and non-macro branch calls are covered if applicable.
- No optimizer uses this as proof yet.

**Gate:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/lir/verify.test.ts \
  src/__tests__/emit/execute-chain.test.ts \
  src/__tests__/mc-syntax.test.ts \
  --runInBand
npm run validate-mc
npm run build
git diff --check
```

## P21 - Storage/NBT boundary fixture family

**Status:** Planned.

**Product promise:** Typed storage/NBT reads, writes, copies, dynamic macro helpers, and raw storage boundaries are clearly classified for validators and diagnostics.

**Allowed files:**

- `src/__tests__/optimizer/lir/boundary_sidecar.test.ts`
- `src/__tests__/optimizer/lir/equivalence.test.ts`
- `src/__tests__/mc-syntax.test.ts`
- `src/__tests__/emit/compile.test.ts`
- Validator/diagnostic files only after failing tests exist.
- this roadmap status section

**Acceptance:**

- Typed NBT operations expose exact sidecar storage refs.
- Raw/macro storage-looking text remains opaque.
- Dynamic NBT macro helpers are classified as macro/storage barriers.
- Static MC syntax still accepts valid typed storage commands and rejects malformed ones.

**Gate:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/optimizer/lir/boundary_sidecar.test.ts \
  src/__tests__/optimizer/lir/equivalence.test.ts \
  src/__tests__/mc-syntax.test.ts \
  --runInBand
npm run validate-mc
npm run build
git diff --check
```

## P22 - Local-copy/RMW evidence closeout v2

**Status:** Planned.

**Product promise:** Re-run the local-copy/RMW decision with improved P17-P21 diagnostics and decide whether evidence improved, while keeping default behavior unchanged unless a new ADR explicitly says otherwise.

**Acceptance:**

- Run the gate with sidecar diagnostics.
- Compare against P15 summary.
- Write a short follow-up note, not a default-enable commit.
- If the recommendation remains experimental, say so explicitly.

**Gate:**

```bash
npm run test:probe
npm run gate:lir-local-copy -- --output /tmp/redscript-p22-local-copy-v2.json
npm run build
git diff --check
```

## P23 - Optional Paper/TestHarness semantic smoke

**Status:** Planned / optional.

**Product promise:** If a Paper/TestHarness server is available, prove one or two core ABI/storage fixtures in real Minecraft instead of treating offline static checks as semantic proof.

**Prerequisite:** A live TestHarness endpoint must be confirmed, e.g. `http://localhost:25561/status`.

**Acceptance:**

- If server is unavailable, mark this skipped with reason; do not count it as proof.
- If server is available, run only small deterministic scoreboard/storage cases.
- Avoid flaky wall-clock/tick assumptions.

**Gate template:**

```bash
curl -fsS http://localhost:25561/status
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/mc-integration-console.test.ts \
  --runInBand
npm run build
git diff --check
```

## P24 - Roadmap/ADR closeout and next decision index

**Status:** Planned.

**Product promise:** End this diagnostic phase with an explicit next decision: start a tiny behavior-changing optimizer tranche, continue diagnostics, or revisit a thin value-IR spike.

**Acceptance:**

- Mark P17-P23 statuses accurately.
- Add a closeout summary with gates and remaining risks.
- Update `README.md` active roadmap pointer.
- If recommending a behavior-changing tranche, require a new roadmap/ADR first.

**Gate:**

```bash
git diff --check
git status --short --branch
```

## Final gate for the whole roadmap

Run before marking this roadmap fully complete:

```bash
npm test -- --selectProjects unit --runInBand
npm run test:lir
npm run test:probe
npm run build
npm run validate-mc
git diff --check
npm run gate:lir-local-copy -- --output /tmp/redscript-typed-boundary-roadmap-final.json
```

## Roadmap status

- [x] P17 derived LIR boundary sidecar helper and exhaustive tests.
  Evidence: `src/optimizer/lir/boundary_sidecar.ts`, `src/__tests__/optimizer/lir/boundary_sidecar.test.ts`, gates pass:
  `npm test -- --selectProjects unit --runTestsByPath src/__tests__/optimizer/lir/boundary_sidecar.test.ts src/__tests__/optimizer/lir/analysis.test.ts --runInBand`, `npm run test:lir`, `npm run build`, `git diff --check`.
- [x] P18 diagnostic-only sidecar integration.
  Evidence: `benchmarks/arithmetic-probes.ts`, `scripts/check-lir-local-copy-gate.ts`, `src/__tests__/arithmetic-probes.test.ts`; gate output `/tmp/redscript-p18-sidecar-diagnostics.json`.
- [x] P19 call/return ABI compile-golden fixture family.
  Evidence: `src/__tests__/compiler/tuple-type.test.ts`, `src/__tests__/double.test.ts`, `src/__tests__/emit/compile.test.ts`; gates pass: tuple/ABI compile tests + build.
- [x] P20 typed branch-return validation spike.
  Evidence: `src/__tests__/lir/verify.test.ts`, `src/__tests__/emit/execute-chain.test.ts`, `src/__tests__/mc-syntax.test.ts`; gates pass: unit tests + `npm run validate-mc` + `npm run build`.
- [x] P21 storage/NBT boundary fixture family.
  Evidence: `src/__tests__/emit/compile.test.ts`, `src/__tests__/optimizer/lir/boundary_sidecar.test.ts`, `src/__tests__/mc-syntax.test.ts`, `src/__tests__/optimizer/lir/equivalence.test.ts`; gates pass: unit tests + `npm run validate-mc` + `npm run build`.
- [x] P22 local-copy/RMW evidence closeout v2.
  Evidence: P17–P21 diagnostics re-run and gate output in `/tmp/redscript-p22-local-copy-v2.json`; recommendation remains experimental/manual opt-in.
- [x] P23 optional Paper/TestHarness semantic smoke.
  Evidence: `curl -fsS --max-time 2 http://localhost:25561/status` returned online server status, then `MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live` passed 19/19 live MC core oracle tests.
- [x] P24 roadmap/ADR closeout and next decision index.
  Completed with this closeout summary and status updates; local-copy/RMW remains manual experimental opt-in by gate evidence.
