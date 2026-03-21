# Compiler Performance Benchmark

Generated: 2026-03-21T22:24:38.379Z

Host: Apple M4 | 10 cores | 16384 MB RAM | darwin 24.6.0 (arm64)

Iterations per case: 5

| Target Lines | Actual Lines | Helpers | Calls | Parse (avg ms) | HIR (avg ms) | MIR (avg ms) | Emit (avg ms) | Total (avg ms) | Parse (median ms) | HIR (median ms) | MIR (median ms) | Emit (median ms) | Total (median ms) | .mcfunction Files | .mcfunction Lines |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 10 | 1 | 0 | 0.495 | 0.094 | 0.730 | 0.052 | 1.388 | 0.109 | 0.022 | 0.161 | 0.015 | 0.313 | 3 | 15 |
| 100 | 100 | 12 | 35 | 0.487 | 0.050 | 1.179 | 0.052 | 1.773 | 0.400 | 0.039 | 0.883 | 0.051 | 1.423 | 15 | 307 |
| 500 | 500 | 62 | 185 | 1.149 | 0.069 | 4.362 | 0.123 | 5.709 | 1.091 | 0.045 | 4.171 | 0.114 | 5.619 | 65 | 1557 |
