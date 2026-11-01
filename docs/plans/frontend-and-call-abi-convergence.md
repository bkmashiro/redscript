# Frontend and call ABI convergence

Status: implemented and validated for the DX-hardening candidate. No merge or
publication is implied. See [acceptance and limits](product-dx-hardening.md).

## Ownership

- `compiler/source-imports.ts` owns filesystem lookup and compiler-owned stdlib
  selection. Discovery adapters do not decide call visibility.
- `compiler/source-graph.ts` represents file-backed and virtual source units,
  including explicit anonymous libraries. Binding does not require a fabricated
  project manifest or filesystem path.
- `resolver/package-symbols.ts` owns lexical/import visibility and canonical
  function/reference identity. `resolver/bound-program.ts` projects those decisions
  into cloned ASTs for typechecking and backend layout.
- `compiler/call-abi.ts` supplies physical callee paths, objectives, parameter/return
  types and macro conventions for both sides of module calls.
- `compiler/source-program.ts` adapts bound source units to the standalone datapack
  layout. It does not reinterpret import aliases. Runtime ABI collisions fail with
  a diagnostic rather than guessing.
- HIR normalizers implement addressed global state and typed, build-local function
  values before call ABI construction. MIR treats bound declarations separately
  from intrinsic dispatch.
- LSP discovery and incremental dependency tracking share source discovery. Cache
  imports use the actual grammar, including named imports and imports after
  declarations, so dependency edits invalidate cached outputs.

## Preserved contracts

Public source entrypoint paths and CLI entrypoints remain. Private/imported physical
names may be qualified to prevent collisions. Source identity, presentation path,
resource path and scoreboard objective are distinct. Export flags establish module
visibility; they do not automatically make imported functions datapack entry roots.

An unresolved language call is an error. Explicit declarations and raw commands
retain their external contracts. Generated scheduling wrappers are admitted only
when the corresponding scheduled function exists. No broad generated-name allowlist
was introduced.

## Value boundaries

Ordinary global int/bool struct state, struct-expression arguments, scalar module
calls, selector/string macro calls and capture-free function values have concrete
regressions and Paper observations. Function handles are local to a compiled build,
and module input order does not change their meaning.

Capturing lambdas require an environment ABI and are explicitly rejected. Static
scheduling callbacks and intrinsic Timer handles keep their existing restrictions.
The candidate does not claim complete deeply nested/global non-scalar value support
or a new ABI for interoperating function handles between independently built packs.

## Verification and follow-up

The complete offline gate, full bounded Paper suite and exact packed consumer pass.
Run unit correctness offline and serialize it against owned Paper runs: unrelated
unit suites can otherwise auto-detect the temporary server and contaminate results.

Further capability work should extend the shared typed layout and its caller/callee
regressions. Do not restore independent import interpreters, signature injection,
opaque temporary-name references or permissive unresolved-call fallbacks.
