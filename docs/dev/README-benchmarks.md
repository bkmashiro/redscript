# Benchmark Suite

RedScript ships benchmark entrypoints under `benchmarks/`.

## What They Measure

`benchmarks/compiler-perf.ts`

- Generates synthetic RedScript programs at roughly 10, 100, and 1000 lines.
- Measures end-to-end compiler stage time for:
  - `parse`: preprocess, lex, parse, import merge, typecheck
  - `HIR`: AST to HIR lowering and monomorphization
  - `MIR`: MIR lowering, optimization, coroutine transform, and LIR lowering/optimization
  - `emit`: datapack file emission
- Emits a JSON report to stdout.

`benchmarks/stdlib-complexity.ts`

- Compiles every file in `src/stdlib/`.
- Reports emitted instruction count, file count, and artifact size.
- Compares three optimization presets:
  - `O0`: no MIR/LIR optimization passes
  - `O1`: current default optimization pipeline
  - `O2`: `O1` plus a second MIR/LIR optimization round after coroutine lowering

`benchmarks/arithmetic-probes.ts`

- Compiles focused arithmetic/helper probe snippets.
- Optionally includes stdlib modules such as `math` or `math_hp`.
- Reports emitted `.mcfunction` file count, instruction count, bytes, and command
  categories (`scoreboard`, `scoreCopy`, `execute`, `data`, `function`, `storage`, selector,
  macro, summon, teleport).
- Adds `scoreCopyPatterns` at both per-case and report level. This groups remaining
  scoreboard copy commands by adjacent command shape, for example
  `score_arith -> score_copy -> score_arith`, and includes a few concrete file/line
  examples so the next LIR optimizer slice can be chosen from measured output rather
  than guessed.
- Compares `O0`/`O1`/`O2` when invoked with `--opt all`.
- Adds a static `estimatedCost` section with:
  - fork risk (`execute as @e/@a`, broad selectors, and `run function` under `execute as`),
  - selector mentions and broad-selector risk,
  - NBT scalar reads vs whole-list/compound copies,
  - macro command pressure (including `with storage` calls),
  - and entity/display setup hints.
- Intended as the first compile-time cost lens before live Paper mechanism probes.

## How To Run

Run the default compiler benchmark:

```bash
npm run bench
```

Write the compiler benchmark report to a file:

```bash
npx ts-node benchmarks/compiler-perf.ts --iterations 5 --output benchmarks/compiler-perf.report.json
```

Run the stdlib complexity benchmark:

```bash
npx ts-node benchmarks/stdlib-complexity.ts --output benchmarks/stdlib-complexity.report.json
```

List arithmetic probe cases:

```bash
npm run bench:arithmetic -- --list
```

Run one arithmetic probe at the default optimization level:

```bash
npm run bench:arithmetic -- --case double_div --output benchmarks/double-div.probe.json
```

Run all arithmetic probes across all optimization presets:

```bash
npm run bench:arithmetic -- --case all --opt all --output benchmarks/arithmetic-probes.report.json
```

## Baseline

`benchmarks/baseline.json` stores one recorded run of the compiler and stdlib benchmarks on the local machine. Treat it as a local baseline, not a cross-machine performance target.
