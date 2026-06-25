# 9. VIR Architecture Recommendation

Status: design recommendation imported from external GPT Pro review. This is **not** an implementation commitment yet; it defines the architecture target and the criteria for a small spike.

Current implementation posture for this branch:

- Phase-0 arithmetic VIR remains **isolated** under `src/optimizer/vir`.
- This is a prototype and is not connected to the default compiler pipeline.
- Slot-planner v1 now exists experimentally for arithmetic-only VIR: live intervals, destructive-lhs affinity, commutative operand choice, `$ret` precoloring, parallel-copy resolution, and allocation checks.
- Unsupported MIR shapes and unsupported lowerings must return explicit `unsupported` reasons and stay as fallback boundaries.
- Production handoff remains pending until the benchmark decision gate proves net value.

## Executive recommendation

Add a value-level layer, but keep it thin.

The recommended direction is not a wholesale MLIR/LLVM migration and not a second full MIR. Instead, split the current path between language semantics and physical Minecraft command slots:

```text
MIR
  └─ language semantics, aggregate/coroutine lowering, high-level optimization

VIR / Value LIR
  └─ SSA values + CFG + block arguments
     Minecraft scoreboard numeric semantics
     abstract NBT/storage/entity/call effects
     no concrete {player, objective} binding for ordinary locals

MC legalization / machine planning
  └─ scoreboard two-address constraints
     fixed ABI slots ($pN/$ret)
     command recipes
     version/capability/helper selection

Slot planning
  └─ liveness + affinity coalescing + fixed-slot constraints
     parallel-copy resolution

Existing LIR
  └─ physical Slot-bound Minecraft command IR

Emitter
```

`MC legalization / machine planning` can be an ephemeral internal lowering structure, not a new long-lived serialized IR.

The key boundary is:

> **Target-aware semantics, target-independent locations.**

VIR should know Minecraft scoreboard arithmetic is int32-like and that storage/NBT/function calls have effects. VIR should not know that a normal temporary lives in `$tmp7 __obj`.

## Why this is better than more physical LIR peepholes

The current LIR peepholes are useful, but several should become consequences of value/lifetime planning:

| Current peephole | Desired architectural source |
| --- | --- |
| adjacent copy forwarding | SSA value aliasing / no logical copy emitted |
| RMW collapse | two-address operand coalescing |
| return collapse | `$ret` fixed-location / precoloring |
| temp elimination | liveness and slot reuse |
| self-copy suppression | emitter-level safeguard only |

If these remain as independent pattern rules forever, the LIR optimizer gradually becomes an incomplete register allocator and SSA optimizer over physical Minecraft slots.

## Architecture comparison

| Option | Pros | Cons | Recommendation |
| --- | --- | --- | --- |
| Improve MIR + LIR analyses only | Lowest risk; immediately useful; supports current passes | Physical slots still pollute generic optimization; destructive ops and ABI details leak everywhere | Keep as migration support, not final shape |
| Add thin custom VIR | Delays slot binding; makes generic copy/DCE/CSE/liveness cleaner; fits Minecraft semantics | Needs verifier, effects, lowering discipline | Recommended |
| Refactor current MIR into low-level optimizer IR | Avoids one extra layer | Mixes high-level source semantics with target planning; high migration risk | Avoid for now |
| Use LLVM/MLIR/Cranelift/Wasm carrier | Mature concepts and tooling | Heavy TS/native integration; semantics mismatch; MC backend work remains | Borrow ideas, do not directly adopt |
| E-graph/equality saturation | Good for pure expression/helper rewrite search | Does not solve CFG/effects/slot allocation | Later, only for pure expression islands |
| Hybrid thin VIR + shared TS analyses + optional sidecars | Balanced; incremental; keeps MC-specific work local | Requires strict layer boundaries | Recommended route |

## Mature ideas to reuse, but mostly implement in TypeScript

| Technique | Use? | Notes |
| --- | --- | --- |
| SSA values | Yes | Eliminate logical copies and simplify use-def/DCE/CSE. |
| Block arguments | Yes | Prefer over explicit phi instructions; branch edges carry values. |
| CFG, RPO, dominators | Yes, local implementation | Keep dense IDs/tables tailored to our IR. |
| Liveness / live intervals | Yes, local implementation | Needed for slot planning; CPU register pressure assumptions do not fit Minecraft. |
| Copy coalescing | Yes, local implementation | Optimize command copies, not scarce hardware registers. |
| Effect system | Yes, local implementation | Must be resource-specific, not a coarse enum. |
| Legalization | Yes, borrow MLIR/Cranelift concept | Convert value ops into Minecraft command recipes and constraints. |
| Rewrite framework | Yes, lightweight | Worklist + bounded fixpoint + verifier; no TableGen-scale system. |
| MemorySSA | Not initially | Exact-path alias + conservative barriers are enough for first stages. |
| E-graph | Later | Pure arithmetic/helper recipe sidecar only. |
| Binaryen | Maybe later | Pure arithmetic optimizer/oracle spike only; not whole compiler. |
| Z3 | Maybe later | Offline rule checker/superoptimizer oracle, not production pass. |

The TS production stack remains:

```text
project-owned IR + verifier + analyses
fast-check for property/fuzz tests
optional ts-pattern for rewrite ergonomics
optional z3/binaryen/egg as isolated experiments only
```

## VIR design constraints

### IDs and storage

Use branded dense numeric IDs internally rather than strings:

```ts
type Brand<T, K extends string> = T & { readonly __brand: K }

type FuncId = Brand<number, 'FuncId'>
type BlockId = Brand<number, 'BlockId'>
type OpId = Brand<number, 'OpId'>
type ValueId = Brand<number, 'ValueId'>
type TypeId = Brand<number, 'TypeId'>
type LocId = Brand<number, 'LocId'>
```

Use table-backed module/function/block/op/value storage so verifier, printer, use-def, and future analyses are deterministic.

### SSA and copies

Do **not** add a normal `copy` op to SSA VIR. If a lowering/building step sees `%b = copy %a`, it should bind `%b` to `%a` in the environment or record a debug alias. Real copies belong only after slot planning.

Allowed copy-like forms:

- `debug.value` / source variable alias metadata;
- `machine.copy` in ephemeral machine lowering;
- explicit snapshot/freeze op only if language semantics require it.

### Types

Do not use a vague `number`. VIR types should encode relevant numeric semantics:

```ts
type VIRType =
  | { kind: 'i32'; semantics: 'minecraft_score' }
  | { kind: 'bool'; representation: 'canonical_0_1' }
  | { kind: 'fixed'; storage: 'i32'; scale: ExactRational; overflow: OverflowMode; rounding: RoundingMode }
  | { kind: 'nbt_number'; nbtType: 'byte'|'short'|'int'|'long'|'float'|'double'; scale: ExactRational }
  | { kind: 'opaque_nbt'; schema?: string }
```

`scale` should be exact rational or canonical decimal string, not host JS `number`, to avoid floating-point drift in compiler semantics.

### Operations

Initial operation families:

```text
arith.constant
arith.add/sub/mul/div/rem/min/max/neg/cmp/select/rescale
cf.br
cf.cond_br
cf.switch
cf.return
mem.nbt_load/store/copy/exists/length
func.call
mc.command_result/success
mc.intrinsic
mc.opaque
```

Support multi-result ops from day one. Minecraft commands/helpers can naturally produce result + success, quotient + remainder, vector components, or multiple helper outputs.

### Effects

Avoid a single `pure | storage | entity | raw` enum. Use resource-specific accesses:

```ts
type AccessMode = 'read' | 'write' | 'readwrite' | 'allocate' | 'free'

interface EffectAccess {
  mode: AccessMode
  resource: ResourceRef
}

interface EffectSummary {
  accesses: EffectAccess[]
  nondeterminism: 'none' | 'random' | 'world_state' | 'unknown'
  control: 'normal' | 'may_return' | 'may_suspend' | 'unknown'
  observableFailure: boolean
  unknown: boolean
}
```

Initial alias model can stay conservative:

- different storage namespaces: no alias;
- same namespace exact disjoint fields: no alias;
- prefix/wildcard/match paths: may alias;
- unique compiler-owned entity handles: no alias;
- arbitrary selectors/raw/unknown: alias all.

### Calls and ABI

Separate semantic effects from physical ABI clobbers:

```ts
interface CallABI {
  kind: 'internal_score_slots' | 'legacy_score_slots' | 'macro_with_storage' | 'opaque_mcfunction'
  params?: PhysicalSlotRef[]
  results?: PhysicalSlotRef[]
  clobbers: PhysicalResourceSet
}
```

A helper may be semantically pure but still clobber `$p0`, `$p1`, `$ret`, scratch scores, or storage. Generic VIR passes use semantic effects; slot planning and call lowering use ABI clobbers.

### Raw and macro commands

Raw/macro commands should not silently access anonymous VIR values. They need explicit bindings and effects:

```ts
interface OpaqueCommandAttrs {
  template: string
  bindings: Record<string, ValueId | ResourceRef | Literal>
  effects: EffectSummary
  resultKind?: 'none' | 'result' | 'success' | 'both'
}
```

Unannotated legacy raw is top barrier:

```text
readwrite all_mc_state, unknown = true
```

### Locations

Every op should carry a mandatory interned source location:

```ts
type SourceLoc =
  | { kind: 'source'; file: string; start: Pos; end: Pos }
  | { kind: 'synthetic'; reason: string; parent: LocId }
  | { kind: 'fused'; locations: LocId[]; pass?: string }
  | { kind: 'unknown' }
```

CSE/folds use fused locations; slot-planner inserted copies use synthetic locations.

## Verifier invariants

At minimum:

1. every `ValueId` has exactly one definition;
2. every use is dominated by its definition;
3. branch argument counts/types match successor block params;
4. each block has one final terminator;
5. op result counts match the op schema;
6. pure ops do not write resources;
7. effectful ops carry effect summaries;
8. function declared effects cover inferred body effects;
9. call args/results match function signature;
10. external helpers carry ABI and clobber summaries;
11. raw/macro placeholders have bindings;
12. normal VIR ops do not reference physical temporary slots;
13. concrete score globals are declared;
14. approximation ops carry domain/error contracts;
15. coroutine suspension does not leave implicit SSA values live across tick.

In debug/tests, verify after every pass. In normal builds, verify at stage boundaries.

## Pass placement

| Optimization | MIR | VIR | MC LIR / lowering |
| --- | --- | --- | --- |
| constant folding | yes | yes | target literal fold only |
| copy propagation | existing high-level | mostly SSA construction | physical fallback only |
| CSE | high-level expression CSE | pure/effect-aware local/global value numbering | avoid generic CSE |
| DCE | high-level | core pass | no-op/self-copy only |
| SCCP | optional | after CFG support | no |
| algebraic identities | type-aware | main location | immediate identities fallback |
| return coalescing | no | no | `$ret` precoloring |
| temp elimination | partial | SSA/liveness | slot reuse |
| scoreboard immediates | no | no | yes |
| RMW collapse | no | no | tied-operand slot allocation |
| NBT/storage batching | aggregate-aware | effect/path-aware | command coalesce |
| selector caching | no | maybe mark repeated selector expr | MC target pass |
| execute-chain flattening | no | no | yes |
| function inlining | main location | small leaf/ABI-cost cleanup only | no |
| helper approximation/tuning | contract/range | target-aware selection | recipe emission |
| command budget analysis | rough | recipe estimate | precise emitted command count |
| source maps | invariant | invariant | invariant |

VIR first pass set should be small:

```text
canonicalize
constant-fold
DCE
local CSE
CFG simplify once CFG exists
simple range propagation later
```

Do not duplicate MIR's coroutine, loop unroll, LICM, or broad interprocedural pipeline initially.

## Lowering and slot planning

VIR should not lower each value op directly to `score_copy tmp; score_op tmp`. Instead, use an ephemeral machine planning layer with operand constraints:

```ts
type OperandConstraint =
  | { kind: 'use' }
  | { kind: 'def' }
  | { kind: 'reuse'; useIndex: number }
  | { kind: 'fixed'; slot: PhysicalSlotRef }
  | { kind: 'clobber'; slot: PhysicalSlotRef }
```

Slot planning v1:

1. compute liveness;
2. build interference;
3. build affinity edges: result ↔ destructive lhs, block param ↔ incoming value, call arg ↔ `$pN`, return ↔ `$ret`;
4. precolor fixed ABI slots;
5. coalesce non-conflicting affinities by benefit;
6. allocate remaining temp holders with a simple deterministic strategy;
7. insert required copies as parallel copies;
8. resolve swaps/cycles;
9. emit physical LIR;
10. run a symbolic allocation verifier.

Do not start with graph coloring. Scoreboard slots are not scarce CPU registers; the objective is minimizing copy commands and clobber risk.

## Copy-pressure handling policy for this batch (Batch 20)

The following is the current operating split for copy-pressure reduction:

- LIR harness should solve:
  - adjacent and short copy chains through plain scoreboard instructions
  - local dead-temp overwrite/copy-forwarding patterns
  - local return materialization with explicit dead-temp safety
  - pure source-loc-preserving collapse where barriers and protected slots are absent
- LIR should stay conservative on:
  - any pattern crossing `raw`, `macro_line`, `call*`, `store_*_to_*`, or storage-visible command barriers
  - opaque selectors/`return` side-conditions that are not expressible as local slot liveness
  - ABI slot classes treated as protected (`$ret`, `$ret_*`, `$pN`, `__rf_*`, `__const_*`, `__opt_*`)

VIR (Phase-0 only) may be useful for cases that require global SSA/liveness reasoning beyond current local windows, such as:

- cross-function copy materialization decisions driven by argument/result flow
- repeated expression-value reuse before destructive-binding to fixed slots
- block-level copy coalescing when temporary identity is carried through many instructions

For this roadmap, those cases remain diagnostics-first:

- `call`/`macro`/`raw`/storage barriers split the value flow graph into conservative blocks
- unknown origin lines where textual slot provenance is ambiguous
- copy chains that need cross-function or inter-block proof of liveness

Phase-0 VIR spike acceptance criteria:

- no behavior change in current compiler output semantics
- deterministic verifier-backed parsing/printing for a tiny arithmetic-only subset
- a narrow compare between old/new path on arithmetic probes
- unchanged pass output when the pattern is already covered by existing LIR rules
- and **no production integration** until the spike is formally closed as useful

Explicitly: full VIR is **not** implemented today; it remains a bounded experiment path only.

Constants:

- `score_set` for direct literal set;
- add/sub constants use immediate add/remove when legal;
- mul/div/mod constants use interned const slots;
- 0/1/-1 get canonical target folds;
- cheap constants are rematerializable.

Call lowering:

```text
parallel-copy args into $pN only when not already there
function call
result is fixed at $ret
copy $ret only if it must survive a clobber or needs a different location
```

Block args lower through edge parallel copies, with coalescing preferred.

## Incremental migration roadmap

### Phase 0 — ADR and baseline

Add architecture docs and deterministic arithmetic baseline. Lock current `bench:arithmetic` output enough to compare future VIR paths.

### Phase 1 — VIR core, printer, verifier

Add table-backed IDs, types, locations, builder, op registry, verifier, and deterministic textual printer. No production pipeline integration.

### Phase 2 — pure arithmetic MIR → VIR

Only support single-block leaf arithmetic:

```text
const, add/sub/mul/div/mod/min/max, compare, return
```

Unsupported functions fall back to old path.

### Phase 3 — naive VIR → current LIR

Assign one unique slot per value first. Command count may be worse; semantic correctness and validation are the only goals.

### Phase 4 — first VIR optimizer

Add canonicalize, constant fold, DCE, local CSE. Verify after every pass.

### Phase 5 — slot planner v1

Add straight-line liveness, destructive-lhs affinity, commutative operand choice, `$ret` precoloring, temp reuse, parallel-copy resolution, and symbolic allocation checker.

Success metrics for continuing:

```text
semantic mismatches: 0
allocation verifier failures: 0
VIR path total commands: not worse than old path on arithmetic probes
scoreCopy reduction: target 20%+
score_arith -> score_copy -> score_arith reduction: target 40%+
```

These are dashboard thresholds, not permanent CI gates at first.

### Phase 6 — CFG and block arguments

Add dominators, block args, edge copies, branch lowering, CFG simplify.

### Phase 7 — calls, ABI, and summaries

Add call graph, semantic effects, ABI clobbers, pure/external helper summaries, `$pN/$ret` planning.

### Phase 8 — storage/NBT/entity effects

Add structured NBT paths, alias analysis, load/store forwarding, conservative raw/macro effects.

### Phase 9 — opt-in rollout and LIR peephole shrink

Expose experimental path only after arithmetic-only path is stable. Existing LIR peepholes remain safety net until trigger counts prove they are redundant.

## First two-week spike acceptance

A useful first spike should end with:

- stable VIR dump and verifier;
- arithmetic-only leaf function can roundtrip through VIR to LIR;
- default compiler path unchanged;
- old/new arithmetic semantics differential has zero mismatch;
- allocation symbolic checker passes;
- VIR path does not increase total commands on the target arithmetic probe subset;
- at least one old peephole becomes architecture-driven, e.g. direct `$ret` allocation or overwrite of dead lhs.

Do **not** touch coroutine, entity/display, macro layout, complete interprocedural optimization, or storage/NBT effects in the first spike.

## Open questions before implementation

Before coding VIR beyond a spike, answer these in ADR form:

1. Is current MIR already SSA-like? How are merges represented?
2. Is MIR CFG complete after coroutine transforms?
3. Does RedScript allow recursion?
4. Can the same `.mcfunction` re-enter in the same tick or across scheduled ticks?
5. What is the complete `$pN/$ret` ABI clobber set?
6. Can helpers read caller temporary scores?
7. How many `raw` / `macro_line` cases exist and where do they originate?
8. Can new raw APIs require explicit effects?
9. Which scoreboard/global states are user-observable?
10. What are exact division-by-zero and command-failure semantics?
11. Are fixed scales type semantics or helper conventions at each layer?
12. Are params/returns always within one objective?
13. Can calls dynamically target unknown callees?
14. How does internal CFG currently lower to functions/calls?
15. What source-map granularity is required?
16. How does `execute as @e[...] run function foo` interact with shared global temps?
17. Are temp slots safe under multi-executor contexts?
18. Is macro argument storage caller-owned or callee-owned?
19. What target Minecraft version floor must be supported?
20. What default weights should command count, tick cost, and datapack size use?

The `execute as` / multi-executor question is critical: globally shared fake-player temps can be unsafe if a helper is invoked per entity without lane-specific or executor-bound storage.

## Relationship to current TS optimizer stack

The existing `08-ts-optimizer-infra.md` work remains useful even if VIR proceeds. Shared LIR analysis, module reference indexes, raw/macro barriers, and property tests are still required for:

- current physical LIR safety net;
- future VIR-to-LIR legalization checks;
- allocation verifier support;
- emitter-level safeguards.

The near-term rule remains: do not implement a broad VIR until the support stack and a small arithmetic-only spike prove measurable value.
