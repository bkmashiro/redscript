# RedScript Project, Package, and Multi-Target Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Evolve RedScript from a single-file-oriented datapack compiler into a Go-like project/package language with explicit build targets, static target-capability diagnostics, a useful command-sequence target, and a complete datapack artifact model.

**Architecture:** `redscript.toml` defines one module and one or more named build targets. Directories under the module form packages; package resolution produces one deterministic dependency graph shared by the CLI, compiler, and LSP. Source is checked once into target-neutral semantic IR plus resource artifacts, then a capability pass validates the reachable program against the selected target before target-specific lowering and emission.

**Tech Stack:** TypeScript, Jest, RedScript AST/HIR/MIR/LIR pipeline, TOML project manifests, Minecraft Java datapack artifacts.

---

> Status: active source-of-truth roadmap
> Designed: 2026-07-30
> Stable game baseline: Minecraft Java Edition 26.2 / Data Pack version 107.1
> Compatibility rule: existing single-file `redscript compile file.mcrs` remains supported

Compiler architecture and bounded refactor contract: [`project-package-target-compiler-architecture.md`](project-package-target-compiler-architecture.md).

## 1. Product decision

RedScript needs a real project and package system **before** adding a large number of datapack resource syntaxes.

The intended product is:

```text
RedScript module
├── packages of executable and compile-time code
├── typed references to Minecraft resources
├── JSON/NBT/static resource inputs
└── named build targets
    ├── datapack       complete pack directory/zip
    ├── function-set   embeddable function/resource fragment (later)
    └── commands       finite ordered command sequence for command blocks/tools
```

A target does not merely choose an output file extension. It defines which semantic capabilities exist. A source program may therefore be valid RedScript but invalid for a selected target.

Examples:

- `resource recipe ...` is valid for `datapack`, unavailable for `commands`;
- `@load` and `@tick` require datapack lifecycle tags;
- runtime recursion and dynamic loops require generated helper functions or scheduling and cannot be promised by a finite command sequence;
- imports, constants, structs, compile-time evaluation, and inlinable helpers are compile-time features and can be shared by all targets;
- a dynamic `if` may still compile to commands when every reachable branch lowers to a finite command sequence;
- unsupported semantics must fail during target validation with source locations and reasons. Emitters must never silently skip them.

## 2. Terminology and ownership

Do not reuse one word for three different identities.

| Concept | Example | Owner | Purpose |
| --- | --- | --- | --- |
| **Module path** | `github.com/bkmashiro/castle` | `redscript.toml` | Project/dependency identity and import prefix |
| **Package path** | `github.com/bkmashiro/castle/combat` | source directory | Code visibility, imports, compilation unit |
| **Package name** | `combat` | `package combat;` | Local qualifier in source |
| **Minecraft namespace** | `castle` | project/target config | Generated resource IDs and datapack paths |
| **Build target** | `pack`, `admin_commands` | `redscript.toml` | Entry point, capability profile, output kind |
| **Minecraft target version** | `26.2` | project default or target override | Command/resource schema and pack version |

### 2.1 Module

A module is the versioned project/dependency unit rooted at the nearest `redscript.toml`.

V1 invariants:

1. one manifest owns one module path;
2. every package in that module has an import path derived from module path + relative directory;
3. the module has one default Minecraft namespace, but a target may explicitly override it;
4. module path and Minecraft namespace are never inferred from each other;
5. nested `redscript.toml` files form separate modules and stop parent package discovery;
6. source outside the module root cannot be imported except through a declared dependency;
7. one module can build multiple targets without recompiling unrelated target roots.

### 2.2 Package

A package is a directory-level compilation unit, similar to Go.

V1 invariants:

1. all non-test `.mcrs` files in one directory declare the same `package <name>;`;
2. package name defaults are not inferred in strict project mode;
3. symbols in all files of a package share one package scope;
4. `export` remains the visibility marker—RedScript will **not** copy Go's capitalization rule;
5. imported packages are qualified by default; wildcard imports remain legacy-only and produce a migration warning in project mode;
6. package import cycles are rejected with the full cycle path;
7. package initialization has no implicit side effects;
8. lifecycle participation remains explicit through target roots and decorators such as `@load`/`@tick`;
9. files are parsed separately and retain source provenance; they are never concatenated into a synthetic source file;
10. resources declared by a package belong to that package's artifact contribution, not to a global mutable catalog.

Keeping explicit `export` preserves current RedScript syntax and avoids a source-breaking capitalization convention.

### 2.3 Project versus workspace

V1 implements one module/project. A later `redscript.work` may join multiple local modules for development, but it is not required to ship the package compiler.

A workspace must never change published module identity or dependency resolution. It only replaces selected module paths with local roots.

## 3. Proposed project layout

```text
castle/
├── redscript.toml
├── redscript.lock                 # introduced with remote dependencies
├── cmd/
│   ├── pack/
│   │   └── main.mcrs              # package pack; exported target entry
│   └── admin/
│       └── main.mcrs              # package admin; command-sequence entry
├── combat/
│   ├── combat.mcrs                # package combat
│   └── damage.mcrs                # package combat
├── world/
│   └── generation.mcrs            # package world
├── assets/
│   ├── recipes/
│   └── structures/
└── tests/
```

`cmd/` is a recommended convention, not a compiler special case. Target entries are explicit in the manifest.

Example source:

```mcrs
// combat/combat.mcrs
package combat;

export fn start_round(): void {
  say("Fight!");
}
```

```mcrs
// cmd/pack/main.mcrs
package pack;

import "github.com/bkmashiro/castle/combat" as combat;

@load
export fn main(): void {
  combat::start_round();
}
```

The precise package-import parser syntax is a P2 RED-test decision. The semantic contract is fixed now: canonical module/package path, explicit optional alias, qualified access, and no filesystem-relative imports in public package APIs.

## 4. Manifest contract

The existing `redscript.toml` loader is only a minimal hand-written subset. It silently ignores unknown sections and cannot safely represent target tables or structured dependencies. Before extending the schema, replace it with a real TOML 1.0 parser and strict typed validation.

Proposed manifest:

```toml
[project]
name = "castle"
module = "github.com/bkmashiro/castle"
namespace = "castle"
mc-version = "26.2"
description = "Castle gameplay datapack"
source-roots = ["."]

[target.pack]
kind = "datapack"
entry = "github.com/bkmashiro/castle/cmd/pack::main"
out = "dist/castle"
default = true

[target.admin]
kind = "commands"
entry = "github.com/bkmashiro/castle/cmd/admin::main"
out = "dist/admin.commands.json"

[assets]
roots = ["assets"]
include = ["**/*.json", "**/*.nbt"]

[dependencies]
# P3: local dependencies first; remote/versioned dependencies arrive in P6.
common = { path = "../common" }

[compiler]
optimization = 2
no-dce = false
```

### 4.1 Strictness

Manifest loading must:

- report malformed TOML with file/line/column;
- reject unknown keys by default and offer nearest-key suggestions;
- resolve all paths relative to the manifest root, never process cwd;
- normalize and contain-check source, dependency, asset, and output paths;
- reject duplicate target names and multiple defaults;
- reject target entry paths outside the project/dependency graph;
- validate Minecraft version before source compilation;
- return a `LoadedProject` containing `manifestPath` and `rootDir`, not just detached values;
- allow CLI flags to override only documented target settings, with the final resolved config inspectable through `redscript project` or `redscript build --explain`.

### 4.2 Compatibility mode

`redscript compile path/file.mcrs` without a manifest remains valid. The CLI creates an in-memory ephemeral project:

```text
module path       = local/<derived-name>
package           = legacy
namespace         = --namespace or filename
selected target   = implicit datapack
entry              = supplied file
```

Legacy file-string imports and `module library;` continue through an adapter. New project builds must not use source concatenation.

## 5. Package and dependency resolution

Resolution is deterministic and shared by CLI, compiler API, tests, and LSP.

### 5.1 Resolution order

For import path `github.com/bkmashiro/castle/combat`:

1. if it equals the current module path or has that prefix, resolve inside the current module root;
2. otherwise resolve the longest matching declared dependency module path;
3. resolve RedScript stdlib through an explicit reserved module identity, not an ambient include directory;
4. reject undeclared absolute package paths;
5. relative file imports are compatibility-only and never cross module roots.

There is no `NODE_PATH`-style ambient global search in project mode.

### 5.2 Package graph

The loader produces:

```ts
interface PackageId {
  modulePath: string
  packagePath: string
}

interface LoadedPackage {
  id: PackageId
  name: string
  dir: string
  sourceFiles: SourceFile[]
  imports: PackageId[]
}

interface PackageGraph {
  rootPackages: PackageId[]
  packages: Map<string, LoadedPackage>
  topologicalOrder: PackageId[]
}
```

The graph key is canonical package path, not package name. Two dependencies may both contain a package named `util` without collision.

### 5.3 Visibility and symbol identity

Resolved symbols use stable semantic IDs:

```text
<module-path>/<package-relative-path>::<symbol>
```

Minecraft function paths are derived later by the selected target; compiler symbol identity must not be a Minecraft resource path.

This fixes a current architectural leak in `compileModules()`, where module names are directly prefixed onto emitted function names and scoreboard objectives.

### 5.4 Dependency phases

- **P2:** packages inside one module;
- **P3:** local path dependencies with root containment and module identity checks;
- **P6:** immutable remote dependencies, semantic versions, content hashes, and `redscript.lock`;
- no central registry is required for the first usable project/package release.

## 6. Build target model

A build target consists of:

```ts
type TargetKind = 'datapack' | 'commands' | 'function-set'

interface BuildTarget {
  name: string
  kind: TargetKind
  entry: SymbolId
  minecraftVersion: McVersion
  namespace: string
  output: string
  profile: TargetProfile
}
```

Only `datapack` and `commands` are required for the first release. `function-set` remains designed but disabled until embedding semantics are proven.

### 6.1 Datapack target

Outputs a complete pack directory or zip:

- `pack.mcmeta`;
- generated `.mcfunction` files;
- load/tick/function tags;
- generated and copied JSON resources;
- structure NBT;
- optional overlays and metadata supported by the selected MC version.

It supports helper functions, scheduling, macros, persistent scoreboards/storage, lifecycle decorators, and arbitrary datapack resources subject to Minecraft-version validation.

### 6.2 Commands target

Outputs a finite, ordered command program intended for command blocks, server consoles, installers, or other tools.

Initial output contract:

```json
{
  "schema": 1,
  "minecraftVersion": "26.2",
  "entry": "...::main",
  "setup": ["scoreboard objectives add ..."],
  "commands": [
    { "command": "...", "phase": "invoke", "source": { "file": "...", "line": 12 } }
  ],
  "cleanup": ["scoreboard objectives remove ..."]
}
```

A sibling `.mccommands` text projection may be generated for copy/paste, but JSON is canonical because command-block tooling needs ordering, source provenance, and setup/cleanup separation.

V1 `commands` constraints:

- output must be finite at compile time;
- no generated `.mcfunction` calls may remain;
- no datapack tags, JSON resources, NBT files, or `pack.mcmeta`;
- helper calls must be safely inlined;
- recursive call graphs are rejected;
- constant-bounded loops may unroll within a configured command budget;
- runtime loops, timers, scheduling, coroutines, and lifecycle decorators are rejected;
- scoreboard/storage operations may be used only when their setup and cleanup requirements are representable in the manifest;
- a target command budget defaults to a conservative finite limit and reports expansion provenance when exceeded;
- command ordering is semantic and cannot be changed by optimizers unless dependency/effect analysis proves it safe.

This target does **not** initially promise to generate a physical command-block structure, falling-block contraption, or “one command” installer. Those are possible future output adapters over the canonical command manifest, not compiler semantics.

### 6.3 Future strict single-command profile

A future `single-command` profile can require exactly one emitted Minecraft command and zero setup/cleanup. It should reuse the same capability checker rather than introduce syntax-specific special cases.

## 7. Capability system

Target compatibility must not be implemented as a growing list of AST-node checks inside each emitter.

### 7.1 Capability vocabulary

Start with a small semantic vocabulary:

```ts
type Capability =
  | 'artifact.pack-metadata'
  | 'artifact.function-files'
  | 'artifact.json-resources'
  | 'artifact.nbt-resources'
  | 'lifecycle.load'
  | 'lifecycle.tick'
  | 'execution.multiple-commands'
  | 'execution.helper-functions'
  | 'execution.recursion'
  | 'execution.schedule'
  | 'execution.macros'
  | 'state.scoreboard'
  | 'state.storage'
```

Do not encode every language syntax as a capability. Capabilities describe required runtime/artifact mechanisms.

### 7.2 Requirements and reachability

Every target-relevant semantic item contributes requirements:

```ts
interface CapabilityRequirement {
  capability: Capability
  reason: string
  source: SourceSpan
  owner: SymbolId | ResourceId
}
```

Requirements are inferred from:

- decorators and lifecycle registrations;
- HIR/MIR operations and stdlib intrinsics;
- runtime call graph, including transitive calls;
- resource definitions and copied assets;
- lowering decisions such as non-inlined helper functions;
- Minecraft version gates.

Validation applies to the selected target's reachable closure, not every unused function in every dependency. Parse/type errors still apply to all loaded source files in the package, while target capability errors apply only to target-reachable executable symbols and explicitly selected resources.

### 7.3 Capability profiles

| Capability | `datapack` | `commands` V1 | Notes |
| --- | :---: | :---: | --- |
| pack metadata | ✓ | ✗ | command output is not a pack |
| function files/helper calls | ✓ | ✗ | commands target must inline |
| JSON/NBT resources | ✓ | ✗ | no datapack filesystem |
| load/tick lifecycle | ✓ | ✗ | no function tags |
| finite multiple commands | ✓ | ✓ | commands output is ordered |
| recursion | ✓* | ✗ | datapack still subject to MC limits |
| schedule/timers/coroutines | ✓ | ✗ | requires persistent function entrypoints |
| macros | ✓ | only if fully expanded | no residual function macro calls |
| scoreboard | ✓ | ✓ with setup contract | setup appears separately |
| storage | ✓ | ✓ with setup/cleanup contract | only finite direct operations |

### 7.4 Language compatibility examples

| Feature | Datapack | Commands | Rule |
| --- | :---: | :---: | --- |
| package/import/export | ✓ | ✓ | compile-time only |
| structs/enums/const evaluation | ✓ | ✓ | if lowering remains finite |
| raw Minecraft command | ✓ | ✓ | version validator still applies |
| ordinary helper function | ✓ | conditional | inline entire reachable body |
| dynamic `if`/`match` | ✓ | conditional | each branch must lower to finite commands |
| constant-bounded loop | ✓ | conditional | unroll under budget |
| runtime `while` or recursive loop | ✓ | ✗ | requires re-entry/helper function |
| `@load`, `@tick`, `@on` | ✓ | ✗ | lifecycle unavailable |
| `@watch`, `@retry`, `@memoize` | ✓ | usually ✗ | persistent runtime/helper requirements |
| timers, scheduler, coroutine | ✓ | ✗ | schedule/helper entrypoints required |
| resource definition | ✓ | ✗ | requires datapack artifact |
| declaration-only resource ID | ✓ | ✓ | compile-time typing only |

“Conditional” must be decided from semantic requirements after optimization/inlining analysis—not from surface syntax alone.

### 7.5 Diagnostics

Example:

```text
error[RST2003]: target 'admin' (commands) cannot provide lifecycle.tick
  --> cmd/admin/main.mcrs:8:1
   |
 8 | @tick(rate=20)
   | ^^^^^^^^^^^^^^ requires a datapack tick function tag
   |
   = required by: admin::heartbeat
   = target allows: finite ordered commands, scoreboard setup, storage setup
   = fix: build target 'pack', or expose heartbeat as an explicitly invoked function
```

Diagnostics must include:

- target name and kind;
- missing capability;
- original source span;
- shortest requirement/call chain from entry;
- whether the issue came from syntax, imported code, stdlib intrinsic, resource, or backend lowering;
- actionable alternatives when known.

`--lenient` must never turn target incompatibility into emitted partial output.

## 8. Compiler architecture

```text
redscript.toml
      │
      ▼
Project discovery + strict manifest validation
      │
      ▼
Package loader ──→ canonical package graph ──→ symbol resolver
      │                                         │
      ├── source files ─→ AST/package scopes ─→ HIR/MIR
      └── assets/resources ───────────────────→ Artifact Graph
                                                │
entry + reachability ─→ Capability Requirements │
                    └─→ Target Validator ────────┤
                                                │
                    ┌───────────────────────────┴────────────────────┐
                    ▼                                                ▼
          Datapack backend                                Commands backend
   LIR + resource artifact merge                    inline/flatten + effect order
                    │                                                │
       directory/zip + manifest                       commands JSON/text manifest
```

### 8.1 Required boundaries

Create project-owned types rather than expanding `CompileOptions` indefinitely:

- `src/project/model.ts` — loaded project/module/package/target identities;
- `src/project/manifest.ts` — TOML parsing and typed validation;
- `src/project/discovery.ts` — nearest-root and nested-module boundaries;
- `src/project/package-loader.ts` — directory package compilation units;
- `src/project/package-graph.ts` — import resolution/cycle diagnostics;
- `src/project/build.ts` — build orchestration;
- `src/targets/model.ts` — target kinds and profiles;
- `src/targets/capabilities.ts` — capability vocabulary and inference;
- `src/targets/validate.ts` — reachable requirement checking;
- `src/targets/datapack.ts` — adapter over current backend;
- `src/targets/commands.ts` — finite command backend;
- `src/artifacts/model.ts` — typed artifact graph and provenance.

Existing boundaries remain as compatibility adapters:

- `compile(source, options)` builds an ephemeral one-file project;
- `compileModules()` is deprecated only after package-graph parity tests pass;
- `DatapackFile[]` remains a public projection of typed artifacts during migration;
- the current file import preprocessor remains legacy-only and must not be reused by package builds.

### 8.2 No premature shared IR rewrite

Do not replace HIR/MIR/LIR merely to add targets. First add:

1. package-aware semantic identity;
2. capability/effect summaries;
3. a target-specific lowering boundary;
4. commands backend spike over the existing reachable HIR/MIR subset.

If flattening LIR loses information needed for safe command sequencing, the commands backend may branch from MIR. That decision requires a bounded spike and golden evidence; it is not assumed in advance.

## 9. CLI contract

```text
redscript init <name>                   create project manifest and package
redscript project                       print resolved root/module/packages/targets
redscript check [./...]                 parse/typecheck all selected packages
redscript check --target admin          include target-capability validation
redscript build                         build default target
redscript build --target pack           build one named target
redscript build --all-targets            build all targets independently
redscript graph --packages              print package dependency graph
redscript graph --capabilities --target admin
redscript compile file.mcrs             legacy ephemeral-project flow
```

Rules:

- `build` is project/target-oriented;
- `compile` remains the direct file compatibility command;
- target selection is explicit when no default exists;
- building all targets returns independent diagnostics and never allows one target's artifacts to leak into another;
- `check --target` runs the same target validator as `build` without emission;
- `project`/`graph` output supports machine-readable JSON for LSP and CI.

## 10. Delivery roadmap

### P0 — architecture contract and executable fixtures

**Objective:** Freeze project/package/target semantics before changing parser or compiler behavior.

**Files:**

- Modify: `docs/plans/generic-datapack-language-roadmap.md`
- Create: `src/__tests__/fixtures/projects/` fixture tree
- Create: `src/__tests__/project/roadmap-contract.test.ts`

**Slices:**

- [x] define module/package/namespace/target terminology;
- [x] define manifest schema and backward-compatibility behavior;
- [x] define `datapack` and `commands` semantics;
- [x] define initial capability vocabulary and matrix;
- [x] define phased implementation order and gates;
- [ ] encode fixture layouts for one valid project, package cycle, package-name mismatch, and dual-target project;
- [ ] add contract tests that pin paths and expected diagnostic codes before implementation.

**Gate:** document readback, `git diff --check`; fixture tests intentionally RED only when P1 begins.

### P1 — strict project model and manifest loader

**Objective:** Make `redscript.toml` a trustworthy project root and target source of truth.

**Files:**

- Create: `src/project/model.ts`
- Create: `src/project/manifest.ts`
- Create: `src/project/discovery.ts`
- Modify: `src/config/project-config.ts` into a compatibility adapter
- Modify: `src/cli.ts`
- Test: `src/__tests__/project/manifest.test.ts`
- Test: `src/__tests__/project/discovery.test.ts`

**RED/GREEN slices:**

1. discover nearest manifest and return root/manifest paths;
2. stop discovery at nested module roots;
3. parse a valid project and named target;
4. reject malformed and unknown manifest keys with locations;
5. resolve paths relative to project root;
6. reject output/source path escape;
7. resolve default target and CLI override precedence;
8. expose `redscript project --format json`;
9. preserve old `loadProjectConfig()` behavior through an adapter.

**Acceptance:** a manifest can define two targets and `redscript project` reports the same resolved model regardless of cwd.

**Gate:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/project/manifest.test.ts \
  src/__tests__/project/discovery.test.ts \
  src/__tests__/config/project-config.test.ts --runInBand
npm run build
git diff --check
```

### P1.5 — compiler session and source-unit spine

**Objective:** Introduce stable stage ownership before package linking changes compiler semantics.

**Files:**

- Create: `src/compiler/session.ts`
- Create: `src/compiler/source-manager.ts`
- Create: `src/compiler/stages.ts`
- Modify: `src/emit/compile.ts` into a compatibility adapter/orchestrator
- Test: `src/__tests__/compiler/session-parity.test.ts`

**RED/GREEN slices:**

1. freeze a representative legacy compile corpus and sorted artifact/diagnostic snapshots;
2. introduce root-aware immutable source units without changing import behavior;
3. wrap existing stage functions in `CompilerSession` with typed inputs/outputs;
4. route public `compile()` through an ephemeral-project session;
5. prove byte-identical datapack artifacts and equal diagnostics;
6. keep package graph, `SymbolId`, and target behavior out of this tranche.

**Acceptance:** the new compiler spine owns source/stage context while every frozen single-file compile result remains byte-identical.

**Gate:** focused session parity tests, existing compile/import tests, build, static Minecraft validation, and `git diff --check`.

### P2 — first-class packages inside one module

**Objective:** Compile directory packages without file concatenation or globally keyed module names.

**Status (2026-07-30): completed.** Strict project compilation now parses every source independently, builds an immutable canonical package graph, resolves exported `PackageSymbolId`s, and only then projects a cloned linked program into the legacy datapack backend. The projection boundary preserves canonical symbol IDs in HIR while keeping physical function paths backend-specific.

**Files:**

- Modify: `src/ast/types.ts` for package declaration/qualified identity
- Modify: `src/parser/index.ts`
- Create: `src/project/package-loader.ts`
- Create: `src/project/package-graph.ts`
- Create: `src/resolver/package-symbols.ts`
- Modify: `src/hir/types.ts` and `src/hir/lower.ts` to carry package-aware IDs
- Create: `src/compiler/package-backend.ts` as the isolated legacy-backend projection
- Modify: `src/compiler/session.ts` and `src/emit/modules.ts` for project compilation
- Test: `src/__tests__/project/package-loader.test.ts`
- Test: `src/__tests__/project/package-resolution.test.ts`
- Test: `src/__tests__/project/package-cycle.test.ts`

**RED/GREEN slices:**

1. ✅ parse `package <name>;` in project mode;
2. ✅ group multiple source files into one package scope;
3. ✅ reject mixed package names in one directory;
4. ✅ derive canonical package path from module path + directory;
5. ✅ parse canonical qualified package import and optional alias;
6. ✅ resolve exported qualified symbols;
7. ✅ allow equal package names at distinct canonical package paths;
8. ✅ reject package cycles with complete cycle diagnostics;
9. ✅ topologically order packages deterministically;
10. ✅ preserve original file/span diagnostics, including multi-file type errors;
11. ✅ adapt one project package graph into the current backend without mutating source ASTs;
12. ✅ keep legacy `module` and file imports green outside strict project mode.

**Acceptance:** `cmd/pack` imports `combat`, where two files jointly define package `combat`, and the emitted datapack contains stable package-qualified function paths without source concatenation.

**Gate:** focused project/package tests, existing module/import tests, build, and static Minecraft validation.

### P3 — local module dependencies

**Objective:** Resolve explicitly declared local modules without ambient include paths.

**Status (2026-07-30): completed.** Strict manifests parse explicit `{ path = "..." }` dependencies whose table keys are the expected canonical module identities. A single recursive module graph validates identities, source-root containment, deterministic dependency order, complete module cycles, and location-independent source hashes before the package loader reads any dependency source. Package imports resolve against the current module first and then the longest matching direct dependency; transitive or ambient sibling imports remain unavailable unless declared.

**Files:**

- Modify: `src/project/model.ts`
- Modify: `src/project/manifest.ts`
- Create: `src/project/module-graph.ts`
- Modify: `src/project/package-graph.ts`
- Modify: `src/project/package-loader.ts`
- Modify: `src/compiler/package-backend.ts`
- Modify: `src/cli.ts` project inspection
- Test: `src/__tests__/project/module-graph.test.ts`
- Test: `src/__tests__/project/local-dependencies.test.ts`

**Slices:**

1. ✅ parse `{ path = "..." }` dependency entries;
2. ✅ load and validate dependency module identity;
3. ✅ longest-prefix import resolution after current-module ownership;
4. ✅ reject undeclared and transitive-only cross-module imports;
5. ✅ reject mismatched declared module paths;
6. ✅ detect cycles across local modules with a complete deterministic path;
7. ✅ preserve per-module source/output containment and ignore symlink source traversal;
8. ✅ expose the aggregate dependency source hash in `PackageGraph` and `redscript project` as the required project-cache-key component. Strict project `--incremental` remains fail-closed until an atomic package-artifact cache consumes this graph, so the legacy file cache cannot accidentally omit dependency content.

**Acceptance:** a project imports one local shared module reproducibly from any cwd; undeclared sibling imports fail.

**Gate:** focused manifest/module/package/backend/CLI tests, build, static Minecraft validation, and `git diff --check`.

### P4 — target model and capability validation

**Objective:** Make target incompatibility a first-class semantic diagnostic before adding a second emitter.

**Files:**

- ✅ Create: `src/targets/model.ts`
- ✅ Create: `src/targets/capabilities.ts`
- ✅ Create: `src/targets/reachability.ts`
- ✅ Create: `src/targets/validate.ts`
- ✅ Create: `src/compiler/package-typecheck.ts`
- ✅ Create: `src/compiler/project-target-analysis.ts`
- ✅ Modify: `src/compiler/session.ts`, package backend, diagnostics, CLI, and public exports
- ✅ Test: `src/__tests__/targets/capability-inference.test.ts`
- ✅ Test: `src/__tests__/targets/validation.test.ts`
- ✅ Test: `src/__tests__/compiler/package-typecheck.test.ts`

**RED/GREEN slices:**

1. ✅ define immutable `datapack` and `commands` profiles;
2. ✅ typecheck the immutable linked package closure before target validation, including cross-package exported signatures;
3. ✅ compute deterministic reachable function graphs from the selected entry and target-owned decorator roots;
4. ✅ infer decorator, typed registry-reference, schedule, state, opaque-command, external-function, helper, dynamic-dispatch, and recursion requirements;
5. ✅ propagate requirement provenance through deterministic shortest call chains;
6. ✅ allow unreachable helpers and unimported local dependency packages to remain outside the target closure;
7. ✅ reject reachable target-incompatible requirements with stable `RST2xxx` diagnostics;
8. ✅ distinguish declaration-surface `resource item namespace:path;` references (target-neutral) from future emitting resource artifacts (`resource-artifacts`, `RST2003`);
9. ✅ prove lenient mode cannot downgrade target legality;
10. ✅ add `redscript graph --capabilities --target <name>` with deterministic JSON/human inspection;
11. ✅ expose the same read-only analysis through `CompilerSession.analyzeProject()` and public APIs;
12. ✅ run capability validation before target-specific lowering or artifact mutation;
13. ✅ emit and deterministically merge project-package `@function_tag` contributions for datapacks while rejecting them for commands (`RST2008`);
14. ✅ fail closed for package-backend decorators whose runtime lowering is not yet wired (`RST2009` event runtime, `RST2010` runtime wrappers, `RST2011` load dependencies) instead of silently omitting semantics.

**P4 checkpoint acceptance:** one manifest can compile a datapack target and fail a commands target at a lifecycle/function-tag contribution before emit; reachable failures include stable source and shortest call-chain provenance. At the P4 checkpoint, a target-compatible commands program stopped explicitly at the then-unimplemented P5 backend; P5 below replaces that stop with finite-command legalization.

**Gate:** focused frontend/package/target/CLI tests, legacy decorator/tag parity tests, TypeScript build, static Minecraft validation, and `git diff --check`.

### P5 — commands backend

**Objective:** Emit a finite canonical command manifest for the target-compatible subset.

**Files:**

- Create: `src/targets/commands.ts`
- Create: `src/targets/command-program.ts`
- Modify: `src/emit/modules.ts`, `src/compiler/package-backend.ts`, `src/project/manifest.ts`, `src/cli.ts`
- Test: `src/__tests__/targets/commands.test.ts`
- Test: `src/__tests__/targets/commands-integration.test.ts`
- Test: `src/__tests__/emit/modules-lir-adapter.test.ts`, `src/__tests__/cli.test.ts`

**RED/GREEN slices:**

1. emit one raw command with source provenance;
2. emit ordered finite command sequence;
3. separate setup/invoke/cleanup phases;
4. inline acyclic helper calls;
5. lower finite dynamic branch commands without helper files;
6. unroll constant loops under budget;
7. reject recursion and residual function calls;
8. preserve effect ordering across optimization;
9. enforce command-count budget with expansion trace;
10. emit canonical JSON plus text projection;
11. compile one source project independently to datapack and commands outputs;
12. static-validate every generated command against selected MC version.

**Acceptance:** an admin utility project builds a datapack target and a no-datapack finite command sequence; the latter contains no `function <namespace>:...` calls and no pack artifacts.

**Gate:** focused commands tests, project E2E, build, `npm run validate-mc`, artifact readback.

**Implementation checkpoint (2026-07-31): complete.**

- `src/targets/command-program.ts` owns the immutable, schema-versioned `CommandProgram`, canonical JSON serializer, and human-readable text projection.
- `src/targets/commands.ts` owns helper inlining, compiler-CFG branch flattening, residual-call verification, source/expansion provenance, effect labels, command budgeting, and final static command validation.
- Commands lowering reads a deeply frozen optimized LIR snapshot through `compileModulesWithLIR(..., { emitArtifacts: false })`; it does not invoke the datapack emitter or construct `pack.mcmeta`/tag artifacts.
- Named package local calls, impl methods, and specialized method clones now share the emitter's canonical qualified physical identity, closing pre-existing helper mismatches and method-path collision risk.
- Small canonical `for (let i = 0; i < N; i = i + 1)` loops with `N <= 8` reuse the verified optimizer unroll; dynamic/complex loops retain their generated-helper requirement and fail closed for commands.
- `[target.<name>] max-commands = <positive integer>` overrides the default budget of 1024. It is commands-only, participates in manifest authority validation, and reports `RST2102` with the active expansion trace.
- `RST2101` rejects unknown, recursive, contextual, macro, and residual function calls (qualified or unqualified); function-like text in ordinary command arguments is not misclassified. `RST2103` rejects malformed or statically invalid final commands.
- Every final command passes the production 1.21.4 Brigadier baseline validator after selected-version rendering. The manifest records `minecraft-1.21.4-baseline+selected-renderer`; this is static evidence, not a 26.2 live-server claim.
- `CompilerSession.compileProject()` returns an explicit `datapack | commands` result. Commands results contain no datapack files and expose the frozen program, canonical JSON, and text projection.
- Dynamic branch guards are initialized in `invoke` and reset in `cleanup`; user-visible objectives and persistent state are not removed.
- CLI commands output writes `<target>.json` plus `<target>.txt` through staged replacement with rollback. Capability/legalization failures leave prior artifacts untouched, and `check --target` runs the same backend verifier without writing.
- Multi-target E2E compiles one project independently to datapack and commands, verifies helper/branch/constant-loop lowering, confirms no residual `function` command, validates every generated command, and checks deterministic readback.

### P6 — versioned remote dependencies and lockfile

**Objective:** Make package reuse reproducible without hiding network or mutable-version behavior.

- ✅ define canonical HTTPS/file Git source identities and exact peeled commit identities;
- ✅ resolve Git semantic-version tags and transitive constraint closure only through explicit `redscript resolve`;
- ✅ write schema-versioned canonical `redscript.lock` with source URL, canonical constraint set, exact version, revision, tree content hash, and declared-license provenance;
- ✅ build ordinary `project`/`check`/`compile` flows offline from lock plus a warm content-addressed cache;
- ✅ bound Git command time, process output, downloaded bytes, source bytes, file count, dependency count, and resolver iterations;
- ✅ reject missing cache entries, changed content, source/version/license/module identity mismatch, stale lock entries or constraint sets, module dependency cycles, ambient Git source rewrites, symlinked cache entries, source-tree symlinks, submodules, and local path escapes inside remote repositories;
- ✅ keep local workspace paths outside lock identity; a future `redscript.work` replacement layer remains separate.

A central package registry is out of scope until Git/source dependencies and lockfile semantics are proven.

**P6 checkpoint acceptance:** `redscript resolve [path]` is the sole network-capable dependency operation. It selects deterministic SemVer tags, peels annotated tags to commits, materializes clean immutable checkouts under `~/.cache/redscript/dependencies` (or absolute `REDSCRIPT_DEPENDENCY_CACHE`), and atomically replaces the root lock only after the complete transitive graph stabilizes. Deleting the Git origin after resolution does not affect an ordinary warm-cache build. `redscript project --format json` exposes locked source/version/hash/license provenance. Ordinary builds never invoke Git and fail before package parsing on lock/cache content mismatch.

### P7 — typed datapack artifact graph and universal resources

**Objective:** After projects and targets exist, extend the datapack target beyond commands.

- ✅ introduce typed `DatapackArtifact` while preserving `DatapackFile` projection;
- ✅ load configured JSON/NBT assets through package/project provenance;
- ✅ centralize versioned registry-to-path descriptors;
- ✅ extend `resource <kind> <id> from "...";`;
- ✅ validate path collisions, JSON syntax, known schemas, references, and lifecycle;
- ✅ support deterministic directory and zip outputs;
- ✅ reject all emitting resources under commands targets through P4 capabilities.

Acceptance: a mixed project builds `.mcfunction`, recipe JSON, item tag JSON, and structure NBT into one deterministic 26.2 datapack.

**P7 checkpoint acceptance:** strict project compilation now wraps generated functions/tags and source-owned JSON/NBT contributions in one sorted typed graph. Asset discovery is include-filtered, symlink-free, realpath-contained, size-bounded, package-provenanced, and covered by module content hashes. Registry descriptors choose pre-1.21 plural or modern singular paths. Known JSON schemas, local references, NBT structure, lifecycle/media combinations, identity/path collisions, atomic directory replacement, and byte-identical STORE zip projection are validated before output mutation. Commands targets reject emitting declarations with `RST2003`; legacy single-file compile remains on its compatibility adapter.

### P8 — selective typed resource builders

**Status (2026-07-31): completed for the planned non-worldgen families.**

Order:

1. ✅ tags — source-level builder with merge/replace, direct/nested, required/optional entries;
2. ✅ recipes — version-aware typed package API for shaped, shapeless, cooking, stonecutting, and smithing transform;
3. ✅ advancements — typed criteria, requirements, parent/display, and rewards;
4. ✅ predicates — typed leaves, references, and boolean composition;
5. ✅ loot tables/item modifiers — typed pools, selected entries, conditions, and function sequences;
6. 📋 worldgen only after schema/reference and live-server gates are mature.

All builders lower through the P7 registry and artifact graph. Required local references and same-kind cycles fail deterministically; typed/strict-JSON output collisions share one identity/path boundary. Recipe paths and payload shapes are selected from the target version profile. Strict JSON/from-file remains the permanent escape hatch for new Minecraft/modded registries.

**P8 checkpoint acceptance:** equivalent typed and strict-JSON tags and recipes have byte-identical canonical payloads; source-level typed tags compile through project/package provenance and fail with `RST2003` on commands targets before emission; package-installed smoke constructs every public builder family. No builder creates a parallel output map or narrows `resource <kind> <id> from "...";`.

### P9 — real Minecraft and release gates

**Status (2026-08-02): completed for the stable Paper 1.21.4 channel.**

- ✅ loaded a mixed source-typed/from-file/package-builder graph on Paper `1.21.4-232`;
- ✅ proved function, tag, predicate, loot/item-modifier, recipe/advancement load, and structure mutations across `/reload`;
- ✅ corrected `structure` to `reload` from live evidence;
- ✅ added strict JSON `dimension` / `dimension_type` descriptors and proved `world_reopen` behavior separately;
- ✅ executed the commands backend's canonical `setup → invoke → cleanup` sequence against the same oracle;
- ✅ committed exact Paper/plugin hashes and machine-readable evidence under `docs/evidence/`;
- ✅ retained static validation as an independent label and kept the 26.2 schema channel static-only;
- ✅ kept `DEFAULT_MC_VERSION` unchanged because no compatible 26.2 live oracle has passed.

Reproduce with `MC_P9_TEMPLATE_DIR=~/mc-test-server npm run test:mc-lifecycle:live`. The offline-safe form, `npm run test:mc-lifecycle`, emits `[SKIP]` and a JSON report when the managed Paper prerequisites are unavailable.

## 11. Cross-phase gates

Every implementation slice must preserve:

```bash
npm run build
npm test -- --selectProjects unit --runInBand
npm run validate-mc
git diff --check
```

Use focused tests while iterating; run the broad unit/static gate at coherent tranche boundaries, not after each tiny edit.

Additional package/target invariants:

- same source + manifest + lockfile produces byte-identical artifacts;
- cwd does not affect project resolution or output;
- target A cannot leak files/config into target B;
- package cycle/order diagnostics are deterministic;
- target validation happens before output directory mutation;
- a failed build leaves no partial output (stage then atomic replace);
- source spans survive package resolution, inlining, and target diagnostics;
- single-file legacy compile stays covered until a separately announced major-version migration.

## 12. Migration strategy

### Existing single-file users

No immediate source changes. `compile()` and `redscript compile file.mcrs` retain behavior through an ephemeral project adapter.

### Existing `module` users

Provide a migration diagnostic and formatter-assisted rewrite:

```mcrs
module combat;
```

becomes a directory package:

```mcrs
package combat;
```

Existing `compileModules()` remains API-compatible until package-build parity exists. It is not extended with new target semantics.

### Existing file imports

Private relative file imports continue in compatibility mode. Project mode recommends package imports and warns on imports that expose filesystem layout as public API.

### Existing project config

Old `[project] namespace/mc-version`, `[compiler]`, and `[output]` values map into one implicit `datapack` target. `redscript project --explain` shows this conversion. A future formatter can write the explicit target table.

## 13. Explicit non-goals

- no compiler rewrite solely to add packages;
- no Go capitalization-based visibility;
- no implicit package initialization;
- no ambient global include search in project mode;
- no command-block physical-layout generator in the first commands backend;
- no claim that every language feature can compile to every target;
- no silent target downgrade, resource omission, helper omission, or partial output;
- no custom syntax for every Minecraft JSON schema;
- no central package registry before lockfile/source dependency semantics;
- no snapshot Minecraft feature accepted by a stable target;
- no default switch to 26.2 before generated command and real-server validation.

## 14. Immediate next implementation slice

P1–P9 are complete for the stable 1.21.4 channel. Preserve the P9 lifecycle runner as a release evidence lane; do not treat it as permission to switch the default target or add broad typed worldgen surfaces.

The next coherent compatibility slice is:

1. retain the 1.21.4 managed Paper lifecycle gate and its exact evidence labels;
2. provision a compatible 26.2 oracle before considering a default-version switch;
3. audit generated commands and resource schemas against that same 26.2 artifact;
4. keep stable and snapshot evidence separate in CI and release reports;
5. begin typed worldgen builders only after schema/reference design and a matching world-reopen oracle pass.

## 15. Repository evidence behind this plan

Current seams inspected:

- `src/config/project-config.ts` — nearest-manifest discovery exists but returns no root/path and parses only a minimal TOML subset;
- `src/compile.ts` — file imports are currently preprocessed through recursive source concatenation, with a special `module library;` path;
- `src/emit/modules.ts` — `compileModules()` keys modules globally by short name, rewrites AST calls, prefixes emitted function paths, and manages cross-module DCE;
- `src/emit/compile.ts` — current primary Source → AST → HIR → MIR → LIR → datapack pipeline;
- `src/ast/types.ts` and `src/parser/decl-parser.ts` — existing module/import/resource declaration syntax;
- `src/testing/datapack-artifact-validator.ts` — existing offline datapack artifact checks;
- `docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md` — existing registry declaration foundation;
- `docs/plans/redscript-vnext-roadmap.md` — previous release and compiler-hardening roadmap.

Minecraft research baseline and sources:

- Java Edition 26.1: <https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1>
- Java Edition 26.2: <https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2>
- 26.3 snapshot notes: <https://www.minecraft.net/en-us/article/minecraft-26-3-snapshot-5>
- datapack structure: <https://minecraft.wiki/w/Data_pack>
- pack/data version table: <https://minecraft.wiki/w/Pack_format>
