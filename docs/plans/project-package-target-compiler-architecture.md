# RedScript Project/Package/Multi-Target Compiler Architecture

> Status: architecture decision and refactor boundary
> Date: 2026-07-31
> Parent roadmap: [`generic-datapack-language-roadmap.md`](generic-datapack-language-roadmap.md)

> Implementation checkpoint (2026-07-31): P1–P6 are landed. `SourceManager` and `CompilerSession` own build context; strict manifests feed deterministic module/package graphs; exported references resolve to canonical package symbol IDs; target capability validation runs before target-specific lowering or artifact mutation; and the finite commands backend emits verified canonical JSON/text programs from immutable optimized LIR. P6 adds explicit Git/SemVer resolution, a schema-versioned root `redscript.lock`, exact peeled commit and source-tree hashes, declared-license provenance, a content-addressed immutable cache, and offline-only ordinary builds. Source ASTs are never concatenated or mutated, canonical symbol identity remains distinct from physical Minecraft function layout, and no ordinary compiler path receives network authority.

## Decision

RedScript does **not** need a compiler rewrite, LLVM migration, or replacement of the hand-written parser/compiler.

It does need a staged architectural refactor around the existing compiler:

1. replace source concatenation and AST mutation with source units, package graphs, and a linker;
2. replace stringly module/function identity with stable `PackageId`/`SymbolId` values;
3. separate target-independent semantic analysis from target legalization and emission;
4. centralize semantic effects/capability requirements instead of rediscovering side effects in passes and emitters;
5. keep HIR/MIR and existing optimizers, but remove early Minecraft namespace/objective layout from semantic identity;
6. make legacy single-file and `compileModules()` flows adapters over the new core rather than parallel compiler implementations.

The problem is not that the compiler is hand-written. A project-owned TypeScript compiler is appropriate for a Minecraft-specific execution model. The current churn comes from missing boundaries: new features frequently cross import preprocessing, mutable AST merge, type checking, runtime metadata extraction, MIR lowering, LIR finalization, and datapack emission in one change.

## 1. Current compiler: what is already good

The production path already has real compiler layers:

```text
source
  → preprocessing/import injection
  → lexer/parser
  → AST
  → type checker
  → HIR (structured, desugared)
  → MIR (three-address CFG)
  → MIR optimizer
  → LIR (Minecraft scoreboard/storage commands)
  → LIR optimizer/verifier
  → datapack emitter
```

Strong foundations worth preserving:

- discriminated TypeScript unions for AST/HIR/MIR/LIR;
- source spans and source locations carried into lower IR;
- explicit MIR basic blocks, predecessors, terminators, and verifier;
- typed Minecraft LIR instructions rather than only raw strings;
- LIR verifier and explicit raw/macro opacity;
- separate MIR and LIR optimization pipelines;
- stage snapshots in `src/emit/compile.ts`;
- static Minecraft command and datapack artifact validators;
- a large regression corpus around language and backend behavior.

This is enough infrastructure to support packages and multiple targets. Replacing it wholesale would discard more proven behavior than it would simplify.

## 2. Current structural debt

Measured core-file concentration at design time:

| File | Lines | Concentrated responsibilities |
| --- | ---: | --- |
| `src/mir/lower.ts` | 4,250 | language lowering, runtime representation, builtins, strings, timers, arrays, Minecraft commands |
| `src/typechecker/index.ts` | 1,709 | collection, resolution, type checking, builtin rules, diagnostics |
| `src/emit/compile.ts` | 1,648 | preprocessing, import lookup/merge, runtime assets, checking, all lowerings, runtime metadata, emit |
| `src/cli.ts` | 1,143 | all command parsing/handlers/project behavior |
| `src/lir/lower.ts` | 808 | MIR legalization and physical scoreboard slots |
| `src/emit/index.ts` | 783 | command files, lifecycle tags, runtime helpers, metadata, artifact merging |
| `src/emit/modules.ts` | 714 | alternate multi-module compiler/linker and DCE path |

Large files are a symptom, not the acceptance criterion. The concrete architectural problems are:

### 2.1 Imports mutate and merge ASTs

The current `compile()` flow:

- finds module files from the compiler driver;
- parses imported files;
- marks imported functions as library functions;
- pushes imported declarations, structs, impls, enums, consts, and globals into the root AST;
- separately supports preprocessed source concatenation;
- separately has `compileModules()` with its own export/import rewrite and DCE behavior.

Consequences:

- package ownership is lost after merge;
- equal symbol names from different packages are difficult to represent;
- source order and merge order can affect behavior;
- public compiler logic has two multi-file paths;
- import semantics, linking, DCE, and emission naming are coupled.

### 2.2 Semantic identity is stringly and mixed with Minecraft layout

Current HIR calls store `fn: string`; MIR calls store `fn: string`; `HIRModule`, `MIRModule`, and `LIRModule` carry a Minecraft namespace; MIR also carries a concrete scoreboard objective.

Consequences:

- package identity, function identity, generated function path, and Minecraft resource ID can collapse into one string;
- module names are rewritten directly into emitted function paths;
- changing package layout risks backend naming and scoreboard ABI;
- target-independent stages know physical datapack concerns too early.

### 2.3 Runtime metadata is extracted beside the compiler driver

Decorators such as load/tick/watch/schedule/profile/retry/memoize are collected into parallel arrays after HIR lowering, then threaded as many arguments into LIR finalization and datapack emission.

Consequences:

- target requirements are implicit;
- a new decorator touches several stages;
- target validation cannot inspect one canonical semantic summary;
- metadata can be discarded by one IR and reconstructed by another stage.

### 2.4 Side effects are not one canonical contract

LIR has a useful centralized `getSlotEffect()`, but MIR optimizers still contain pass-local notions such as `hasSideEffects()`, read/write invalidation, and special-case barriers.

Consequences:

- optimizers and target capability checks can disagree;
- adding an instruction requires auditing multiple pass-local switches;
- command-sequence ordering cannot rely on one verified effect model.

### 2.5 Datapack is assumed by the top-level driver

The final stages always collect datapack lifecycle data and call `emitDatapackStage()`. There is no explicit target legalization boundary.

Consequences:

- a second backend would either duplicate the whole driver or add target conditionals throughout it;
- unsupported target semantics are discovered too late;
- JSON/NBT artifacts and executable lowering have no common build-plan owner.

## 3. Target architecture

```text
                         ┌──────────────────────────────┐
filesystem / editor ────→│ SourceManager               │
                         │ SourceFileId, text, spans    │
                         └──────────────┬───────────────┘
                                        │
redscript.toml ─→ ProjectLoader ─→ PackageGraph
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │ Frontend                     │
                         │ lex/parse each file          │
                         │ collect package declarations │
                         │ resolve imports + symbols    │
                         │ typecheck                    │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                         LinkedProgram / Typed HIR
                         - SymbolId / PackageId
                         - functions/types/constants
                         - decorators/resources
                         - source provenance
                                        │
                      ┌─────────────────┴─────────────────┐
                      ▼                                   ▼
               Runtime MIR                         Artifact inputs
               CFG + logical state                JSON/NBT/tags/etc.
                      │                                   │
                      └──────────────┬────────────────────┘
                                     ▼
                           Semantic Build Plan
                           - entry reachability
                           - effect summaries
                           - capability requirements
                           - resource contributions
                                     │
                           Target validation/legalization
                      ┌──────────────┴───────────────┐
                      ▼                              ▼
              Datapack legalization            Commands legalization
              function boundaries allowed      finite + fully inlined
              lifecycle/resources allowed      no residual artifacts/calls
                      │                              │
                      ▼                              ▼
               Minecraft LIR                    Command Program IR
                      │                              │
                      ▼                              ▼
              Artifact Graph                   Command Manifest
              directory / zip                  JSON / text
```

## 4. New stable compiler contracts

### 4.1 Source manager

```ts
type SourceFileId = string & { readonly __brand: 'SourceFileId' }

interface SourceFile {
  id: SourceFileId
  absolutePath: string
  text: string
  modulePath: string
  packagePath: string
}

interface SourceSpan {
  file: SourceFileId
  start: number
  end: number
}
```

Rules:

- only project/dependency loaders read source files;
- parser, resolver, checker, and lowerings receive source IDs/text, not filesystem lookup authority;
- diagnostics resolve IDs through `SourceManager`;
- compiler stages never use process cwd for semantic resolution.

### 4.1a Remote dependency authority

Remote package loading is split into two explicit authorities:

```text
redscript resolve
  manifest Git URL + SemVer constraints
  → bounded git ls-remote/fetch
  → exact tag version + peeled commit
  → clean checkout + canonical source-tree hash
  → transitive constraint closure
  → atomic redscript.lock + immutable cache entry

ordinary project/check/compile
  manifest declaration + root redscript.lock + warm cache
  → source/version/revision/content/license/identity validation
  → package graph
```

Rules:

- only `redscript resolve` may invoke Git or consult a source URL;
- the root lock owns the complete reachable remote graph, including dependencies declared by local workspace modules and remote modules;
- cache identity is the canonical source URL plus exact commit; source contents are re-hashed before package parsing;
- remote repositories cannot declare local path dependencies, symlinks, or submodules;
- a locked version must satisfy every declaring manifest constraint and all declarations for one module must use one source;
- unused lock entries, cache tampering, license mismatch, and module identity mismatch fail closed;
- local workspace paths remain outside remote lock identity and no central registry is implied.

### 4.2 Stable semantic identities

```ts
type PackageId = string & { readonly __brand: 'PackageId' }
type SymbolId = string & { readonly __brand: 'SymbolId' }
type ResourceId = string & { readonly __brand: 'ResourceId' }

interface Symbol {
  id: SymbolId
  package: PackageId
  name: string
  kind: 'function' | 'type' | 'const' | 'global' | 'resource'
  exported: boolean
  declaration: SourceSpan
}
```

Rules:

- AST may retain source spelling;
- after resolution, HIR references `SymbolId`, never an unresolved function-name string;
- backend link names and Minecraft paths are derived from `SymbolId` by target layout;
- generated helpers receive generated `SymbolId`s with provenance to their owner;
- a `SymbolId` is not a Minecraft resource location.

### 4.3 Linked program

```ts
interface LinkedProgram {
  packages: Map<PackageId, TypedPackage>
  symbols: SymbolTable
  entryCandidates: Map<SymbolId, TypedFunction>
  resources: ResourceContribution[]
  diagnostics: Diagnostic[]
}
```

This is the output of project/package frontend work. It is target-independent and can be reused by `check`, LSP, datapack build, and commands build.

### 4.4 Semantic effects

```ts
interface EffectSummary {
  reads: SemanticLocation[]
  writes: SemanticLocation[]
  calls: SymbolId[]
  opaqueRead: boolean
  opaqueWrite: boolean
  control: 'fallthrough' | 'branch' | 'loop' | 'return'
  runtime: Set<RuntimeRequirement>
  artifacts: Set<ArtifactRequirement>
}
```

Examples:

- score write: logical score write, `state.scoreboard` requirement;
- NBT write: logical storage write, `state.storage` requirement;
- raw command: opaque read/write barrier unless explicitly parsed by a trusted typed command node;
- function call: call edge, later summarized transitively;
- `@tick`: `lifecycle.tick` artifact/runtime requirement;
- recipe definition: `artifact.json-resources` requirement, no runtime MIR instruction.

One canonical effect API feeds:

- MIR/LIR optimizer legality;
- DCE and reachability;
- command ordering;
- target capability inference;
- diagnostic explanation;
- verifier checks.

MIR and LIR may have distinct location types, but their effects must implement one shared shape and conservative opacity policy.

### 4.5 Semantic build plan

```ts
interface SemanticBuildPlan {
  target: BuildTarget
  entry: SymbolId
  reachableSymbols: Set<SymbolId>
  functionEffects: Map<SymbolId, EffectSummary>
  requirements: CapabilityRequirement[]
  resources: ResourceContribution[]
}
```

This is the boundary between “valid typed RedScript program” and “legal for this output target”.

#### P4 implementation boundary

The project compiler now materializes this boundary as `SemanticTargetPlan`. The order is strict:

```text
load package closure
  → resolve exported canonical symbols
  → typecheck immutable linked package projections
  → compute function reachability and target-owned roots
  → infer requirements with source/call-chain provenance
  → validate target profile
  → target-specific lowering
```

The current `TypeChecker` validates but does not return a typed tree. Therefore P4 conservatively extracts requirements from the already-checked immutable AST plus the resolved package symbol graph. This is a transitional implementation detail, not a second semantic authority: emitters do not rescan or downgrade requirements, and the extractor must migrate onto canonical typed HIR/MIR effects as Foundation C/D advances.

Current project-target distinctions are explicit:

- declaration-surface registry references such as `resource item minecraft:diamond;` are target-neutral metadata, not emitted artifacts;
- `resource-artifacts` remains a separate capability for P7 `from`/generated JSON and NBT contributions;
- project datapacks support lifecycle, scheduling, function artifacts/tags, recursion/helpers, state, opaque commands, and dynamic dispatch;
- commands currently support only typed registry references, state planning, and opaque command sequencing; P5 must legalize and widen this profile deliberately;
- event-runtime decorators, runtime wrappers, and load-dependency decorators that the package adapter does not yet lower fail closed with `RST2009`–`RST2011`, even when the legacy one-file adapter has broader behavior.

`CompilerSession.analyzeProject()` and `redscript graph --capabilities --target <name>` expose the same plan. Compilation throws the same diagnostics before any emitter or filesystem write.

### 4.6 Target legalization

A target backend exposes:

```ts
interface TargetBackend<TLegal, TArtifact> {
  profile: TargetProfile
  validate(plan: SemanticBuildPlan): Diagnostic[]
  legalize(program: LinkedProgram, plan: SemanticBuildPlan): TLegal
  verify(legal: TLegal): Diagnostic[]
  emit(legal: TLegal): TArtifact[]
}
```

Rules:

- validation is fail-closed before filesystem mutation;
- legalization may introduce helpers only when the profile allows them;
- every residual operation after legalization is supported by that backend;
- verifier runs before emitter;
- emitter serializes legal IR and does not make semantic fallback decisions.

## 5. IR ownership

### AST

Owns source syntax only:

- package/import declarations;
- declarations/expressions/statements;
- decorators as syntax;
- source spans.

It must not own resolved package paths, emitted paths, or scoreboard objectives.

### Typed HIR / LinkedProgram

Owns language semantics:

- resolved `SymbolId`s;
- checked types;
- desugared structured operations;
- decorators/resource declarations as typed semantic metadata;
- package/source provenance.

It must not own final Minecraft function paths or physical scoreboard slots.

### MIR

Owns executable control/data flow:

- per-function CFG;
- logical temporaries;
- typed operations;
- explicit calls by `SymbolId`;
- conservative effects;
- source provenance.

MIR may remain Minecraft-aware (scores, storage, execute context) because both initial backends target Minecraft. It should not contain the final namespace/objective chosen by datapack layout.

### Datapack LIR

Owns physical Minecraft execution choices:

- concrete scoreboard slots/objectives;
- storage locations;
- helper function boundaries;
- macro calls;
- function references;
- near-1:1 Minecraft command operations.

It is target-specific. It does not need to serve commands output unchanged.

### Command Program IR

Owns one schema-versioned finite command artifact with explicit target identity and budget:

```ts
interface CommandProgram {
  schemaVersion: 1
  target: {
    name: string
    kind: 'commands'
    namespace: string
    entry: PackageSymbolId
    minecraftVersion: string
    commandBudget: number
    validationProfile: string
  }
  commandCount: number
  phases: {
    setup: CommandStep[]
    invoke: CommandStep[]
    cleanup: CommandStep[]
  }
}

interface CommandStep {
  command: string
  effect: EffectSummary
  source?: SourceSpan
  expansionTrace: PhysicalFunctionId[]
  generated?: boolean
}
```

Commands legalization fully inlines legal acyclic helpers, flattens compiler-generated finite branch CFGs, preserves command order, checks the total phase budget, statically validates final commands, and rejects residual loops/calls/lifecycle/artifacts. Temporary branch guards are reset in `cleanup`; persistent language state and objectives remain owned by the target. Canonical JSON is the machine artifact; a deterministic text projection is emitted beside it.

P5 uses one explicit migration adapter: `compileModulesWithLIR(..., { emitArtifacts: false })` returns a deeply frozen optimized LIR snapshot. Named package functions, impl methods, and specialized clones are normalized through the same physical-ID projection as the emitter before the snapshot is frozen. The commands backend immediately converts that snapshot into `CommandProgram`; it never invokes the datapack emitter or exposes helper-function files. This does not make datapack LIR the commands artifact contract. Future typed-ID MIR work can replace this adapter without changing `CommandProgram` or its manifest schema.

Do not force the existing function-oriented LIR to be both datapack LIR and command-sequence IR. Share typed command rendering, selected-version gates, and effect utilities only where semantics match.

## 6. What to refactor and when

### Foundation A — compiler session, no behavior change

Create:

- `src/compiler/session.ts`
- `src/compiler/source-manager.ts`
- `src/compiler/stages.ts`

Move orchestration out of `src/emit/compile.ts` behind explicit stage inputs/outputs. Keep `compile()` as an adapter and require byte-identical datapack artifacts for legacy fixtures.

Do not split files merely by line count. Extract ownership boundaries in this order:

1. source loading/discovery;
2. parse/typecheck frontend;
3. linked program construction;
4. runtime metadata/build planning;
5. target legalization;
6. emission.

### Foundation B — immutable package frontend

Create package units and symbol tables before changing HIR/MIR:

- parse files independently;
- collect declarations for every package;
- resolve imports/exports;
- typecheck bodies against resolved symbols;
- stop mutating one root AST with imported declarations.

Keep the old AST merge path only inside the legacy adapter.

### Foundation C — typed IDs in HIR/MIR

Migrate one identity class at a time:

1. function definitions and calls;
2. generated helper functions;
3. types/impl methods;
4. globals/constants;
5. resources.

During migration, use one explicit conversion adapter at phase boundaries. Do not allow both arbitrary strings and IDs throughout every stage.

### Foundation D — effect and requirement summaries

Before implementing commands backend:

- define canonical MIR effects;
- make optimizer passes consume them instead of local `hasSideEffects()` switches;
- retain conservative barriers for raw/macro/calls without summaries;
- calculate transitive function effects by call-graph fixed point;
- derive target requirements with source/call-chain provenance.

### Foundation E — target split

Wrap current lowering/emitter as `DatapackBackend` first. It should produce identical artifacts.

Only then add `CommandsBackend` as a separate legalization path. Avoid `if (target === ...)` branches inside unrelated parser/checker/optimizer code.

## 7. What not to rewrite

- lexer/parser, except adding package/import syntax through focused tests;
- AST/HIR/MIR wholesale;
- optimizer pass infrastructure that already has verifier-backed behavior;
- typed LIR command nodes;
- existing static Minecraft validators;
- source-map and stage-snapshot concepts;
- public `compile()` API;
- all stdlib code at once.

Do not integrate LLVM, MLIR, Cranelift, Binaryen, or another general CPU compiler backend. Minecraft scoreboards, storage, selectors, execute context, functions, tags, and reload lifecycle need a custom effect/legalization model anyway. External tools are appropriate only as offline equivalence/rewrite oracles in bounded experiments.

## 8. Anti-churn rules

Every new compiler feature must answer these questions before implementation:

1. Is it source syntax, semantic meaning, runtime effect, artifact contribution, or target layout?
2. Which single canonical type owns it?
3. Does it change package resolution or only one package body?
4. What capabilities does it require?
5. At which legalization boundary can it be accepted or rejected?
6. Which verifier invariant proves the postcondition?
7. Can legacy `compile()` express it, or is it project-only?

Hard boundaries:

- filesystem access only in project/source/dependency loaders and artifact writers;
- no import resolution in emitters;
- no AST mutation for linking in the new project path;
- no Minecraft path construction before target layout;
- no physical scoreboard/objective assignment in HIR;
- no target downgrade or feature omission in emitters;
- no pass-local side-effect definition when a canonical effect API exists;
- no second implementation of package graph for CLI/LSP/compiler;
- no output mutation before all frontend and target diagnostics pass;
- no new compatibility workaround outside the explicit legacy adapter.

## 9. Verification strategy

### Architecture parity gate

Compile a frozen single-file corpus through:

1. current legacy `compile()` adapter;
2. ephemeral-project + datapack backend;

Require byte-identical sorted `DatapackFile[]` and equal diagnostics.

### Package frontend gate

- same package split over one or many files has equal semantic output;
- package source enumeration order does not affect symbols/artifacts;
- equal short names in different package paths remain distinct;
- cycles and visibility errors have deterministic call/import chains;
- cwd does not affect graph or diagnostics.

### IR verifier gates

- every resolved HIR call refers to an existing or declared external `SymbolId`;
- MIR blocks retain current terminator/predecessor invariants;
- effect summaries are conservative for raw/macro/external calls;
- target legalization leaves no unsupported operations;
- command program contains no residual function calls or unbounded control flow;
- datapack LIR still passes existing `verifyLIR()`.

### Target differential gate

Use shared source fixtures with expected outcomes:

| Fixture | Datapack | Commands |
| --- | --- | --- |
| finite raw/admin commands | pass | pass |
| inlinable helper | pass | pass |
| constant loop under budget | pass | pass |
| recursive helper | pass/MC-limited | reject |
| `@tick` | pass | reject with `lifecycle.tick` |
| recipe JSON | pass | reject with `artifact.json-resources` |

### Artifact/runtime gates

- datapack output retains static artifact validation;
- commands output validates every rendered command against selected MC version;
- controlled live server executes canonical command sequence in order;
- static and live evidence remain labeled separately.

## 10. Migration sequence

```text
M0  Freeze architecture + parity fixtures
M1  ProjectLoader + SourceManager (old compiler unchanged)
M2  CompilerSession wraps old pipeline
M3  PackageGraph + immutable per-file AST frontend
M4  Package-aware SymbolId in HIR calls/definitions
M5  LinkedProgram + entry reachability
M6  Canonical MIR effects + capability summaries
M7  Current emitter wrapped as DatapackBackend, byte-identical
M8  Commands legalization spike from MIR
M9  Commands backend production subset
M10 Typed artifact graph/resources
M11 Retire internal AST-merge path after compatibility evidence
```

Each milestone must be independently useful and releasable. Do not begin M8 until M3–M7 contracts are green. Do not delete the legacy path until parity and published API migration evidence exist.

## 11. Stop/reconsider criteria

Pause the refactor and revise the architecture if:

- `SymbolId` migration requires widespread backend string reconstruction outside one adapter;
- commands lowering cannot preserve semantics from MIR without rebuilding most language semantics;
- parity fixtures show unexplained artifact drift;
- canonical effects cannot conservatively represent raw/macro/external boundaries;
- compile time or memory regress materially on the frozen corpus;
- LSP would need a separate package graph implementation.

In those cases, perform a narrow spike and ADR. Do not patch around the failed boundary in multiple stages.

## 12. Immediate recommendation

Implement project discovery/manifest P1 first because it does not require compiler behavior changes. Before package syntax P2, insert the compiler foundation slice:

1. `SourceManager` and `CompilerSession` interfaces;
2. ephemeral-project adapter for current `compile()`;
3. frozen byte-identical parity corpus;
4. explicit stage result types;
5. no import or IR semantic changes yet.

Then implement package graph and linker against that spine. This costs one bounded compatibility tranche now and avoids reworking package resolution again when the commands backend arrives.
