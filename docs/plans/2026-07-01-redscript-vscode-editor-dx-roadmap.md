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

### H — VSIX package smoke — NEXT

Goal: the extension artifact contains the LSP, grammar, snippets, and declaration surface.

Tasks:

- [ ] H1. Add/verify package content smoke for VSIX contents.
- [ ] H2. Confirm `out/lsp-server.js`, `builtins.d.mcrs`, snippets, and grammar are packaged.
- [ ] H3. Keep package smoke separate from Web IDE smoke.

Suggested Spark slice for H:

```text
In /Users/yuzhe/projects/redscript, implement Track H only: VSIX package smoke.

Allowed files:
- editors/vscode/package.json only if a package script already exists and needs a non-version smoke hook
- scripts or focused tests for package-content smoke if a suitable existing pattern exists
- docs/plans/2026-07-01-redscript-vscode-editor-dx-roadmap.md for checkbox/evidence update only

Forbidden:
- Do not edit compiler parser/typechecker/emit semantics.
- Do not edit package versions or lockfiles.
- Do not permanently commit generated editors/vscode/out/* unless package smoke explicitly requires a temporary build artifact and it is reverted before commit.
- Do not claim Web IDE smoke or live Paper proof.
- Do not commit or push from Spark.

Acceptance:
- Build/package the VSCode extension or inspect a generated VSIX in a temporary location.
- Verify the VSIX/package content includes the extension entrypoint/LSP server, grammar files, snippets, and declaration surface (`builtins.d.mcrs`).
- Keep this as package-content evidence only, separate from Web IDE/browser smoke.
- Run the focused package smoke, `npm run build` if root outputs are relevant, `cd editors/vscode && npm run build` or package command as needed, revert generated `editors/vscode/out/*`, and `git diff --check`.

Return:
1. Changed files
2. What changed
3. Exact commands and results
4. Blockers/uncertainties
```

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
