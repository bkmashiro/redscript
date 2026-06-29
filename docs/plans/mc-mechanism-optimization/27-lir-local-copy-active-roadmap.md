# LIR Local-Copy Manual Opt-In Active Roadmap

> **For Hermes/Spark:** This is the current source of truth for long-running `/goal` sessions in the RedScript LIR local-copy lane. Read this first, then update the checkboxes and evidence after each verified tranche.

**Goal:** Continue the production-safe LIR local-copy optimizer lane after manual CLI opt-in, using benchmark/offline evidence to decide whether to add narrow rewrites, strengthen proof fixtures, or stop.

**Architecture:** Keep production defaults unchanged. Treat `--experimental-lir-local-copy-rewrite` as a manual evidence path while residual diagnostics classify remaining score-copy opportunities. Spark may implement bounded slices; the controller must review diffs, run gates, commit, and update this roadmap.

**Tech Stack:** TypeScript, Jest, RedScript arithmetic probe benchmark, LIR rewrite equivalence fixtures, existing `gate:lir-local-copy` evidence wrapper.

---

## Baseline as of Tranche Y

Latest committed tranche: `a0634b6 feat: summarize residual LIR rewrite opportunities`.

Completed evidence and posture:

- [x] VIR arithmetic spike closed; keep `src/optimizer/vir/**` experimental/read-only.
- [x] LIR local-copy/RMW rewrite path exists but remains off by default.
- [x] CLI manual opt-in exists: `--experimental-lir-local-copy-rewrite` for `compile` and `publish`.
- [x] Incremental compile guard exists: `--incremental` + flag is unsupported and fails explicitly.
- [x] CI-friendly evidence gate exists: `npm run gate:lir-local-copy`.
- [x] Offline rewrite equivalence pack exists and is integrated into the explicit evidence gate.
- [x] Family-readiness and rollout-readiness summaries exist.
- [x] Residual diagnostics exist at `ArithmeticProbeReport.experimentalLocalCopyRewriteResidualSummary`.

Current gate evidence from `/tmp/redscript-lir-phase-y-post-rebase.json`:

```json
{
  "gate": "pass",
  "rollout": "pass",
  "recommendation": "manual-experimental-opt-in-only",
  "commandDelta": -193,
  "scoreCopyDelta": -193,
  "offlineFixtures": 29,
  "offlineFailed": 0,
  "residualRecommendation": "diagnose-residuals-first",
  "totalResidualCount": 1277,
  "residualByStatus": {
    "unknown": 755,
    "safeCandidate": 522
  },
  "topResidualPattern": {
    "status": "safeCandidate",
    "pattern": "score_copy -> score_arith",
    "count": 328
  },
  "topResidualReasons": [
    ["blocked-by-pattern-not-exact-adjacent-score-copy-arith", 577],
    ["blocked-by-cross-function-module-external-mention", 349],
    ["blocked-by-protected-slot", 249]
  ]
}
```

Interpretation:

- The manual opt-in path is stable enough for explicit evidence runs.
- The residual summary still recommends `diagnose-residuals-first`.
- Do **not** enable the rewrite by default.
- Do **not** add broad rewrites until the residual buckets are split into fixture-backed true positives vs blockers/false positives.

---

## Non-negotiable rules for all future tranches

- Keep default compiler behavior unchanged unless a tranche explicitly says otherwise and the controller approves it.
- Keep `--experimental-lir-local-copy-rewrite` manual/experimental until this roadmap says default enablement is ready.
- Do not touch parser, typechecker, LSP, package metadata, GitHub workflows, lockfiles, or public language semantics unless a tranche explicitly scopes it.
- Do not touch `src/optimizer/vir/**` in this lane.
- Do not add dependencies unless a separate ADR approves them.
- Do not treat benchmark no-regression as semantic proof; it is evidence only.
- Update this roadmap after every verified tranche.
- Spark workers must not commit or push; controller commits after review/gates.

Recommended controller gates after any code/test tranche:

```bash
npm run test:probe
npm run test:lir
npm run build
npm run validate-mc
git diff --check
npm run gate:lir-local-copy -- --output /tmp/redscript-lir-<tranche>-controller.json
```

For docs-only roadmap cleanup, `git diff --check` plus diff/readback is enough.

---

## Track Z — Residual safeCandidate fixture/proof split

**Status:** [x] Completed

**Product promise:** Determine whether the top residual `safeCandidate score_copy -> score_arith` bucket is a real missed rewrite opportunity, a proof/window limitation, or a command-text false positive.

**Why now:** Phase Y shows `score_copy -> score_arith` is the largest safe-looking residual pattern (`328`) even after the experimental rewrite path is enabled.

**Allowed files:**

- `benchmarks/arithmetic-probes.ts`
- `src/__tests__/arithmetic-probes.test.ts`
- `src/optimizer/lir/rewrite_equivalence_fixtures.ts` only if freezing tiny offline fixtures is necessary
- `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts` only for fixture runner coverage
- this roadmap and linked docs under `docs/plans/mc-mechanism-optimization/`

**Forbidden:**

- No changes to `src/optimizer/lir/rmw.ts`.
- No pass-order changes.
- No default/CLI behavior changes.
- No production-emitted behavior changes.

**Implementation outline:**

- [x] Read `/tmp/redscript-lir-phase-y-post-rebase.json` if present, and preserve observed baseline.
- [x] Extract deterministic top examples for residual `safeCandidate` + `score_copy -> score_arith`.
- [x] Add a diagnostics-only classifier that labels sampled/top residuals as one of:
  - `rewriteable-now`
  - `needs-window-proof`
  - `blocked-protected-slot`
  - `blocked-cross-function-or-module-external`
  - `command-text-false-positive`
  - `unknown-needs-lir-proof`
- [x] Add tests proving deterministic classification, sorting, caps, and conservative fallback.
- [x] Add real-probe regression coverage that emits `trackZResidualDiagnostics` in the explicit local-copy report.
- [x] Update this roadmap with real counts and the next selected class.

**Evidence captured:**

- Baseline `/tmp/redscript-lir-phase-y-post-rebase.json` (generatedAt `2026-06-29T17:43:50.613Z`) had `experimentalLocalCopyRewriteResidualSummary.totalResidualCount = 1277` and top residual bucket `safeCandidate:score_copy -> score_arith = 328`.
- Track Z controller run `/tmp/redscript-lir-track-z-controller.json` (generatedAt `2026-06-29T18:06:25.518Z`) has `trackZResidualDiagnostics.totalCount = 328` and `byLabel = [{ label: "unknown-needs-lir-proof", count: 328 }]`.
- Top cases sample include `sqrt_fx1000`, `div3_hp`, `double_div`, `double_mul`, `sin_cos_hp_separate`, `sin_hp`, `sqrt_fx10000`, `int_div_mod_mix`.
- Recommendation emitted: `collect-more-data`.

**Definition of Done:**

- [x] A new nested residual field `trackZResidualDiagnostics` identifies true rewrite candidates vs blockers/false positives for top residual safeCandidate examples.
- [x] Real all-case output reports deterministic counts by class, capped examples, top case names, and recommendation.
- [x] No production rewrite behavior changes.
- [x] Full controller gates pass.

**Expected next decision after Track Z:**

- `rewriteable-now` did not dominate in this run.
- `unknown-needs-lir-proof` dominates with 328/328, so next chosen step is Track AB for broader proof/window diagnostics before any rewrite implementation.
- If a later evidence run materially shifts to `needs-window-proof`, continue with Track AB semantics.
- If blockers/false positives dominate on subsequent runs, stop and return to analyzer/docs updates.

---

## Track AA — Narrow residual rewrite implementation, only if Track Z proves it

**Status:** [ ] Blocked by Track AB proof/window diagnostics

**Product promise:** Add exactly one tiny LIR rewrite for a fixture-proven residual class, still behind `--experimental-lir-local-copy-rewrite`.

**Allowed files:**

- `src/optimizer/lir/rmw.ts`
- `src/__tests__/optimizer/lir/rmw.test.ts`
- `src/__tests__/optimizer/lir/pipeline.test.ts` if pass integration needs coverage
- `src/optimizer/lir/rewrite_equivalence_fixtures.ts`
- `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts`
- `benchmarks/arithmetic-probes.ts` and probe tests only for evidence fields if needed
- this roadmap

**Forbidden:**

- No default enablement.
- No CLI behavior changes.
- No broad canonicalization pass unless Track Z explicitly proves it is needed and safe.
- No cross-function rewrite.
- No protected `$ret`/`$pN`/external module mention rewrite.

**Implementation outline:**

- [ ] Write RED tests for the exact proven fixture class.
- [ ] Implement the smallest pattern in the existing experimental RMW/local-copy path.
- [ ] Add negative tests for protected slot, boundary, external mention, non-adjacent, and non-commutative alias cases as relevant.
- [ ] Run the explicit comparison gate and record command/scoreCopy deltas.
- [ ] Update this roadmap with before/after residual counts.

**Definition of Done:**

- [ ] Targeted LIR optimizer tests pass.
- [ ] Offline equivalence fixtures pass.
- [ ] `gate:lir-local-copy` still passes with no regressions.
- [ ] Manual experimental flag remains required.

---

## Track AB — Window/proof diagnostics when candidates need broader local proof

**Status:** [ ] Not started — next recommended track

**Product promise:** If top residuals are not adjacent enough for the existing rewrite, strengthen the local proof/window diagnostics before adding behavior.

**Allowed files:**

- `benchmarks/arithmetic-probes.ts`
- `src/__tests__/arithmetic-probes.test.ts`
- LIR equivalence fixtures/tests if the proof shape is freeze-worthy
- this roadmap

**Forbidden:**

- No production rewrite behavior changes.
- No pass-order changes.

**Implementation outline:**

- [ ] Add structured previous/current/next/next-next slot-use facts for the dominant `needs-window-proof` cases.
- [ ] Classify whether copied source is dead, reused, protected, externally mentioned, or hidden by a command boundary.
- [ ] Add synthetic and real-probe tests.
- [ ] Update Track Z/AA decision with real counts.

**Definition of Done:**

- [ ] Dominant previously-unknown residuals move into named proof/blocker buckets.
- [ ] The next rewrite, if any, has a specific fixture-proven precondition.

---

## Track AC — Manual opt-in hardening and release docs

**Status:** [ ] Optional after Z/AA/AB stabilizes

**Product promise:** Make manual experimental usage understandable without implying production/default readiness.

**Allowed files:**

- CLI/user docs if present
- `README.md` or docs under `docs/` only if they already document CLI options
- this roadmap

**Forbidden:**

- No behavior changes.
- No npm package/version changes unless explicitly requested.

**Implementation outline:**

- [ ] Document the flag as experimental/manual/off-by-default.
- [ ] Document incremental incompatibility.
- [ ] Include the exact evidence gate command for maintainers.
- [ ] State that gate pass is not semantic proof/default readiness.

**Definition of Done:**

- [ ] Docs are accurate and do not oversell safety.
- [ ] `git diff --check` passes.

---

## Track AD — Default enablement decision gate

**Status:** [ ] Not ready

This track should remain unchecked until all are true:

- [ ] Residual `unknown` is materially reduced or explained by stable blocker buckets.
- [ ] Required offline equivalence families cover every rewrite family that would be enabled.
- [ ] No-regression gate passes over the agreed benchmark corpus.
- [ ] At least one real corpus benefit remains after any new rewrite and no per-case command/scoreCopy regression exists.
- [ ] Negative tests cover protected slots, external mentions, boundaries, non-adjacent windows, and non-commutative aliases.
- [ ] A short ADR says why default enablement is safe and what rollback looks like.

Until then, keep recommendation at `manual-experimental-opt-in-only` or `stay-experimental`.

---

## Long-running Hermes goal template

Use this when starting a long run whose job is to read and follow this roadmap:

```text
In /Users/yuzhe/projects/redscript, continue the LIR local-copy optimizer lane by reading and following docs/plans/mc-mechanism-optimization/27-lir-local-copy-active-roadmap.md as the source of truth.

Rules:
- Use Spark/Codex as bounded implementation worker where useful.
- Controller must inspect the diff, run real gates, update the roadmap checkboxes/evidence, then sign/commit/push if verified.
- Keep default compiler behavior unchanged unless the active roadmap explicitly says otherwise.
- Keep VIR experimental/read-only; do not touch src/optimizer/vir/**.
- Do not change parser, typechecker, LSP, package metadata, GitHub workflows, lockfiles, or public language semantics unless the active roadmap explicitly scopes it.
- Do not enable --experimental-lir-local-copy-rewrite by default.
- Treat benchmark gates as evidence, not semantic proof.

Start with the first unchecked non-blocked track in the roadmap. At the time this goal was written, that is Track Z: residual safeCandidate fixture/proof split.

Expected workflow:
1. Check git status and recent log.
2. Read the roadmap and the referenced docs/evidence.
3. Dispatch Spark only with an explicit allowed-files/forbidden-scope prompt.
4. Review Spark's diff; repair small tail issues if needed.
5. Run the controller gates:
   - npm run test:probe
   - npm run test:lir
   - npm run build
   - npm run validate-mc
   - git diff --check
   - npm run gate:lir-local-copy -- --output /tmp/redscript-lir-<track>-controller.json
6. Update docs/plans/mc-mechanism-optimization/27-lir-local-copy-active-roadmap.md with completed checkboxes and real evidence.
7. Commit signed and push only after verification.

Return:
1. Selected track and why.
2. Changed files.
3. Exact test/gate results.
4. Representative JSON/evidence from the gate output.
5. Roadmap updates made.
6. Next recommended track or blocker.
```

---

## Running notes

Append a short note here after each completed tranche.

### 2026-06-29 — Roadmap reset after Phase Y

- Created this active roadmap to replace ad-hoc continuation from the older Tranche X/Y appendix.
- Next unchecked non-blocked track: Track Z.

### 2026-06-29 — Track Z completed

- Added `trackZResidualDiagnostics` for the residual `safeCandidate score_copy -> score_arith` bucket.
- Controller gate `/tmp/redscript-lir-track-z-controller.json` reports all 328 target residuals as `unknown-needs-lir-proof`; no `rewriteable-now` class is proven by existing facts.
- Next unchecked non-blocked track: Track AB.
