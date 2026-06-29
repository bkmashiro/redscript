# LIR Local Canonicalization Closeout - Tranche F

Scope: production-safe LIR-only canonicalization for recoverable shape families.
Date: 2026-06-27

## Implemented rewrites

- Implemented local copy-chain collapsing for `copy -> copy` windows in `src/optimizer/lir/rmw.ts` via `copyChainRule`, collapsing consecutive `score_copy` chains when all intermediate destinations are provably dead after the chain end and not protected.
- Added `arithCopySetRule` in `src/optimizer/lir/rmw.ts` for the `score_arith -> score_copy -> score_set` shape. The intermediate copy is removed when `copy.src` is the arithmetic destination and `copy.dst` is a temporary.
- Kept protected-slot and module-visibility rejection in place for both rules, so slots like `$ret`, `$pN`, `$__const_*`, and cross-function referenced temporaries are not rewritten.
- No production pipeline code-path changes were made (`scoreboardRmwPass` is already in the existing LIR pipeline).
- Did not touch `src/optimizer/vir/**`, `src/compiler/**`, parser/typechecker/lsp, or package artifacts.

## Before/after evidence

- Baseline file: `/tmp/redscript-lir-shape-families-controller-verify.json`
- New file: `/tmp/redscript-lir-local-canonicalization-controller.json`

Both files currently report the same top-level summary:

- `totalScoreCopyCount`: `1277`
- `total` provenance summary: `1277`
- `safeAdjacentScoreCopyArithCount`: `0`
- `blockedCount`: `1223`
- `insufficientInfoCount`: `54`
- `unknownCount`: `54`

Shape-family counts by `blocked-by-pattern-not-exact` split:

- `other-pattern-not-exact`: `441`
- `arithmetic-copy-feeds-const-or-add-imm`: `86`
- `const-or-boundary-copy`: `43`
- `copy-feeds-copy-chain`: `7`

Recommendation line from both runs remains:

- `Prioritize local canonicalization for arithmetic-copy-feeds-const-or-add-imm, copy-feeds-copy-chain first, then rerun LIR provenance.`

## Conservative failures/rejections still observed

- no observable reduction in the recoverable families yet at corpus level under `--case all --opt 1`;
- safe/eligible patterns remain in command output as blocked/rejectable family members.
- this indicates that most family hits are still blocked by external mention/safety boundaries outside the immediate local proof that this tranche allows.
- proof-miss evidence now shows total misses for target families remain high (`arithmetic-copy-feeds-const-or-add-imm: 115`, `copy-feeds-copy-chain: 101`) and mostly driven by non-actionable causes in command-text-only proof:
  - `no-exact-lir-local-proof`
  - `insufficient-command-context`
  - `external-or-protected-slot`
- `copy-feeds-copy-chain` is the only target family with an actionable focused-probe entry at this stage; mixed causes keep it out of rewrite-test candidature.

## Production safety notes

- Only LIR pass file changed; no command emission, VIR lowering, or benchmark harness wiring was modified.
- Existing diagnostics and harness structure were preserved.
- New rewrite coverage is guarded by local slot-liveness and protected-slot checks.

## Next safe goals (2-3)

1. Add explicit diagnostics to classify why `arithmetic-copy-feeds-const-or-add-imm` remains blocked when local proof is unavailable.
2. Add a focused proof-aware probe that emits explicit `tmp`-reuse examples for the `copy-feeds-copy-chain` family.
3. Evaluate if two-step local proof can extend `arithCopySetRule` across equivalent `store_cmd_to_score`/macro boundaries safely.
