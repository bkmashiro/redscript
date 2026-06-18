# RedScript Timer v2 Intrinsic Hardening Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Prefer Spark for edit/debug/review slices; the controller must re-read diffs, run gates, and commit/push.

**Goal:** Turn Timer from an ad-hoc compiler hole into a small, explicit compiler intrinsic with stable naming, fail-fast semantics, and Paper-backed behavior tests.

**Architecture:** Keep the public `Timer` API in `src/stdlib/timer.mcrs`, but treat the implementation as compiler-owned. Centralize timer resource naming and slot access in MIR lowering first; then add diagnostics for unsupported Timer shapes; finally clarify docs and dynamic scheduling behavior. Avoid a big-bang rewrite of the compiler pipeline.

**Tech Stack:** TypeScript, RedScript `.mcrs`, Jest/ts-jest, Paper TestHarnessPlugin via `src/__tests__/mc-integration/stdlib-coverage-8.test.ts` and `npm run test:mc-core`.

---

## Current facts

- `Timer::new(duration)` is intercepted in `src/mir/lower.ts` and statically allocates `__timer_N` IDs.
- `Timer` instance methods are intercepted by `lowerTimerMethod(...)` and lowered into scoreboard commands.
- `src/stdlib/timer.mcrs` is an API/stub surface; its method bodies are not the real implementation when the compiler can statically track `_id`.
- Current live behavior is green after `faa66f2 fix: stabilize inline timer ticks`, but the implementation is still scattered and easy to regress.
- Queue coverage is currently green and should remain a later stdlib cleanup item, not part of this Timer v2 tranche.

## Non-goals

- Do not rewrite the full compiler pipeline.
- Do not redesign queue in this tranche.
- Do not introduce random AST/fuzz generation.
- Do not make Timer dynamically allocated at runtime yet.
- Do not require Paper for every local unit test; keep live Paper as the final oracle gate.

---

## Phase 1 — Centralize Timer resource naming and slot commands

**Objective:** Remove duplicated string construction for Timer objective/slot names without changing public behavior.

**Files:**
- Modify: `src/mir/lower.ts`
- Test: `src/__tests__/mir/lower-extra4.test.ts`

**Implementation steps:**

1. Add a small helper near `lowerTimerMethod(...)`, for example:
   - `timerObjective(namespace: string): string` → `__${namespace}`
   - `timerSlot(timerId: number, field: 'ticks' | 'active' | 'duration'): string` → `__timer_${timerId}_${field}`
   - optionally `emitTimerScoreWrite(...)` / `emitTimerScoreRead(...)` if this keeps the code smaller.
2. Use the helper from both:
   - `Timer::new` static-call lowering
   - `lowerTimerMethod(...)`
3. Keep emitted command shapes behavior-compatible with the current green state.
4. Strengthen existing MIR timer tests to assert:
   - all timer slots use `__<namespace>` objective, not the bare namespace;
   - `Timer::tick()` emits a guarded scoreboard add without `return run function`;
   - `Timer::new()` writes `ticks`, `active`, and `duration` slots.

**Verification:**

```bash
npm test -- src/__tests__/mir/lower-extra4.test.ts --runInBand -t 'Timer'
npm test -- src/__tests__/mc-integration/stdlib-coverage-8.test.ts --runInBand --testTimeout=120000
npm run build
npm run validate-mc
MC_OFFLINE=true npm run test:mc-core
git diff --check
```

**Commit:**

```bash
git add src/mir/lower.ts src/__tests__/mir/lower-extra4.test.ts
git commit -S -m "refactor: centralize timer intrinsic slots"
```

---

## Phase 2 — Fail fast when Timer ID cannot be statically tracked

**Objective:** Prevent Timer calls from silently falling back to stdlib method bodies when `_id` is not known at compile time.

**Files:**
- Modify: `src/mir/lower.ts`
- Test: add or update `src/__tests__/compiler/timer-intrinsic.test.ts` or `src/__tests__/mir/lower-extra4.test.ts`

**Implementation steps:**

1. Find both Timer instance-call paths:
   - parser-desugared `call('method', [timer, ...])`
   - invoke/field-call form if present.
2. If `sv.typeName === 'Timer'` but `ctx.constTemps` does not contain a static `_id`, throw a diagnostic/compile error with a message like:
   - `Timer method '<method>' requires a statically allocated Timer; avoid copying Timer through unsupported dynamic paths.`
3. Add tests for supported path:
   - `let t: Timer = Timer::new(3); t.start();` still compiles.
4. Add at least one unsupported path test if the language can express it today. If no unsupported path is easy to construct, add a narrowly-scoped unit test around the lowering path or document why current type/lowering shape makes the fallback unreachable.
5. Ensure no normal stdlib coverage regresses.

**Verification:**

```bash
npm test -- src/__tests__/mir/lower-extra4.test.ts --runInBand -t 'Timer'
npm test -- src/__tests__/compiler/timer-intrinsic.test.ts --runInBand  # if created
npm test -- src/__tests__/mc-integration/stdlib-coverage-8.test.ts --runInBand --testTimeout=120000
npm run build
git diff --check
```

**Commit:**

```bash
git add src/mir/lower.ts src/__tests__/mir/lower-extra4.test.ts src/__tests__/compiler/timer-intrinsic.test.ts
git commit -S -m "fix: reject unsupported dynamic timer calls"
```

---

## Phase 3 — Clarify Timer stdlib/documentation as compiler intrinsic

**Objective:** Remove the misleading impression that `timer.mcrs` method bodies are the runtime implementation.

**Files:**
- Modify: `src/stdlib/timer.mcrs`
- Modify if generated docs are source-controlled in this repo: timer docs source only; do not commit generated `redscript-docs/`.
- Test: `src/__tests__/stdlib/interactions.test.ts` or existing docs/parser tests if any.

**Implementation steps:**

1. Update top-of-file comments in `src/stdlib/timer.mcrs`:
   - Timer API is compiler intrinsic-backed.
   - Method bodies are fallback/stub documentation, not the primary generated implementation.
   - `Timer::new()` must remain statically visible to the compiler.
2. Keep signatures unchanged.
3. Do not remove method bodies unless tests prove the compiler/parser accepts intrinsic-only declarations.
4. If docs generation is checked against a separate repo, do not commit generated docs unless explicitly requested.

**Verification:**

```bash
npm test -- src/__tests__/mc-integration/stdlib-coverage-8.test.ts --runInBand --testTimeout=120000
npm run build
npm run docs:gen  # only if useful; do not commit generated external docs by default
git diff --check
```

**Commit:**

```bash
git add src/stdlib/timer.mcrs
git commit -S -m "docs: mark timer as compiler intrinsic"
```

---

## Phase 4 — Decide and lock dynamic scheduling semantics

**Objective:** Make `setTimeout(n, ...)` / `setInterval(n, ...)` behavior explicit instead of best-effort fallback.

**Files:**
- Modify: `src/mir/lower.ts`
- Modify: `src/typechecker/index.ts` if choosing to reject dynamic ticks earlier
- Test: `src/__tests__/mir/lower-extra4.test.ts`
- Test: `src/__tests__/schedule.test.ts`

**Decision:** Choose one before editing:

### Option A — Reject dynamic ticks now

Best if schedule command requires literal tick durations for reliable datapack output.

Steps:
1. Add typechecker/lowering diagnostic for non-literal first arg to `setTimeout` and `setInterval`.
2. Update tests to assert a clear error.
3. Keep literal paths unchanged.

### Option B — Implement real dynamic tick support

Only do this if there is a proven Minecraft command shape that supports the required runtime value. If not, do not fake it.

Steps:
1. Produce the exact generated commands and validate them through `validate-mc`.
2. Add Paper test if possible.

**Verification:**

```bash
npm test -- src/__tests__/mir/lower-extra4.test.ts src/__tests__/schedule.test.ts --runInBand
npm run validate-mc
npm run build
git diff --check
```

**Commit:**

```bash
git add src/mir/lower.ts src/typechecker/index.ts src/__tests__/mir/lower-extra4.test.ts src/__tests__/schedule.test.ts
git commit -S -m "fix: define dynamic timer schedule semantics"
```

---

## Phase 5 — Final live oracle and roadmap update

**Objective:** Prove Timer v2 did not regress real MC behavior and mark the roadmap state.

**Files:**
- Modify: `docs/plans/compiler-mc-hardening-roadmap.md`
- Modify: this plan if phase status needs updating

**Verification:**

```bash
npm test -- src/__tests__/mir/lower-extra4.test.ts --runInBand -t 'Timer'
npm test -- src/__tests__/mc-integration/stdlib-coverage-8.test.ts --runInBand --testTimeout=120000
MC_SERVER_DIR=$HOME/mc-test-server npm run test:mc-core
npm run build
npm run validate-mc
git diff --check
```

**Commit:**

```bash
git add docs/plans/compiler-mc-hardening-roadmap.md docs/plans/timer-v2-intrinsic-plan.md
git commit -S -m "docs: track timer intrinsic hardening"
```

---

## Spark execution shape

Use one Spark edit-capable implementer per phase, not one giant agent:

1. Controller dispatches Spark with exactly one phase and allowed files.
2. Spark writes code/tests and runs targeted commands from that phase.
3. Controller re-reads all edited files and `git diff`.
4. Controller runs phase gates again, plus adjacent static/live gates when relevant.
5. Controller commits/pushes.
6. Optional: dispatch a read-only Spark reviewer for Phase 2 or Phase 4 because those change semantics.

Do not let Spark touch unrelated queue/stdout/docs generated files in Timer phases.
