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

Evidence inventory helper (metadata only):

```bash
npm --silent run report:release-evidence
```

This command writes a local JSON summary of required evidence labels, local/static command inventory, and live-oracle metadata.
It is intended for release evidence tracking only and does not produce proof by itself.

Expected meaning:

- `build` proves the TypeScript/package entrypoints compile.
- unit/static tests prove compiler, validator, artifact, and golden contracts.
- `test:mc-core` is offline-safe; skipped live cases are not runtime proof.
- `gate:lir-local-copy` is evidence-only; local-copy/RMW remains experimental/manual opt-in.

## Live Paper evidence

Run the core oracle only when an existing Paper/TestHarness server and `MC_SERVER_DIR` are configured. Run the lifecycle oracle from a local Paper template while port `25561` is free:

```bash
curl -fsS --max-time 5 "http://${MC_HOST:-localhost}:${MC_PORT:-25561}/status"
MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live
MC_P9_TEMPLATE_DIR="${MC_P9_TEMPLATE_DIR:-$HOME/mc-test-server}" npm run test:mc-lifecycle:live
MC_P9_VERSION_CHANNEL=paper-26.2 MC_P9_TEMPLATE_DIR="${MC_P9_26_2_TEMPLATE_DIR:-$HOME/mc-test-server-26.2}" npm run test:mc-lifecycle:live
```

Meaning:

- `test:mc-core:live` produces `live-paper-oracle` proof for individual core runtime behaviors against an already-running harness.
- `test:mc-lifecycle:live` produces `live-paper-lifecycle` proof from a disposable world across pack load, `/reload`, canonical commands execution, graceful restart, and world reopen.
- Static validation and offline skips produce neither label.

GitHub workflow and release evidence artifact:

- `.github/workflows/live-mc-core.yml` must exist and document that it is manual/nightly.
- Use workflow-scope variables for the existing core host/port/server directory and the managed `MC_P9_TEMPLATE_DIR`.
- Each oracle must skip clearly when its own environment is unavailable; explicit workflow inputs may make either absence fatal.
- Upload `build/p9-live-report.json` and `build/p9-live-report-26.2.json` when their managed lifecycle lanes run.
- Current core local baseline from 2026-06-30 is `26/26` live-cases (`test:mc-core:live`), descriptor-driven and covering the timer countdown plus first P1 world/inventory/random/spawn/particle/visual-UI smokes.
- Current lifecycle baselines from 2026-08-02 are independently `13/13` on Paper 1.21.4 and Paper 26.2, both including the verified air-only void fixture and `y=63` floor; exact hashes and phase evidence are committed under `docs/evidence/p9-live-minecraft-{1.21.4,26.2}.{md,json}`.
- Visual/UI boundary tranche (`visual command boundary smoke`) is included in the local live proof baseline for title/playsound/bossbar command execution.

Smoke suite availability:

- `smoke:package` smoke verifies package install/pack integrity.
- `smoke:browser-ide` smoke verifies browser IDE compiler load and tiny compile path.

Use `npm --silent run report:release-evidence` to publish the local/static evidence inventory used by the release checklist.

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
