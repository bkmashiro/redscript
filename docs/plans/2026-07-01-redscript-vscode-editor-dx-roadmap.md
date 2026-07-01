# RedScript VSCode Editor DX Roadmap

> **For Hermes:** Use extension-development, spark-implementation-lane, and test-driven-development skills. Spark/worker performs bounded slices only; the controller owns scope, review, gates, commits, push, and CI status.

**Goal:** Turn the RedScript VSCode extension into a RedScript/Minecraft-aware editor experience without drifting from the compiler, LSP, or current language standard.

**Architecture:** Keep TextMate grammar lightweight and visual, keep semantic behavior in the LSP, and treat `builtins.d.mcrs`, compiler metadata, and `src/resources/catalog.ts` as the source-of-truth direction. Avoid duplicating stale builtin/resource tables in VSCode-only fallback code unless protected by drift tests.

**Tech Stack:** TypeScript, VSCode extension APIs, vscode-languageclient, RedScript LSP, TextMate grammars, Jest, VSIX packaging.

---

## Baseline — 2026-07-01

Repository: `/Users/yuzhe/projects/redscript`

Current branch/status at roadmap creation:

- `main...origin/main`, clean.
- Latest commit: `6abe267 docs(plans): record release smoke evidence`.
- Latest current-HEAD CI/checks observed green; older failed runs were superseded by later green commits.

Existing editor capabilities:

- VSCode extension under `editors/vscode/`.
- LSP server under `src/lsp/server.ts` advertises diagnostics, hover, definition, completion, signature help, references, rename, and inlay hints.
- Extension includes fallback hover/completion/diagnostics for missing LSP, code actions, symbol providers, TextMate grammar, snippets, `builtins.d.mcrs`, and VSIX package scripts.

Initial drift/staleness findings:

- `editors/vscode/builtins.d.mcrs` contains old/example strings such as f-string interpolation text, quoted resource IDs, string scoreboard objectives, and `float` in signatures/examples.
- `editors/vscode/src/hover.ts` and `editors/vscode/src/completion.ts` duplicate builtin signatures/docs and include outdated examples/signatures.
- `editors/vscode/snippets/redscript.json` should be audited with a compile/parse smoke rather than trusted manually.
- TextMate grammar already recognizes f-strings and many RedScript/Minecraft tokens, but needs focused coverage for `#objective`, unquoted `minecraft:path`, `resource<...>`, `.d.mcrs` declarations, and selector internals.

## Non-goals

- Do not rewrite the compiler, LSP, or extension architecture.
- Do not add generic IDE features just for breadth.
- Do not introduce a closed enum registry model; unknown resources remain allowed where RedScript semantics allow them.
- Do not treat static/editor evidence as live Paper/Minecraft proof.
- Do not broaden into redscript-ide except for cross-checking examples or smoke evidence.
- Do not commit generated VSIX/bundle noise unless the repo intentionally tracks that artifact for the release path.

## Controller/Spark operating rules

For each implementation slice:

1. Controller defines one bounded task with allowed/forbidden files and exact gates.
2. Spark/worker does not commit or push.
3. Controller reviews the diff, rejects forbidden scope, and runs real gates.
4. Controller updates this roadmap completion log.
5. Controller commits, pushes, and performs one-shot CI/status query.
6. If worker model cannot be verified as Spark, report it as Spark-shaped worker output, not confirmed Spark cost savings.

## Track A — Metadata/source-of-truth audit

**Product promise:** Builtin docs, completion labels, hover examples, and declaration surfaces should not drift from current RedScript semantics.

Primary files:

- `editors/vscode/builtins.d.mcrs`
- `editors/vscode/src/hover.ts`
- `editors/vscode/src/completion.ts`
- `src/builtins/metadata.ts`
- `src/lsp/server.ts`
- `src/resources/catalog.ts`

Tasks:

- [ ] A1. Compare VSCode fallback builtin tables with compiler/LSP metadata and list drift categories.
- [ ] A2. Add a lightweight drift/stale-example smoke for editor docs/snippets/declarations.
- [ ] A3. Remove or regenerate duplicated fallback metadata where practical.
- [ ] A4. Ensure `builtins.d.mcrs` examples use current recommended syntax.
- [ ] A5. Gate: focused unit/smoke + `npm run build` + `cd editors/vscode && npm run build` + `git diff --check`.

## Track B — Snippets/examples/current-language smoke

**Product promise:** User-facing examples and snippets demonstrate current RedScript syntax and compile/parse cleanly.

Primary files:

- `editors/vscode/snippets/redscript.json`
- `editors/vscode/README.md`
- `editors/vscode/fixtures/test.mcrs`
- `src/__tests__/...` or `scripts/...` for smoke helpers

Tasks:

- [x] B1. Add a smoke test/script that extracts snippets/fixtures and checks for stale syntax patterns with a documented allowlist.
- [x] B2. Update snippets/fixtures away from old f-string/`${...}` demo style, string scoreboard objectives, and quoted resource IDs in typed contexts.
- [ ] B3. Verify snippets still make useful editing templates rather than becoming over-specific examples.
- [ ] B4. Gate: stale-pattern smoke + snippet/fixture parse/compile smoke where feasible + extension build.

## Track C — Resource/context-aware completion v1

**Product promise:** Minecraft resource IDs are discoverable at the point of use.

Primary files:

- `src/lsp/resource-completions.ts`
- `src/lsp/server.ts`
- `src/resources/catalog.ts`
- relevant LSP tests under `src/__tests__/`

Tasks:

- [ ] C1. Add tests for `particle(...)` resource completion in the correct argument position.
- [ ] C2. Add tests for `effect(@s, ...)` resource completion.
- [ ] C3. Add tests for selector `type=` entity completion and ordinary-string negative cases.
- [ ] C4. Implement minimal context detector by function name/argument index and selector key context.
- [ ] C5. Include completion detail/documentation that labels category and static/editor nature.

## Track D — Semantic hover v1

**Product promise:** Hover explains RedScript/Minecraft semantics, not just generic syntax.

Primary files:

- `src/lsp/server.ts`
- `src/lsp/resource-completions.ts`
- `editors/vscode/src/hover.ts` only for fallback cleanup

Tasks:

- [ ] D1. Builtin hover from current metadata/declarations.
- [ ] D2. Decorator hover for lifecycle/runtime decorators (`@tick`, `@load`, `@keep`, `@test`, `@coroutine`, `@throttle`, `@retry`, `@memoize`).
- [ ] D3. Resource literal hover showing known category and static/editor caveat.
- [ ] D4. `#objective` hover explaining scoreboard objective semantics.
- [ ] D5. Selector hover/argument hover refinements.

## Track E — Signature Help v1

**Product promise:** MC builtin calls show current parameter names/types and active parameter accurately.

Primary files:

- `src/lsp/server.ts`
- `src/builtins/metadata.ts`
- `editors/vscode/builtins.d.mcrs`
- focused LSP tests

Tasks:

- [ ] E1. Tests for typed-resource builtin signature labels (`particle`, `effect`).
- [ ] E2. Tests for scoreboard objective parameter help.
- [ ] E3. Tests for user-defined and `declare fn` signature help.
- [ ] E4. Fix active parameter calculation if needed.

## Track F — TextMate grammar refinement

**Product promise:** Files look semantically structured even before LSP starts.

Primary files:

- `editors/vscode/syntaxes/redscript.tmLanguage.json`
- grammar fixtures/tests if added
- `editors/vscode/package.json` token customization defaults

Tasks:

- [ ] F1. Add grammar smoke/fixture coverage for `#objective`, unquoted `minecraft:path`, `resource<...>`, selector internals, and `declare fn`.
- [ ] F2. Update grammar scopes without trying to encode semantic validity.
- [ ] F3. Keep f-string highlighting if parser supports it, but do not promote it in snippets/examples.
- [ ] F4. Verify extension package includes grammar files.

## Track G — Migration quick fixes

**Product promise:** Old RedScript idioms are easy to migrate safely.

Primary files:

- `editors/vscode/src/codeactions.ts`
- LSP diagnostics/code actions if moved server-side later
- focused tests/smokes

Tasks:

- [ ] G1. Preserve/verify existing `type=zombie` → `type=minecraft:zombie` quick fix.
- [ ] G2. Add string objective → `#objective` quick fix in scoreboard contexts.
- [ ] G3. Add quoted known resource → unquoted `minecraft:path` quick fix in typed resource contexts.
- [ ] G4. Add deprecated `float`/old interpolation suggestions only where safe; avoid destructive false positives.

## Track H — VSIX package smoke

**Product promise:** The extension artifact actually contains the LSP, grammar, snippets, and declaration surface.

Primary files:

- `editors/vscode/build.mjs`
- `editors/vscode/package.json`
- possible smoke script under `scripts/` or `editors/vscode/`

Tasks:

- [ ] H1. Add/verify package content smoke for VSIX contents.
- [ ] H2. Confirm `out/lsp-server.js`, `builtins.d.mcrs`, snippets, and grammar are packaged.
- [ ] H3. Keep package smoke separate from Web IDE smoke.

## Track I — CI/release integration

**Product promise:** Editor DX regressions fail cheaply and release automation remains stable.

Tasks:

- [ ] I1. Inspect existing Actions coverage for VSCode build/package.
- [ ] I2. Add a cheap editor-DX gate only if missing and low-risk.
- [ ] I3. After each push, perform one-shot `gh run list --commit <HEAD>` and report current HEAD status.

## Gates by slice type

Docs/roadmap only:

```bash
git diff --check
git status -sb
```

Editor metadata/snippets/grammar:

```bash
npm run build
cd editors/vscode && npm run build
# plus focused smoke/test added by the slice
git diff --check
```

LSP semantic behavior:

```bash
npm test -- --selectProjects unit --runTestsByPath <focused-tests> --runInBand
npm run build
cd editors/vscode && npm run build
git diff --check
```

Packaging:

```bash
npm run build
cd editors/vscode && npm run package
# inspect VSIX contents via unzip/list command
git diff --check
```

## Completion log

- 2026-07-01: Roadmap created after baseline audit. Current extension already has LSP diagnostics/hover/definition/completion/signature/references/rename/inlay hints, but stale syntax and duplicated metadata were found in `builtins.d.mcrs`, fallback hover/completion, snippets/fixtures, and docs. Next slice: Spark-shaped read-only audit + Track B stale syntax smoke/fix.
- 2026-07-01: Slice B1/B2 completed. Added `resource-docs.test.ts` coverage for VSCode editor-facing stale syntax, replaced the `actionbar` `${time}` example and tellraw f-string wording in the VSCode builtins/fallback hover docs, and updated the VSCode fixture to `scoreboard_set(@s, #score, 10);`. Verification: focused `resource-docs` test passed; editor fixture compiled via `dist/src/index.js`; `npm run build`, `cd editors/vscode && npm run build`, and `git diff --check` passed. Generated `editors/vscode/out/*` build artifacts were intentionally reverted because this slice did not target release packaging.
