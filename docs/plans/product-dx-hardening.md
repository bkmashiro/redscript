# Product DX hardening

Status: verified candidate on `fix/product-dx`. Not merged or published.

## Scope and implementation

Single-source compile/check, project compilation, editor discovery and incremental
cache discovery now use shared source/import identities. The single-source entry
uses `SourceGraph` and the package binder for files, unsaved buffers and explicit
`librarySources`. The old source import expander and flat alias binder were removed.

Canonical function symbols survive typechecking and HIR lowering. MIR does not
redispatch a resolved declaration as an intrinsic or receiver method merely because
its name matches. Physical function paths and scoreboard objectives remain separate
from source identity. The shared call ABI carries callee parameter types, return
information and macro conventions across project modules.

Compiler-owned `stdlib/` paths cannot be shadowed by a workspace directory. Module
imports respect exports and lexical shadowing. Callers must import a symbol's owner;
imports do not implicitly re-export their dependencies. Standalone declaration cycles
are discovered once before binding. Display paths preserve the caller's spelling
while physical file identities deduplicate symlinks and unsaved buffers.

Global scalar initialization runs before user load hooks. Ordinary global struct
methods use instance storage, retain mutation and isolate receivers. Mutable global
reads are not cached as lexical variables. Struct expressions are materialized once
before argument fields are passed. Plain-say interpolation captures actual MIR
operands into callsite-local storage, including local values, global fields and
string results; nested text calls do not overwrite another callsite's captures.

Function values use typed, build-local handles and ordinary call ABI dispatch.
Capture-free lambdas, named references, copying, runtime selection, returned values
and cross-module calls are covered. Capturing lexical variables is explicitly
rejected. Native scheduling still requires a static callback. Compiler-intrinsic
`Timer` values retain their documented function-local static-handle restriction;
module globals cannot silently execute the stdlib Timer stub bodies.

## Compatibility and validation policy

Unknown source calls remain errors. External declarations and raw Minecraft commands
remain explicit contracts. No permissive final-LIR fallback or global declaration
injection was added. Selected imports retain executable implementations and their
private dependencies without exposing those dependencies to callers.

Fixtures that relied on missing imports or private-function leakage now declare their
actual dependencies/exports. The former `damage(target, amount)` and `enchant(...)`
“builtin” tests accepted unresolved calls to APIs absent from the builtin catalog.
Their replacements check rejection and exact `raw(...)` command emission. The
separate documented `player.damage(amount)` library implementation is also checked.

Static report tests independently sum the complete per-case inputs instead of fixing
aggregate diagnostic counts to one compiler output snapshot. Exact synthetic-summary
checks, zero regressed cases, negative static deltas and offline equivalence gates
remain. These checks supply no runtime performance conclusion.

## Verified acceptance

- Fresh SDK build passed.
- Complete offline correctness gate: **359 suites, 5896 passed, 0 failed, 80 skipped**.
  The configured skips are not claimed as semantic coverage.
- Complete managed Paper functional suite: **68 passed, 0 failed, 0 skipped** on
  Paper 1.21.4 with Java 21 and a loopback-only TestHarness 1.2.1 plugin.
- Exact packed candidate consumer smoke passed: **4 files, 4 artifacts**. This tested
  the local candidate carrying version 4.0.0; it did not republish the registry version.
- Managed runtime cleanup assertions passed. Tests used disposable worlds and left
  the source server template unchanged. No performance campaign or manual CI run.

The live observations include cross-package numeric results, selector/string macro
calls, selected-entity iteration, independent private helpers returning 13, both
module orders returning 1481 through function-value calls, global-state/reload
behavior, actual interpolation capture values, and Fibonacci chunks compared with an
independent BigInt oracle. They are bounded mechanism coverage, not proof of every
possible language/value combination. Deep compound/global storage and capturing
closures are not newly qualified by this candidate.

## Delivery boundary

Keep this candidate separate from `main` and release tags until integration is
explicitly authorized. npm, IDE and documentation publication are separate actions.
The source grammar and CLI entrypoints are retained; visibility corrections and
explicit unsupported-value diagnostics are intentional.
