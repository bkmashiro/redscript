# Phase 15 — `.d.mcrs` declaration-surface implementation plan

Goal: establish a declaration-first package boundary for RedScript that supports external API signatures, exportable package APIs, and non-emitting declaration graphs, with a path to generating `.d.mcrs` artifacts for collaborators.

## Current state audit

Current declaration support exists only in a narrow declaration-only mode.

`builtins.d.mcrs` exists at repo root and `editors/vscode/builtins.d.mcrs` is a copy; both are declaration-only files used as builtin metadata, not runtime code.

`Parser` accepts `declare fn ...;` and currently advances to `parseDeclareStub`, but `parseDeclareStub` discards the parsed shape and does not return a node.

`Parser` supports `export fn` and marks AST nodes with `isExported`.

`src/ast/types.ts` currently has `FnDecl`, `ImportDecl`, and `Program`; there is no dedicated declaration-only symbol table entry or external-call contract type.

`TypeChecker` currently checks `program.declarations` and `program.implBlocks` only; declarations that are not represented in AST are therefore not type-checked or signature-available.

`src/emit/compile.ts` compile pipeline typechecks and lowers declarations in `program.declarations`; nothing marks declarations as non-emitting at this stage today.

`src/compile.ts` preprocess resolves `import "..."` header directives and does not implement a package/declaration import boundary.

`src/lsp/server.ts` has builtin-specific fallback parsing for `builtins.d.mcrs` only (`loadBuiltinsFromDeclFile`), not generic `.d.mcrs` programmatic loading.

Tests currently validate that:
- `declare fn` parses and is ignored in `program.declarations` length (`src/__tests__/parser-coverage.test.ts`)
- `compile-all` explicitly skips both declaration files (`src/__tests__/compile-all.test.ts`)
- module export/import boundaries are tested in `compileModules` paths (`src/__tests__/emit/modules-*.test.ts`), but this is separate from declaration-only import semantics

## Desired `.d.mcrs` surface

External function declarations should be type-level contracts.

Example:
```mcrs
/// Adds a fixed-point value in namespace mypack.
export declare fn add(x: fixed, y: fixed): fixed @runtime("mypack:add");

/// Optional constructor from external package.
declare fn from_namespace(id: string): fixed;
```

Package API export surface should be explicit and discoverable.

Example:
```mcrs
module physics;

export fn integrate(pos: int, vel: int, dt: fixed): int;
export fn normalize(v: int): int;
```

A `.d.mcrs` source should not emit functions by default. It can contribute to:
- symbol visibility
- import resolution
- call signature checks
- hover/definition/completion via LSP

No runtime behavior should come from declaration-only nodes.

## Non-emitting semantics contract

Declaration-only files and declaration-only nodes participate in compile-time checks only.

Runtime emission should only include code reachable from executable definitions.

If an imported package contributes only declarations, `compile()` should still pass typecheck and resolve cross-package calls, but emit an empty function set unless non-declaration code exists.

Generator output must continue to emit exactly the same function set as current non-declaration code.

## Implementation sequence (6 steps)

1. Representation: add declaration-only node support in AST and parser.

Files: `src/ast/types.ts`, `src/parser/decl-parser.ts`, `src/parser/index.ts`.

Tests: `src/__tests__/parser-coverage.test.ts` and one focused parser fixture for mixed `declare`+`export`.

2. Typechecking contracts: support signature-only function nodes during environment collection and call-checking.

Files: `src/typechecker/index.ts`, possibly `src/typechecker/decorators.ts` if needed.

Tests: new `src/__tests__/typechecker/declare-function-contracts.test.ts` and targeted fixture using declared external calls.

3. Import boundary and non-emit behavior: resolve `.d.mcrs` (and declaration-only imports) into parser/typecheck graph without adding emitted functions.

Files: `src/emit/compile.ts`, `src/compile.ts`, `src/ast/types.ts`.

Tests: `src/__tests__/emit/compile-coverage.test.ts`, `src/__tests__/compile-all.test.ts`, and one new fixture test showing declaration-only file + executable file compile with 0/unchanged emissions.

4. LSP integration: load package declaration files into workspace/global declaration graph.

Files: `src/lsp/server.ts`, `src/lsp/*.ts` helpers if decomposition is needed.

Tests: `src/__tests__/lsp/*.test.ts`, especially completion/hover/definition paths.

5. `.d.mcrs` API generation from exported package signatures.

Files: `src/cli.ts`, new helper under `src/emit` or `src/emit/compile.ts` orchestration, CLI docs.

Tests: `src/__tests__/cli.test.ts` and a fixture-to-fixture golden diff for generated declaration output.

6. Optional extension: export manifest/metadata for external call lowering and doc preservation.

Files: `src/emit/compile.ts`, `src/cli.ts`, builtins metadata pipeline, `src/lsp/server.ts`.

Tests: `src/__tests__/emit/modules-coverage.test.ts`, `src/__tests__/lsp/completion.test.ts` with generated declarations.

## Safety gates

Do not change parser/operator meaning outside declaration mode without dedicated parser tests.

No declaration feature should change behavior of source files that do not import or include `.d.mcrs`.

All new declaration calls must be guarded by tests that demonstrate one-to-one old behavior for existing `.mcrs` fixtures and builtins.

Cross-stage boundaries should be validated by:
- parser contract tests for parse surface
- typechecker call validation tests for declared external functions
- compile stopAfterCheck tests for declaration-only dependency graphs
- one LSP smoke test covering declaration docs and usage completion

## Non-goals

Do not introduce unquoted `namespace:path` resource literals in this phase.

Do not alter Minecraft runtime command semantics or introduce declaration-time lowering heuristics.

Do not auto-merge declarations from arbitrary source roots beyond existing include/import resolution behavior.

Do not make function-body inlining or optimizer changes as part of this phase.

## Recommended Step 1 slice for Spark

Step 1 (AST/parser declaration representation) is the smallest bounded chunk and stays parser/type-only.

Deliverables:
- `declare fn` is represented as a dedicated AST node in declaration position.
- parser emits declaration-only `FnDecl` data instead of dropping it.
- no compile/import/emitter pipeline changes are made in this slice.
- tests cover mixed declaration/export parse shape and declaration-only fixture parsing.

Files to touch for Step 1:
- `src/ast/types.ts`
- `src/parser/decl-parser.ts`
- `src/parser/index.ts`
- `src/__tests__/parser-coverage.test.ts`
- one focused parser fixture for mixed `declare` + `export`
