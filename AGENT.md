# AGENT.md

This file summarizes how to work on this repository and the highest-priority constraints from `review-report.md`.

## Project snapshot
- Name: `redscript-mc`
- Purpose: TypeScript compiler for `.mcrs` that emits Minecraft datapacks.
- Main scripts:
  - `npm run build` -> compile TypeScript (`tsc`)
  - `npm test` -> Jest test suite
  - `npm run validate-mc` -> runs `mc-syntax` syntax validation
  - `npm run bench` -> compiler performance benchmark
  - `npm run cli` -> local CLI entrypoint via `ts-node src/cli.ts`
- Main entry points in `src/`:
  - `src/cli.ts` (CLI wrapper)
  - `src/compile.ts` (programmatic compile API surface)
  - `src/index.ts` (package exports)
  - `src/repl.ts` and `src/repl-server.ts`

## Project structure
- Top-level directories: `.github`, `benchmarks`, `docs`, `editors`, `examples`, `playground`, `scripts`, `src`, `test-datapacks`.
- `src/` is split by compiler phase:
  - `lexer`, `parser`, `typechecker`, `hir`, `mir`, `lir`, `optimizer`, `emit`, `mc-validator`
  - `runtime`, `builtins`, `stdlib`, `formatter`, `lsp`, `testing`, `mc-test`
  - `tuner`, `docs.ts`, `templates`, `cache`, `events`, `config`, `diagnostics`
- `src/__tests__/` contains phase-specific test folders (`parser`, `typechecker`, `hir`, `mir`, `lir`, `optimizer`, `emit`, `mc-*`, `mc-test`, `e2e`, etc.).
- `test-datapacks/` stores smoke/reference datapacks for compile and sample coverage.

## Mandatory behavior to preserve
- Keep the current compiler pipeline shape (`lexer -> parser -> typecheck -> HIR -> MIR -> optimize -> LIR -> emit`) unless a change includes an explicit pipeline refactor plan.
- Do not change semantics without updating tests in the corresponding pipeline stage.
- Prefer deterministic outputs for compile phases that feed snapshot tests.
- Treat `raw` command handling carefully: the report identifies it as a key unsafe surface.

## Highest priority issues from review
Use this order unless a task is explicitly scoped lower:

1. `src/testing/runner.ts` live mode protocol mismatch:
   - Runner uses `/run` + `/score`; current harness provides `/command` + `/scoreboard`.
   - Fix this integration contract first before new integration behavior.
2. `pack.mcmeta` uses fixed `pack_format`:
   - Use version-aware mapping for compile/publish output.
3. MC syntax validation gaps:
   - Ensure `mc-syntax` supports macro lines and `function ... with storage` cases.
4. Add/strengthen artifact validators:
   - namespace/function path collision (case-insensitive path collisions)
   - namespace/objective/path naming collisions (e.g., function/objective truncation behavior)
5. Improve static validation for `raw` commands and unsafe patterns.
6. Add structured `/reload` and `/command` error/log response handling in server/oracle path.
7. Add tick/performance budget guards for generated command output in CI-style checks.

## Recent prep updates (runner compatibility)
- `src/testing/runner.ts` now centralizes harness protocol handling:
  - primary flow: `/command` to run tests and `/scoreboard` for the failure counter
  - compatibility fallback: `/run` + `/score` for older harness versions
  - HTTP helpers now fail on non-2xx responses and surface response bodies

## Testing harness contract
- Harness protocol precedence:
  - Primary: `POST /command` with `{"cmd":"function <namespace>:__run_all_tests"}`, then `GET /scoreboard?player=rs.test_failed&obj=rs.meta`
  - Legacy fallback (compat): `POST /run` with `{"command":"function <namespace>:__run_all_tests"}`, then `POST /score` with `{"objective":"rs.meta","player":"rs.test_failed"}`
- Expected harness names:
  - Objective: `rs.meta`
  - Failed counter player: `rs.test_failed`
  - Runner function: `__run_all_tests`
- Helper APIs used by tests:
  - `normalizeHarnessBaseUrl(baseUrl)`
  - `buildHarnessRunPayload(namespace, mode?)`
  - `buildFailedCountRequest(baseUrl, mode?)`
  - `parseScoreValue(raw)`
- Score response parsing expectations:
  - JSON must parse successfully
  - Accept `value`, `result.value`, `data.value`, `score.value`, and similar nested candidates
  - Arrays and nested objects are scanned for first numeric/string-number score
  - Throw `Invalid scoreboard response JSON: ...` for invalid JSON
  - Throw `Unexpected scoreboard response` if unsupported payload shape is returned

## Test and integration guidance
- `npm test` is currently offline-friendly by default; avoid assuming live server is always available.
- Integration coverage with Paper harness should be explicit and separated from the unit path.
- When touching command output, update:
  - command text tests (`mc-syntax`, fixtures)
  - golden output tests (`emit` / compile artifacts)
  - any relevant simulator/static validator checks
- For any `@test` runner work, verify endpoint names and payload contract consistency with `redscript-testharness`.

## Change conventions
- Keep changes scoped to the request and avoid unrelated refactors.
- Prefer incremental edits to keep compile and test snapshots stable.
- Update docs/comments when behavior is user-visible (pack format, protocol shape, versioning, diagnostics).
