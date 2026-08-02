# MCRS Runtime Test Suite Redesign Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. The controller owns architecture, diff review, real Paper gates, evidence acceptance, signed commits, push, and CI readback.

**Goal:** Build a deterministic, fail-closed RedScript runtime test system that can prove which supported `.mcrs` language features, stdlib modules, and source functions actually executed in Minecraft at least once, while keeping Paper 1.21.4 and 26.2 evidence separate.

**Architecture:** Keep P9 as a narrow lifecycle oracle rather than stretching it into a monolithic feature suite. Add a separate managed corpus oracle with isolated generated datapacks, explicit prerequisites, semantic readbacks, and test-only source-function probes. Produce two independent receipts from the same source corpus: an uninstrumented semantic run and an instrumented reachability run; only their intersection counts as runtime-covered.

**Tech Stack:** TypeScript, Jest/ts-jest, RedScript AST→HIR→MIR→LIR→Minecraft backend, generated datapacks, Paper 1.21.4 and Paper 26.2, RedScript TestHarness HTTP API, optional mineflayer TestBot, JSON evidence artifacts, GitHub Actions.

---

## 1. Current baseline and problem statement

### Verified baseline

A disposable Paper 1.21.4 run of the current `mc-integration` project produced:

```text
Test Suites: 2 failed, 3 skipped, 10 passed, 12 of 15 total
Tests:       66 failed, 16 skipped, 401 passed, 483 total
Time:        353.161 s
```

The server was stopped with exit code `0` and the disposable root was deleted. This run is diagnostic evidence only; it is not canonical runtime proof.

### What is wrong with the current suite

1. **P9 scope is too narrow.** It proves load/reload/restart/world-reopen behavior for one generated fixture, not the complete `.mcrs` feature surface.
2. **Offline false-green behavior exists.** Many live tests use `if (!serverOnline) return`; player-dependent tests also use `if (!botOnline) return`. Jest reports those tests as passed even though no game behavior ran.
3. **A shared mutable datapack directory couples suites.** Tests repeatedly write into `world/datapacks/redscript-test`, merge or clear load/tick tags, retain unrelated generated functions, and depend on suite order.
4. **Deploy success is not checked as a first-class phase.** A later scoreboard value of `0` may mean compiler semantics are wrong, the pack/function failed to load, the entrypoint did not exist, a tag was overwritten, or a command failed. Current assertions conflate these causes.
5. **A Jest test name is not runtime coverage.** Source inclusion, compilation, and a passing `test()` callback do not prove a specific `.mcrs fn` executed in Paper.
6. **Server-only and player-required paths are mixed.** Bot-dependent cases can silently return while the containing suite is reported green.
7. **Existing coverage documents are stale and use weaker proof levels.** `docs/plans/redscript-coverage-matrix.json` still treats many modules as static/offline-skippable and does not bind claims to exact runtime receipts.
8. **The baseline failures are not yet localized.** Sixty-six failing assertions cluster in two suites, but many `0` results may share a deployment/isolation cause. Do not patch compiler semantics until pack-load and entrypoint execution are proven.

### Read-only source/fixture inventory

A separate read-only audit established the current static lower bound:

- 51 stdlib modules;
- 663 public-convention functions;
- 401 exported constants (`mobs`: 87, `tags`: 313, `interactions`: 1);
- public `Result` enum and `Timer` struct;
- 314/663 functions directly referenced by existing MC integration fixture source;
- 349/663 functions not directly referenced;
- 11 modules with all functions directly referenced, 31 partially referenced, and 6 with zero direct function references: `advanced`, `expr`, `linalg`, `result`, `sets`, and `state`;
- 0/401 exported constant identifiers directly referenced—the current mobs/tags fixtures use equivalent hardcoded strings instead.

These are source-reference counts only, not Paper execution counts. The strongest existing live evidence remains the checked-in P9 lifecycle reports and the 26/26 core Paper oracle subset. Existing ordinary MC integration fixtures remain `mc-integration-offline-skippable` until rerun through the new strict managed corpus runner.

The catalog must treat exported constants and public data types separately from functions: constants require direct compiler-resolution/value assertions, while functions require semantic cases plus runtime reachability probes. Do not inflate function execution coverage with hardcoded equivalent strings or type declarations.

## 2. Coverage contract

### 2.1 Coverage levels

Report these separately; never collapse them into one percentage:

| Level | Meaning | Required proof |
|---|---|---|
| `L0 lifecycle` | Generated datapack survives the required lifecycle | Existing P9 strict report |
| `L1 language-feature semantic` | A runtime-relevant language feature produces the expected game state | Uninstrumented generated artifact + server-side readback |
| `L2 stdlib-module semantic` | Every stdlib module has at least one representative public behavior | Uninstrumented generated artifact + exact observable |
| `L3 source-function reachability` | Every supported non-internal `.mcrs fn` executes in Paper at least once | Instrumented artifact + coverage-marker dump |
| `L4 player/visual boundary` | Player-only behavior ran with TestBot; visual/audio commands were accepted by Paper | Bot receipt or command/state receipt; human visual acceptance remains separate |

The user’s requested end state is:

- 100% of runtime-relevant language features classified and semantically exercised;
- 51/51 stdlib modules with at least one semantic oracle;
- every supported non-internal source function either `executed`, `composed-and-executed`, or explicitly excluded with a machine-checked non-runtime/internal reason;
- zero silent skips in strict runs.

### 2.2 Full-corpus versus cross-version scope

- **Paper 1.21.4 stable:** authoritative full semantic + reachability corpus.
- **Paper 26.2 current:** full version-sensitive/lifecycle/resource/command surface plus a deterministic representative semantic corpus initially; promote to full corpus after compatibility gaps close.
- Never relabel a stable-only function receipt as 26.2 proof.

### 2.3 What does not require a game case

The manifest must explicitly classify these as `compile-only` or `tooling-only`:

- parser diagnostics and malformed source rejection;
- formatter/LSP/completion behavior;
- compile-time-only decorators such as deprecation diagnostics;
- optimizer equivalence checks that have no runtime-distinguishable contract;
- resource schema validation that cannot execute as a function.

Every exclusion needs a stable reason enum, not free-form prose.

## 3. Canonical artifacts

Create these as the new source of truth:

```text
tests/mc-cases/runtime-coverage-catalog.ts
tests/mc-cases/runtime-corpus-cases.ts
src/mc-test/runtime-coverage-schema.ts
src/mc-test/runtime-corpus-runner.ts
src/mc-test/runtime-probe-map.ts
src/__tests__/mc-runtime-coverage-catalog.test.ts
src/__tests__/mc-runtime-corpus-runner.test.ts
docs/evidence/mc-runtime-corpus-1.21.4.json
docs/evidence/mc-runtime-corpus-26.2.json
```

Each runtime case must declare:

```ts
interface RuntimeCorpusCase {
  id: string
  sourcePath: string
  entrypoint: string
  covers: string[]
  prerequisites: Array<'paper' | 'testharness' | 'testbot'>
  lifecycle: 'load' | 'reload' | 'same-world-restart' | 'world-reopen'
  isolation: 'case-pack' | 'suite-pack'
  setup: RuntimeAction[]
  observables: RuntimeObservable[]
  cleanup: RuntimeAction[]
}
```

Each report case must bind:

- Git commit and dirty state;
- source SHA-256;
- generated datapack SHA-256;
- compiler options and Minecraft version channel;
- Paper build and Paper JAR SHA-256;
- TestHarness version and JAR SHA-256;
- optional TestBot identity/version;
- exact lifecycle action;
- setup/entrypoint/observable/cleanup results;
- executed source-function probe IDs;
- timestamps and final status.

## 4. Implementation tasks

### Task 1: Freeze a machine-readable diagnostic baseline

**Objective:** Preserve the current failure classes without presenting them as canonical proof.

**Files:**
- Create: `docs/evidence/mc-runtime-corpus-baseline-2026-08-02.md`
- Create: `docs/evidence/mc-runtime-corpus-baseline-2026-08-02.json`

**Steps:**
1. Convert the retained Jest result into counts by suite and failure class.
2. Classify failures as `deployment/entrypoint-unproven`, `semantic-mismatch`, `missing-objective/storage`, `player-prerequisite`, or `infrastructure`.
3. Record `66 failed / 16 skipped / 401 passed` and the disposable environment identity.
4. Mark every `0`-value failure as `entrypoint-unproven` until pack/function load is independently established.
5. Validate JSON schema and hashes.

**Gate:** The baseline artifact must not claim any failed case is a compiler bug without an entrypoint receipt.

**Commit:** `docs: record runtime corpus diagnostic baseline`

### Task 2: Add fail-closed live prerequisites

**Objective:** Make strict server/bot requirements impossible to bypass with `return`.

**Files:**
- Create: `src/test-utils/mc-live-prerequisites.ts`
- Modify: `jest.setup.mc-integration.js`
- Modify: bot-aware setup in:
  - `src/__tests__/mc-integration/stdlib-coverage-6.test.ts`
  - `src/__tests__/mc-integration/item-entity-events.test.ts`
- Test: `src/__tests__/mc-live-prerequisites.test.ts`

**Steps:**
1. Add `MC_INTEGRATION_REQUIRE_ONLINE=true` and `MC_INTEGRATION_REQUIRE_BOT=true` policies.
2. RED: strict + unavailable server throws before any test body.
3. RED: strict bot lane + missing/disconnected bot throws.
4. GREEN: optional local runs keep explicit `[SKIP]` logging, but strict runs cannot return green.
5. Add an after-suite liveness check so a server dying mid-suite fails the run.
6. Ensure `MC_OFFLINE=true` conflicts with strict mode and fails configuration.

**Gate:** A strict run against closed ports exits non-zero before executing semantic cases.

**Commit:** `test(mc): fail closed on missing live prerequisites`

### Task 3: Extract managed Paper lifecycle infrastructure

**Objective:** Reuse one safe disposable-server implementation for P9 and the corpus runner.

**Files:**
- Create: `src/mc-test/managed-paper.ts`
- Modify: `src/mc-test/p9-runner.ts`
- Test: `src/__tests__/managed-paper.test.ts`

**Steps:**
1. Move template validation, disposable root creation, Java qualification, startup, stop, log segmentation, and cleanup behind `ManagedPaper`.
2. Preserve P9 behavior byte-for-byte at the report contract level.
3. RED: template worlds are never copied as evidence worlds.
4. RED: spawn errors, early exit, stop timeout, and both cleanup failures become structured checks.
5. RED: each run receives a unique server root and port reservation.
6. GREEN: P9 focused tests and both strict P9 live channels still pass.

**Gate:** No runner may point `MC_SERVER_DIR` at either template root.

**Commit:** `refactor(mc): share disposable Paper lifecycle`

### Task 4: Replace shared datapack mutation with isolated case packs

**Objective:** Remove suite-order and tag-merging contamination.

**Files:**
- Create: `src/mc-test/corpus-deployer.ts`
- Modify: `src/mc-test/case-runner.ts`
- Test: `src/__tests__/mc-corpus-deployer.test.ts`

**Steps:**
1. Generate a unique namespace and datapack directory from the case ID.
2. Reject path collisions and stale roots before deployment.
3. Never merge tags from unrelated cases.
4. Deploy one case/suite pack, reload, verify load phase, execute, unload/remove, reload, and verify cleanup.
5. For load/tick tests, isolate the pack so only that case contributes tags.
6. Add a collision test with two packs defining load/tick tags.

**Gate:** Reversing case order produces identical reports and observables.

**Commit:** `test(mc): isolate runtime corpus datapacks`

### Task 5: Add explicit deploy and entrypoint receipts

**Objective:** Distinguish “function did not run” from semantic failure.

**Files:**
- Modify: `/Users/yuzhe/projects/redscript-testharness/src/main/kotlin/dev/redscript/testharness/Handlers.kt`
- Modify: `/Users/yuzhe/projects/redscript-testharness/README.md`
- Modify: `src/mc-test/client.ts`
- Test: TestHarness Kotlin tests and `src/__tests__/mc-test-client-dumps.test.ts`

**Steps:**
1. Add a bounded command execution receipt containing dispatch result and captured command feedback where Bukkit permits it.
2. Add a pack/function probe endpoint or equivalent server-side readback that can distinguish missing entrypoint from a zero semantic result.
3. Add log-segment parsing for datapack/function parse failures after reload.
4. RED: malformed generated command causes `deploy` failure, not a later scoreboard mismatch.
5. RED: missing entrypoint is reported as `entrypoint`, not `semantic`.
6. Keep all endpoint inputs bounded and fail-closed.

**Gate:** Every semantic assertion is preceded by successful `artifact`, `deploy`, and `entrypoint` checks.

**Commit:** `feat(harness): expose bounded datapack execution receipts`

### Task 6: Add source-function coverage instrumentation

**Objective:** Prove actual execution of `.mcrs` source functions in Paper.

**Files:**
- Create: `src/compiler/runtime-coverage.ts`
- Modify: the canonical compiler/backend path that maps source functions to emitted commands; do not bypass AST→HIR→MIR→LIR.
- Create: `src/mc-test/runtime-probe-map.ts`
- Test: `src/__tests__/runtime-coverage-instrumentation.test.ts`

**Design:**

- Add an internal, test-only compiler option; it must be rejected by public CLI/config unless the corpus runner enables it.
- Assign stable compact probe IDs by bytewise-sorted `(source path, declaration span, function name)`.
- Emit a bounded marker such as `scoreboard players set #c000123 __rs_cov 1` when the source function executes.
- Map probe ID back to exact source declaration in the report.
- Cover inlined functions by emitting the probe in the inlined call body or by preserving source-call provenance through optimization.
- Do not count generated helper functions as source-function coverage; report them separately if useful.

**Two-run rule:**

1. Run the uninstrumented artifact and verify semantic observables.
2. Run the instrumented artifact and verify reachability markers.
3. Count a case as covered only if both runs pass for the same source/artifact plan.

**RED tests:**

- default compilation emits no probes and remains byte-identical;
- probe IDs are deterministic across locale/process order;
- direct, nested, recursive, coroutine, tick/load, and inlined functions produce the expected markers;
- an uncalled function remains uncovered;
- instrumentation cannot change the expected semantic outputs.

**Gate:** The report lists exact uncovered source declarations, not only aggregate percentages.

**Commit:** `feat(mc): instrument source-function runtime coverage`

### Task 7: Build the coverage catalog and drift gate

**Objective:** Make new language features and stdlib modules fail CI until classified.

**Files:**
- Create: `tests/mc-cases/runtime-coverage-catalog.ts`
- Create: `src/__tests__/mc-runtime-coverage-catalog.test.ts`
- Modify: `docs/plans/redscript-coverage-matrix.json`

**Steps:**
1. Enumerate runtime-relevant AST statement/expression/type/decorator categories from canonical source exports.
2. Enumerate all `src/stdlib/*.mcrs` files.
3. Enumerate all non-internal function declarations using compiler parser metadata, not regex.
4. Require each item to be one of:
   - `runtime-semantic`;
   - `runtime-reachability`;
   - `compile-only`;
   - `tooling-only`;
   - `internal-transitive` with a public root and reachable call-chain proof;
   - `unsupported` with an issue/roadmap reference.
5. RED on a synthetic new stdlib module, AST kind, decorator, or source function with no catalog entry.
6. Replace stale free-form `livePaperStatus` claims with receipt IDs.

**Gate:** Catalog coverage is 100%; runtime execution percentage may be lower until later tasks, but the gap list is exact and machine-readable.

**Commit:** `test(mc): gate runtime coverage catalog drift`

### Task 8: Migrate language semantics to descriptor-driven cases

**Objective:** Cover runtime language semantics without one monolithic mutable Jest file.

**Files:**
- Expand: `tests/mc-cases/core-oracle.mcrs`
- Expand: `tests/mc-cases/core-oracle-cases.ts`
- Create additional bounded `.mcrs` fixture files only when lifecycle/isolation requires it.
- Retire or thin: `src/__tests__/mc-integration/syntax-coverage.test.ts`
- Retire or thin: duplicated sections of `src/__tests__/mc-integration.test.ts`

**Case groups:**

- scalar types and fixed-point boundaries;
- function args/returns, nested calls, recursion limits;
- arrays, dynamic indexing, array parameters;
- structs, nested fields, impl methods;
- enums, match/range/wildcard;
- Option/Result, `if let`, `while let`;
- `if/else`, loops, range, foreach, break/continue;
- selector/context propagation (`as`, `at`, `@s`);
- macros, storage/NBT, cache invalidation across calls;
- decorators: load, tick, schedule, coroutine, watch, event paths;
- raw command and resource emission boundaries.

**Steps per group:**
1. Write/retain the failing descriptor.
2. Run only that case in an isolated pack.
3. Verify deploy/entrypoint receipts.
4. Fix compiler semantics only after infrastructure is green.
5. Run uninstrumented semantics and instrumented reachability.
6. Commit each coherent language group separately.

**Gate:** Every runtime-relevant catalog feature references at least one passing descriptor ID.

### Task 9: Migrate stdlib coverage and fill module gaps

**Objective:** Reach 51/51 stdlib modules with representative semantic cases and expose exact function gaps.

**Files:**
- Convert the useful fixtures in `src/__tests__/mc-integration/stdlib-coverage*.test.ts` into descriptors or shared fixture builders.
- Add cases for missing module-level coverage: `advanced`, `expr`, `result`, and `sets`.
- Keep `events` as an explicit player/event lane rather than misclassifying it as missing.

**Steps:**
1. Map each module to one or more semantic cases and stable observables.
2. Run each module in an isolated namespace/pack.
3. Use probe instrumentation to compute function reachability.
4. Add targeted cases for uncovered public roots; do not add duplicate cases for trivial component accessors when a composed call-chain proves execution.
5. Separate numerical tolerance cases from exact integer cases.
6. Separate command acceptance (`particles`, `effects`, `bossbar`) from human visual acceptance.

**Gate:**

- module semantic coverage: `51/51`;
- report contains exact source-function numerator/denominator and uncovered declarations;
- no module receives credit merely because its source was passed as `librarySources`.

**Commit cadence:** one signed commit per bounded module family, e.g. numerics, collections, world/player, scheduling/events.

### Task 10: Provision a managed TestBot lane

**Objective:** Turn player-only tests from silent returns into real evidence.

**Files:**
- Create: `scripts/mc-testbot/` or a separate clearly owned TestBot package under the repo.
- Create: `src/mc-test/managed-testbot.ts`
- Test: `src/__tests__/managed-testbot.test.ts`
- Modify bot-aware corpus descriptors.

**Steps:**
1. Pin the Mineflayer/TestBot dependency and protocol compatibility.
2. Start it only against the disposable Paper server.
3. Bind readiness to exact username, server address, protocol version, and HTTP control endpoint.
4. Add bounded startup/stop/cleanup and child-process error handling.
5. Require bot receipt for player selectors, inventory, interactions, ItemUse, EntityKill, login, advancement, team, and chat cases.
6. Fail strict player lane if the bot is absent or disconnected.
7. Never claim simulated scoreboard writes prove genuine client input where the feature contract requires a player action.

**Gate:** All `requires: ['testbot']` cases execute with zero skips and server-side player identity readback.

**Commit:** `test(mc): add managed player runtime oracle`

### Task 11: Implement the managed corpus runner and evidence report

**Objective:** Provide one reproducible command that owns server, optional bot, corpus execution, report, and cleanup.

**Files:**
- Create: `src/mc-test/runtime-corpus-runner.ts`
- Create: `src/mc-test/runtime-coverage-schema.ts`
- Modify: `package.json`
- Test: `src/__tests__/mc-runtime-corpus-runner.test.ts`

**Commands:**

```bash
npm run test:mc-corpus              # optional: explicit SKIP when unavailable
npm run test:mc-corpus:live         # strict stable full corpus
npm run test:mc-corpus:live:26.2    # strict current compatibility corpus
npm run report:mc-runtime-coverage
```

**Runner requirements:**

- unique disposable root and ports;
- pure-void deterministic reset before every stateful shard;
- one report per version channel;
- no template world copied or mutated;
- no silent skip in strict mode;
- authoritative non-zero executed-case count;
- cleanup errors included in failed report;
- no canonical evidence overwrite by invalid channel/output override;
- case-level timeouts and bounded retry policy; no Jest-wide `retryTimes(2)` for deterministic semantic bugs;
- preserve raw Jest/runner output as diagnostic attachment, not as the canonical report itself.

**Gate:** Killing Java, deleting a fixture, disconnecting TestBot, or introducing an uncovered function produces a structured failed report and exit `1`.

**Commit:** `feat(mc): add managed runtime corpus oracle`

### Task 12: CI topology and artifact separation

**Objective:** Keep fast CI deterministic while preserving full live evidence lanes.

**Files:**
- Modify: `.github/workflows/live-mc-core.yml` or create a separate `live-mc-corpus.yml` if schedule/runtime cost warrants it.
- Modify: release evidence checklist and contributor docs.

**Lanes:**

1. `catalog-static` — required on every push; no server.
2. `corpus-stable-server` — strict full server-only corpus.
3. `corpus-stable-player` — strict TestBot corpus.
4. `corpus-26.2-sensitive` — independent current-version compatibility lane.
5. Existing P9 stable and 26.2 lifecycle lanes remain independent.

**Rules:**

- Every configured lane uses independent `always() && configured` conditions.
- Artifact names and paths include channel/profile.
- `if-no-files-found: error` for strict reports.
- One lane failure must not suppress another independent oracle.
- Java versions are explicit and version-qualified.

**Gate:** Workflow YAML parse, extracted shell `bash -n`, and static assertions for independent lane conditions/artifacts.

**Commit:** `ci: add strict runtime corpus lanes`

### Task 13: Final qualification and evidence publication

**Objective:** Produce a defensible “executed in game” claim.

**Steps:**
1. Run catalog/static tests.
2. Run full stable server corpus uninstrumented.
3. Run full stable server corpus instrumented.
4. Run strict TestBot corpus.
5. Run 26.2 version-sensitive corpus.
6. Re-run P9 stable and 26.2 lifecycle gates.
7. Run `npm run gate:full` and package smoke.
8. Validate report schema, digests, counts, and source-function mapping.
9. Publish separate evidence JSON/Markdown for stable and current channels.
10. Signed commit, push, exact-SHA CI readback, and remote artifact readback.

**Definition of Done:**

- zero failed required cases;
- zero skipped required cases;
- non-zero executed case count in every strict lane;
- 100% runtime-relevant language feature mapping;
- 51/51 stdlib module semantic coverage;
- exact source-function reachability ratio with no unexplained uncovered public declarations;
- every credited function has both probe execution and a passing semantic root/case;
- all player-required cases have TestBot receipts;
- templates remain unchanged except intentionally versioned plugin replacement;
- no Paper processes/listeners or disposable roots remain;
- signed commits pushed and CI results read back.

## 5. Failure triage order

When a case fails, classify in this order:

1. `configuration` — Java/template/Paper/Harness/Bot/channel unavailable;
2. `artifact` — compiler output missing/invalid/path collision;
3. `deploy` — pack reload or generated function parse failure;
4. `entrypoint` — expected function/tag did not execute;
5. `semantic` — entrypoint executed but readback differed;
6. `cleanup` — state/artifact/process remained;
7. `coverage` — semantics passed but required source probe was not observed.

Never fix compiler semantics while the failure is still in classes 1–4.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Instrumentation changes optimizer/codegen behavior | Dual uninstrumented/instrumented runs; default artifacts byte-identical; internal provenance-aware marker emission |
| 663 apparent public functions make the suite too slow | Track transitive execution; shard by module family; keep one server per shard group but one isolated pack/reset per case |
| Inline/private helper ambiguity | Compiler parser metadata and call provenance; explicit internal naming/annotation policy |
| Player tests are flaky | Managed pinned bot, exact readiness/identity, no arbitrary retries, state reset before each case |
| Visual/audio behavior cannot be fully server-asserted | Report command/state acceptance only; keep human visual acceptance as separate claim |
| Paper version drift | Independent channels and manifests; no cross-labeling |
| Existing 66 failures are mostly harness pollution | Deploy/entrypoint receipts and isolated packs before compiler fixes |
| Runtime too expensive for every push | Static catalog required per push; full corpus scheduled/manual or protected branch, with exact artifacts |

## 7. Recommended implementation order

Execute in this order and stop after each gate if it fails:

1. Tasks 1–2: truthful baseline and strict prerequisites.
2. Tasks 3–5: managed isolation and deploy/entrypoint evidence.
3. Re-run the existing suite; only now classify remaining compiler bugs.
4. Tasks 6–7: instrumentation and drift-proof catalog.
5. Tasks 8–9: migrate language and stdlib semantic cases.
6. Task 10: managed player lane.
7. Tasks 11–12: one-command runner and CI.
8. Task 13: final dual-version qualification and delivery.

Do not begin broad compiler fixes before Task 5 closes the infrastructure ambiguity.
