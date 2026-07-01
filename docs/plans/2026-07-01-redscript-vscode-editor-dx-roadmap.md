# RedScript VSCode Editor DX Close-out

This file is now a completed close-out record for the 2026-07-01 VSCode editor-DX pass. Do not use it as the active next-work prompt; future work should return to the main RedScript roadmaps unless a new editor-DX issue is found during manual testing.

## Context

Repo: `/Users/yuzhe/projects/redscript`

A–E are already done enough to stop tracking them here:

- Stale editor docs/snippets/examples were audited and partially cleaned.
- Resource/context-aware completion exists for particle/effect/selectors, with static/editor catalog caveats.
- Semantic hover exists for builtins, decorators, selectors, resources, and `#objective`; this is static/editor guidance, not live Paper proof.
- Signature help exists for typed-resource builtins, scoreboard objectives, user/`declare fn` functions, and active parameter calculation; this is static/editor/LSP evidence, not live Paper proof.
- Generated VSCode `out/*` build artifacts should be reverted unless a release/package slice explicitly wants them.

## Historical operating rules

These were the rules used while executing this pass:

- Work on `main` in `/Users/yuzhe/projects/redscript`.
- Check `git status -sb` before editing. Do not overwrite uncommitted user work.
- Prefer Spark for bounded implementation slices; controller owns review, gates, commits, push, and CI status.
- Do not claim static/editor evidence as live Paper/Minecraft proof.
- Keep TextMate grammar visual/syntactic only; do not encode compiler semantic validity in grammar.
- After each verified slice: update this file, run the relevant gates, make a signed commit, push, then check current-head CI once.
- Revert generated `editors/vscode/out/*` unless the slice is explicitly packaging/release.

## Completed work order

### F — TextMate grammar refinement — completed 2026-07-01

Goal: files should look semantically structured before the LSP starts.

Primary files:

- `editors/vscode/syntaxes/redscript.tmLanguage.json`
- focused grammar fixtures/tests if added
- `editors/vscode/package.json` only if token defaults/package metadata truly need it

Tasks:

- [x] F1. Add or identify a cheap grammar smoke/fixture for these contexts: `#objective`, unquoted `minecraft:path`, `resource<...>`, selector internals, and `declare fn`.
- [x] F2. Update TextMate scopes minimally for those contexts without claiming semantic validity.
- [x] F3. Keep f-string highlighting if supported by parser, but do not promote f-string syntax in snippets/examples.
- [x] F4. Verify extension build/package inputs still include grammar files.

Evidence: `src/__tests__/vscode-grammar.test.ts` covers the grammar contexts and package contribution; `cd editors/vscode && npm run build` and `git diff --check` passed. This remains static/editor grammar evidence, not compiler or live Paper proof.

### G — Migration quick fixes — completed 2026-07-01

Goal: old RedScript idioms are easy to migrate safely.

Tasks:

- [x] G1. Preserve/verify existing `type=zombie` → `type=minecraft:zombie` quick fix.
- [x] G2. Add string objective → `#objective` quick fix in scoreboard contexts.
- [x] G3. Add quoted known resource → unquoted `minecraft:path` quick fix in typed resource contexts.
- [x] G4. Add deprecated `float` / old interpolation suggestions only where safe; avoid destructive false positives.

Evidence:
- G1–G4 implemented in `editors/vscode/src/codeactions.ts` with focused helper tests in
  `src/__tests__/vscode-codeactions.test.ts`: selector type namespace migration is preserved; quoted scoreboard
  objective/resource candidates are only offered in detected builtin argument contexts; deprecated `float` is suggested
  only in type-like contexts; legacy `${...}` string interpolation offers a guarded f-string conversion while current
  f-strings and literal dollar strings remain untouched. This is static/editor quick-fix evidence, not compiler or live
  Paper proof.

### H — VSIX package smoke — completed 2026-07-01

Goal: the extension artifact contains the LSP, grammar, snippets, and declaration surface.

Tasks:

- [x] H1. Add/verify package content smoke for VSIX contents.
- [x] H2. Confirm `out/lsp-server.js`, `builtins.d.mcrs`, snippets, and grammar are packaged.
- [x] H3. Keep package smoke separate from Web IDE smoke.

Evidence: `npm run build && npm run smoke:vscode-vsix` passes and validates that `extension/out/extension.js`, `extension/out/lsp-server.js`, `extension/builtins.d.mcrs`, `extension/snippets/redscript.json`, `extension/syntaxes/redscript.tmLanguage.json`, `extension/syntaxes/mcfunction.tmLanguage.json`, the contributed icon theme files (`extension/icons/redscript-icons.json`, `extension/icons/mcrs.svg`), and `extension/package.json` are present in the packaged VSIX. This is package-content evidence only and separate from Web IDE/browser smoke.


### I — CI/release integration — completed 2026-07-01

Goal: editor-DX regressions fail cheaply and release automation remains stable.

Tasks:

- [x] I1. Inspect existing Actions coverage for VSCode build/package.
- [x] I2. Add a cheap editor-DX gate only if missing and low-risk.
- [x] I3. After each push, perform one-shot `gh run list --commit <HEAD>` and report current HEAD status.

Evidence:

- I1: `CI` already ran compiler build/unit/static gates but did **not** run VSCode package steps before I2; publish workflows only caught VSIX packaging later.
- I2: Added a low-risk CI gate in `ci.yml` under the `compiler` job: `working-directory: editors/vscode` `npm ci`, then root `npm run smoke:vscode-vsix` to verify packaged extension contents before publish.
- I3: Controller finalization for this slice performs `gh run list --commit <HEAD>` after push and reports current-head CI/publish status in the handoff.


## Close-out / maintenance handoff

Status: **closed**. Tracks F–I are complete, committed, pushed, and covered by current-head CI/publish checks as of 2026-07-01.

If manual VSCode testing finds a regression, open a new focused bug/slice rather than extending this roadmap. Keep the same proof labels:

- grammar/quick-fix evidence is static/editor evidence;
- VSIX smoke is package-content evidence;
- CI release gating proves the smoke runs before publish;
- none of the above is live Paper/Minecraft runtime proof.

Suggested next source of truth after this pass:

1. `docs/plans/redscript-vnext-roadmap.md` for the active mainline roadmap.
2. `docs/plans/compiler-mc-hardening-roadmap.md` for compiler/Minecraft oracle hardening detail.
3. Maintenance mode for this editor-DX lane: only fix concrete regressions from manual testing or CI failures.

## Gates

Docs-only update:

```bash
git diff --check
git status -sb
```

Grammar/editor slice:

```bash
# focused smoke/test added or identified by the slice
cd editors/vscode && npm run build
git checkout -- editors/vscode/out/extension.js editors/vscode/out/lsp-server.js || true
git diff --check
```

LSP/editor semantic slice:

```bash
npm test -- --selectProjects unit --runTestsByPath <focused-tests> --runInBand
npm run build
cd editors/vscode && npm run build
git checkout -- editors/vscode/out/extension.js editors/vscode/out/lsp-server.js || true
git diff --check
```

Packaging slice:

```bash
npm run build
cd editors/vscode && npm run package
# inspect VSIX contents with unzip/list command
git diff --check
```
