# RedScript Coverage Report

Generated on 2026-03-21 from:

```sh
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
npx jest --testPathPattern="^(?!.*mc-integration)" --forceExit --coverage --coverageReporters=json-summary
```

## Current Coverage

### Total

- Statements: 88.5% (2436/2754)
- Branches: 80.2% (1108/1381)
- Functions: 94.7% (306/323)
- Lines: 89.8% (2205/2455)

### Test Run Status

Coverage artifacts were produced, but the run did **not** finish cleanly.

- `src/__tests__/lsp/completion.test.ts`: `wordAt` expectation mismatch (`Expected ""`, `Received "fn"`).
- `src/__tests__/repl-server.test.ts`: sandbox prevents binding `0.0.0.0:3000` (`listen EPERM`), causing hook timeouts.
- `src/__tests__/repl-server-extra.test.ts`: same `listen EPERM` issue.
- `src/__tests__/compile-all.test.ts`: new examples under `examples/rpg/` fail compilation due to string concatenation with `+`.

Result: treat the coverage numbers below as the current repository snapshot, not a fully green baseline.

## Lowest Branch Coverage Files

Files with more than 5 branches, sorted by branch coverage:

| File | Branches | Covered | Pct |
| --- | ---: | ---: | ---: |
| `src/events/types.ts` | 14 | 1 | 7.1% |
| `src/types/mc-version.ts` | 11 | 2 | 18.2% |
| `src/lir/lower.ts` | 66 | 39 | 59.1% |
| `src/optimizer/interprocedural.ts` | 55 | 37 | 67.3% |
| `src/optimizer/unroll.ts` | 118 | 83 | 70.3% |
| `src/optimizer/copy_prop.ts` | 49 | 36 | 73.5% |
| `src/tuner/engine.ts` | 36 | 27 | 75.0% |
| `src/optimizer/coroutine.ts` | 190 | 148 | 77.9% |
| `src/mc-validator/index.ts` | 122 | 96 | 78.7% |
| `src/optimizer/lir/dead_slot.ts` | 37 | 30 | 81.1% |
| `src/mir/verify.ts` | 64 | 52 | 81.2% |
| `src/lexer/index.ts` | 185 | 156 | 84.3% |

## Highest-Value Uncovered Branches

Priority is based on a mix of branch count, centrality in the compile pipeline, and risk of silent miscompilation.

### P1: `src/lir/lower.ts`

Why it matters:

- Core MIR -> LIR lowering stage.
- Misses 27 of 66 branches.
- Bugs here can silently generate wrong commands across many features.

Most likely missing branch families from source review:

- Dynamic NBT read/write helper paths and helper reuse.
- Multi-predecessor block extraction and on-demand block function generation.
- `cmp` lowering differences, especially `ne` vs non-`ne`.
- `score_write` const vs temp source paths.
- Early-return guard paths like missing block / already-visited block.

Best next tests:

- MIR fixtures with dynamic array read/write on multiple arrays to exercise helper cache hit and miss.
- CFG with shared join blocks to force `multiPredBlocks` handling.
- Comparison cases covering `eq`, `ne`, `<`, `<=`, `>`, `>=`.
- `score_write` using both immediate constants and temp operands.

### P1: `src/optimizer/coroutine.ts`

Why it matters:

- Large surface area: 42 missed branches.
- Complex state-machine transform where regressions are hard to detect by inspection.

Most likely missing branch families:

- Back-edge absent path vs real loop path.
- Macro/raw interpolation skip logic in `fnContainsMacroCalls`.
- Dominator / predecessor corner cases with unusual CFGs.
- Continuation partitioning and dispatcher generation for irregular loop shapes.

Best next tests:

- Coroutine candidates containing raw builtins and interpolated `__raw:` calls that should be skipped.
- Functions with multiple back edges / nested loops / disconnected predecessor shapes.
- Cases where a coroutine annotation targets a function that cannot be transformed cleanly but should degrade safely.

### P1: `src/mc-validator/index.ts`

Why it matters:

- User-facing validation layer.
- Misses 26 of 122 branches.
- Good ROI because each new test is cheap and branch-heavy.

Most likely missing branch families:

- `execute ... run ...` malformed placements.
- `scoreboard players` action-specific arity failures.
- Unsupported `data` target/mode combinations.
- `return run` vs integer return validation.
- Brigadier tree fallback / redirect traversal edge cases.

Best next tests:

- Table-driven invalid command cases for each specialized validator.
- Redirect-heavy commands and partial-token failures to stress `walk()`.

### P2: `src/optimizer/interprocedural.ts`

Why it matters:

- Misses 18 of 55 branches.
- This pass changes call graph shape; mistakes can create wrong specialization or missed optimization.

Most likely missing branch families:

- Skip specialization when callee missing, macro, direct recursion, self-recursive, arity mismatch, or multi-block.
- Rewrite pass when specialized target exists vs does not exist.
- Negative constant mangling and mixed constant signatures.

Best next tests:

- A matrix of `call` sites that individually trigger each skip condition.
- A module where one pass creates a specialization and a later pass rewrites downstream call sites to it.

### P2: `src/optimizer/unroll.ts`

Why it matters:

- Misses 35 of 118 branches.
- Optimization pass, so lower product risk than lowering/validation, but still meaningful.

Most likely missing branch families:

- Rejection paths in loop recognition.
- Pre-header detection failures.
- Latch increment pattern variants.
- Non-zero / negative / over-limit bounds.
- Substitution coverage for `call_macro`, `return null`, `branch`, and dynamic NBT write cases.

Best next tests:

- Synthetic MIR loops that fail one recognition predicate at a time.
- Bodies containing `call_macro`, null returns, and dynamic writes so substitution paths execute.

## Lower-Priority Low-Percent Files

These percentages look bad, but they are smaller and lower leverage than the pipeline/core modules above.

- `src/events/types.ts` (7.1%): likely missing negative parsing and `toTypeNode()` variants. Easy to improve, low risk.
- `src/types/mc-version.ts` (18.2%): mostly invalid-format parsing branches. Easy win, but limited impact.
- `src/tuner/engine.ts` (75.0%): moderate branch gaps, but isolated from compiler correctness.
- `src/optimizer/copy_prop.ts` (73.5%): worth improving after lowering / validator / specialization work.

## Recommended Order

1. `src/lir/lower.ts`
2. `src/mc-validator/index.ts`
3. `src/optimizer/coroutine.ts`
4. `src/optimizer/interprocedural.ts`
5. `src/optimizer/unroll.ts`
6. `src/optimizer/copy_prop.ts`
7. Small cleanup wins: `src/events/types.ts`, `src/types/mc-version.ts`

## Notes

- The worktree is not clean. Existing changes were present in `src/ast/types.ts`, `src/lexer/index.ts`, `src/parser/index.ts`, and `examples/rpg/`.
- The failing `compile-all` cases are very likely tied to the new `examples/rpg/` files currently in the worktree.
