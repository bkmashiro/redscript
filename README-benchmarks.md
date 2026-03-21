# Benchmark Suite

RedScript now ships two benchmark entrypoints under `benchmarks/`.

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

## Baseline

`benchmarks/baseline.json` stores one recorded run of both benchmarks on the local machine. Treat it as a local baseline, not a cross-machine performance target.
