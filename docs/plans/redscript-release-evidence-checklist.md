# RedScript Release Evidence Checklist

Use this checklist before tagging/publishing a release. It separates compiler correctness evidence from packaging/deployment automation.

## Required local/static evidence

```bash
npm run build
npm test -- --selectProjects unit --runInBand
npm run validate-mc
npm run test:mc-core
npm run gate:lir-local-copy -- --output /tmp/redscript-release-lir-local-copy.json
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

GitHub workflow:

- `.github/workflows/live-mc-core.yml` is manual/nightly.
- It skips clearly when no harness/server directory is configured.
- Set repository variables `MC_HOST`, `MC_PORT`, and `MC_SERVER_DIR` for a runner that can reach and write to the server.

## Package tarball smoke

```bash
npm pack --pack-destination /tmp
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"
npm init -y >/dev/null
npm install /tmp/redscript-mc-*.tgz
node - <<'NODE'
const { compile } = require('redscript-mc')
const result = compile('@load fn init() { say("release smoke"); }', { namespace: 'release_smoke' })
if (!result.files.some(file => file.path === 'pack.mcmeta')) throw new Error('missing pack.mcmeta')
if (!result.files.some(file => file.path.endsWith('init.mcfunction'))) throw new Error('missing init function')
console.log('release package smoke OK')
NODE
```

## Browser IDE compiler-load smoke

The online IDE bundles `redscript-mc` for a browser target with Node builtins stubbed. Before deploying a compiler update, verify the bundle can initialize and compile a tiny program:

```bash
cd ~/projects/redscript-ide
npm install ../redscript --save
npm run build
node - <<'NODE'
const fs = require('fs')
const vm = require('vm')
const code = fs.readFileSync('public/compiler.js', 'utf8')
const ctx = { console }
ctx.globalThis = ctx
ctx.window = ctx
vm.createContext(ctx)
vm.runInContext(code, ctx, { filename: 'compiler.js' })
const result = ctx.RedScriptCompiler.compileRedScript('@load fn init() { say("ide smoke"); }')
if (!result.ok) throw new Error(result.error)
if (!result.files.some(file => file.path === 'pack.mcmeta')) throw new Error('missing pack.mcmeta')
console.log('browser compiler smoke OK')
NODE
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
