# RedScript VSCode Editor DX Working Goal

Use this file as the active goal prompt for the next RedScript VSCode editor-DX work session.

## Context

Repo: `/Users/yuzhe/projects/redscript`

A–E are already done enough to stop tracking them here:

- Stale editor docs/snippets/examples were audited and partially cleaned.
- Resource/context-aware completion exists for particle/effect/selectors, with static/editor catalog caveats.
- Semantic hover exists for builtins, decorators, selectors, resources, and `#objective`; this is static/editor guidance, not live Paper proof.
- Signature help exists for typed-resource builtins, scoreboard objectives, user/`declare fn` functions, and active parameter calculation; this is static/editor/LSP evidence, not live Paper proof.
- Generated VSCode `out/*` build artifacts should be reverted unless a release/package slice explicitly wants them.

## Operating rules

- Work on `main` in `/Users/yuzhe/projects/redscript`.
- Check `git status -sb` before editing. Do not overwrite uncommitted user work.
- Prefer Spark for bounded implementation slices; controller owns review, gates, commits, push, and CI status.
- Do not claim static/editor evidence as live Paper/Minecraft proof.
- Keep TextMate grammar visual/syntactic only; do not encode compiler semantic validity in grammar.
- After each verified slice: update this file, run the relevant gates, make a signed commit, push, then check current-head CI once.
- Revert generated `editors/vscode/out/*` unless the slice is explicitly packaging/release.

## Active work order

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

### G — Migration quick fixes — NEXT

Goal: old RedScript idioms are easy to migrate safely.

Tasks:

- [ ] G1. Preserve/verify existing `type=zombie` → `type=minecraft:zombie` quick fix.
- [ ] G2. Add string objective → `#objective` quick fix in scoreboard contexts.
- [ ] G3. Add quoted known resource → unquoted `minecraft:path` quick fix in typed resource contexts.
- [ ] G4. Add deprecated `float` / old interpolation suggestions only where safe; avoid destructive false positives.

Suggested Spark slice for G:

```text
In /Users/yuzhe/projects/redscript, implement Track G only: migration quick fixes.

Allowed files:
- editors/vscode/src/codeactions.ts
- focused tests/smokes for VSCode code actions if a suitable pattern exists
- docs/plans/2026-07-01-redscript-vscode-editor-dx-roadmap.md for checkbox/evidence update only

Forbidden:
- Do not edit compiler parser/typechecker/emit semantics.
- Do not edit package versions or lockfiles.
- Do not edit generated editors/vscode/out/* permanently.
- Do not claim live Paper proof.
- Do not commit or push from Spark.

Acceptance:
- Preserve/verify existing `type=zombie` → `type=minecraft:zombie` quick fix.
- Add safe code actions for string scoreboard objectives and quoted known resources only in clearly-detected contexts.
- Deprecated `float` / old interpolation suggestions must avoid destructive false positives; leave as TODO if safe context detection is unclear.
- Run focused tests/smokes if added, plus `cd editors/vscode && npm run build`, plus `git diff --check`.

Return:
1. Changed files
2. What changed
3. Exact commands and results
4. Blockers/uncertainties
```

### H — VSIX package smoke

Goal: the extension artifact contains the LSP, grammar, snippets, and declaration surface.

Tasks:

- [ ] H1. Add/verify package content smoke for VSIX contents.
- [ ] H2. Confirm `out/lsp-server.js`, `builtins.d.mcrs`, snippets, and grammar are packaged.
- [ ] H3. Keep package smoke separate from Web IDE smoke.

### I — CI/release integration

Goal: editor-DX regressions fail cheaply and release automation remains stable.

Tasks:

- [ ] I1. Inspect existing Actions coverage for VSCode build/package.
- [ ] I2. Add a cheap editor-DX gate only if missing and low-risk.
- [ ] I3. After each push, perform one-shot `gh run list --commit <HEAD>` and report current HEAD status.

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
