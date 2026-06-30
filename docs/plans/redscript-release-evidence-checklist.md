# RedScript Release Evidence Checklist

Use this checklist before tagging/publishing a release. It separates compiler correctness evidence from packaging/deployment automation.

## Required local/static evidence

```bash
npm run build
npm test -- --selectProjects unit --runInBand
npm run validate-mc
npm run test:mc-core
npm run gate:lir-local-copy -- --output /tmp/redscript-release-lir-local-copy.json
npm run smoke:package
npm run smoke:browser-ide -- --ide-dir /Users/yuzhe/projects/redscript-ide
git diff --check
```

Expected meaning:

- `build` proves the TypeScript/package entrypoints compile.
- unit/static tests prove compiler, validator, artifact, and golden contracts.
- `test:mc-core` is offline-safe; skipped live cases are not runtime proof.
- `gate:lir-local-copy` is evidence-only; local-copy/RMW remains experimental/manual opt-in.

## Live Paper evidence

Run only when a Paper/TestHarness server and `MC_SERVER_DIR` are configured:

```bash
curl -fsS --max-time 5 "http://${MC_HOST:-localhost}:${MC_PORT:-25561}/status"
MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live
```

Meaning: only this produces `live-paper-oracle` proof for core runtime behavior.

GitHub workflow and release evidence artifact:

- `.github/workflows/live-mc-core.yml` must exist and document that it is manual/nightly.
- Use workflow-scope variables for host/port/server directory.
- The workflow should skip clearly when `MC_SERVER_DIR` is not set.
- Current local baseline from 2026-06-30 is `24/24` live-cases (`test:mc-core:live`), descriptor-driven and covering the timer countdown plus first P1 world/inventory/random/spawn smokes.

Smoke suite availability:

- `smoke:package` smoke verifies package install/pack integrity.
- `smoke:browser-ide` smoke verifies browser IDE compiler load and tiny compile path.

## Package tarball smoke

```bash
npm run smoke:package
```

## Browser IDE compiler-load smoke

The online IDE bundles `redscript-mc` for a browser target with Node builtins stubbed. Before deploying a compiler update, verify the bundle can initialize and compile a tiny program:

```bash
npm run smoke:browser-ide -- --ide-dir /Users/yuzhe/projects/redscript-ide
```

If the deployed site shows `Cannot read properties of undefined (reading 'compileRedScript')`, first check whether `public/compiler.js` failed during module initialization. A common regression is importing Node-only helpers during top-level compiler module load.

## README/docs claim smoke

- Compile the README quick-start source if it changes.
- Do not claim `static-mc-validation` or `golden-artifact-shape` as live Minecraft proof.
- Run `npm run docs:check` only when generated docs/reference docs are intentionally touched and `~/projects/redscript-docs` is available.

## Publish automation evidence

- npm package publish and VSCode extension publish are separate workflow results.
- Their success proves distribution automation, not compiler semantics.
- Do not commit generated VSCode/package output unless the slice is specifically about packaging artifacts.
