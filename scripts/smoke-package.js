#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')
const { readPackEntry, assertPackFilePolicy } = require('./npm-pack-entry')

const PROGRAM = '@load fn init() { say("release smoke"); }'
const NAMESPACE = 'release_smoke'
const NPM_CACHE_DIR = path.join(os.tmpdir(), 'redscript-smoke-npm-cache')

function fail(message, error) {
  if (error?.message) console.error(error.message)
  console.error(message)
  process.exitCode = 1
}

function runCommand(command, args, options = {}) {
  const result = childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, npm_config_cache: NPM_CACHE_DIR },
    ...options,
  })
  return result ?? ''
}

function runCommandCapture(command, args, options = {}) {
  return childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, npm_config_cache: NPM_CACHE_DIR },
    ...options,
  })
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function packPackage() {
  const workspaceDir = process.cwd()
  const packDir = makeTempDir('redscript-smoke-pack-')
  try {
    const output = runCommandCapture(
      'npm',
      ['pack', '--pack-destination', packDir, '--silent', '--json'],
      { cwd: workspaceDir },
    ).trim()

    let entries
    try {
      entries = JSON.parse(output)
    } catch {
      const fallback = output.match(/([^\s]+\.tgz)/)
      if (!fallback) throw new Error('Could not parse `npm pack --json` output')
      entries = [{ filename: fallback[1] }]
    }

    const entry = readPackEntry(entries)
    assertPackFilePolicy(entry)
    const { filename } = entry
    return { tarballPath: path.join(packDir, filename), cleanupDir: packDir }
  } catch (error) {
    fs.rmSync(packDir, { recursive: true, force: true })
    throw error
  }
}

function extractFiles(result) {
  if (Array.isArray(result)) return result
  if (result && Array.isArray(result.files)) return result.files
  return []
}

function hasRequiredFiles(files) {
  const hasPackMeta = files.some((file) => file.path === 'pack.mcmeta')
  const hasInit = files.some((file) => {
    const filePath = String(file.path ?? '')
    return filePath.endsWith('init.mcfunction')
  })
  if (!hasPackMeta) {
    throw new Error('missing pack.mcmeta in compiler output')
  }
  if (!hasInit) {
    throw new Error('missing init.mcfunction in compiler output')
  }
}

function assertV4CompilerContracts(compile) {
  const numeric = extractFiles(compile('@load fn init() { scoreboard_set("#value", "package_numeric", -7 / 3); }', { namespace: 'package_numeric' }))
  const init = numeric.find(file => file.path === 'data/package_numeric/function/init.mcfunction')
  if (!init?.content.includes('#value package_numeric -3')) throw new Error('Installed compiler has stale integer division semantics')
  const cooldown = extractFiles(compile('import cooldown; fn probe(now: int): bool { return cooldown_ready(cooldown_start(now, 5), now); }', { namespace: 'package_cooldown' }))
  if (!cooldown.some(file => file.path.endsWith('/probe.mcfunction'))) throw new Error('Installed stdlib cooldown did not compile')
  const periodic = extractFiles(compile('@tick(rate=5) fn pulse() { say("tick"); }', { namespace: 'package_periodic' }))
  const tag = periodic.find(file => file.path === 'data/minecraft/tags/function/tick.json')
  const roots = tag ? JSON.parse(tag.content).values : []
  if (!Array.isArray(roots) || roots.length !== 1 || typeof roots[0] !== 'string'
    || !roots[0].startsWith('package_periodic:') || roots.includes('package_periodic:pulse')
    || !periodic.some(file => file.path === `data/package_periodic/function/${roots[0].split(':')[1]}.mcfunction`)) {
    throw new Error('Installed compiler ignores periodic tick rates or omitted its dispatcher')
  }
  for (const lenient of [false, true]) {
    let rejected = false
    try { compile('@throttle(ticks=5) fn old() {}', { namespace: 'package_retirement', lenient }) }
    catch (error) { if (!String(error).includes('@throttle was removed')) throw error; rejected = true }
    if (!rejected) throw new Error('Installed compiler still accepts retired @throttle syntax')
  }
}

function main() {
  fs.mkdirSync(NPM_CACHE_DIR, { recursive: true })
  const tempDir = makeTempDir('redscript-smoke-project-')
  const projectDir = path.join(tempDir, 'project')
  fs.mkdirSync(projectDir, { recursive: true })

  let packagePath
  let finalCleanupDir = tempDir

  try {
    runCommand('npm', ['init', '-y'], { cwd: projectDir, stdio: 'ignore' })

    const { tarballPath } = packPackage()
    packagePath = tarballPath

    runCommand(
      'npm',
      ['install', '--no-save', '--no-audit', '--no-fund', tarballPath],
      { cwd: projectDir },
    )

    const redscriptPath = path.join(projectDir, 'node_modules', 'redscript-mc')
    const compilerPackage = require(redscriptPath)
    const compile = compilerPackage?.compile
    if (typeof compile !== 'function') {
      throw new Error('Installed package did not expose a compile function')
    }

    const packageJson = require(path.join(redscriptPath, 'package.json'))
    const result = compile(PROGRAM, { namespace: NAMESPACE })
    const files = extractFiles(result)
    if (!files.length) {
      throw new Error('compile() returned no files')
    }

    hasRequiredFiles(files)
    assertV4CompilerContracts(compile)

    const requiredArtifactExports = [
      'createDatapackArtifactGraph',
      'createResourceArtifact',
      'generatedDatapackArtifacts',
      'projectLegacyDatapackFiles',
      'resolveResourceDescriptor',
      'createTagResourceArtifact',
      'createRecipeResourceArtifact',
      'createAdvancementResourceArtifact',
      'createPredicateResourceArtifact',
      'createLootTableResourceArtifact',
      'createItemModifierResourceArtifact',
      'writeArtifactDirectoryAtomically',
      'writeArtifactZipAtomically',
    ]
    for (const exportName of requiredArtifactExports) {
      if (typeof compilerPackage[exportName] !== 'function') {
        throw new Error(`Installed package did not expose ${exportName}`)
      }
    }
    const artifactGraph = compilerPackage.createDatapackArtifactGraph(
      compilerPackage.generatedDatapackArtifacts(files, compilerPackage.DEFAULT_MC_VERSION),
      {
        minecraftVersion: compilerPackage.DEFAULT_MC_VERSION,
        localNamespaces: [NAMESPACE],
      },
    )
    if (artifactGraph.artifacts.length !== files.length) {
      throw new Error('installed artifact API did not preserve legacy file count')
    }
    if (compilerPackage.resolveResourceDescriptor('recipe', compilerPackage.McVersion.v1_21).directory !== 'recipe') {
      throw new Error('installed registry descriptor API returned the wrong modern recipe path')
    }
    const dimensionArtifact = compilerPackage.createResourceArtifact({
      kind: 'dimension',
      id: 'release_smoke:moon',
      content: JSON.stringify({ type: 'minecraft:overworld', generator: {} }),
      provenance: { kind: 'generated', stage: 'package-smoke' },
      minecraftVersion: compilerPackage.McVersion.v1_21_4,
    })
    if (dimensionArtifact.outputPath !== 'data/release_smoke/dimension/moon.json'
      || dimensionArtifact.lifecycle !== 'world_reopen') {
      throw new Error('installed dimension descriptor returned the wrong path or lifecycle')
    }
    const tagArtifact = compilerPackage.createTagResourceArtifact({
      kind: 'item_tag',
      id: 'release_smoke:foods',
      policy: 'merge',
      values: [{ kind: 'value', id: 'minecraft:apple' }],
      provenance: { kind: 'generated', stage: 'package-smoke' },
      minecraftVersion: compilerPackage.McVersion.v1_21,
    })
    if (tagArtifact.outputPath !== 'data/release_smoke/tags/item/foods.json') {
      throw new Error('installed typed tag builder returned the wrong resource path')
    }
    if (JSON.parse(tagArtifact.content.toString('utf8')).values[0] !== 'minecraft:apple') {
      throw new Error('installed typed tag builder returned the wrong canonical content')
    }
    const builderCommon = {
      provenance: { kind: 'generated', stage: 'package-smoke' },
      minecraftVersion: compilerPackage.McVersion.v1_21_4,
    }
    const typedArtifacts = [
      compilerPackage.createRecipeResourceArtifact({
        ...builderCommon,
        id: 'release_smoke:toast',
        recipe: { kind: 'shapeless', ingredients: [{ item: 'minecraft:bread' }], result: { id: 'minecraft:bread' } },
      }),
      compilerPackage.createAdvancementResourceArtifact({
        ...builderCommon,
        id: 'release_smoke:root',
        advancement: { criteria: { tick: { trigger: 'minecraft:tick' } } },
      }),
      compilerPackage.createPredicateResourceArtifact({
        ...builderCommon,
        id: 'release_smoke:always',
        predicate: { kind: 'leaf', condition: 'minecraft:random_chance', fields: { chance: 1 } },
      }),
      compilerPackage.createLootTableResourceArtifact({
        ...builderCommon,
        id: 'release_smoke:empty',
        lootTable: { pools: [] },
      }),
      compilerPackage.createItemModifierResourceArtifact({
        ...builderCommon,
        id: 'release_smoke:count',
        modifier: { function: 'minecraft:set_count', fields: { count: 1 } },
      }),
    ]
    if (typedArtifacts.some(artifact => artifact.mediaType !== 'application/json' || artifact.content.length === 0)) {
      throw new Error('installed selective typed resource builders returned invalid artifacts')
    }

    console.log(
      `release package smoke OK v${packageJson.version} files=${files.length} artifacts=${artifactGraph.artifacts.length}`,
    )

  } catch (error) {
    fail('package smoke failed', error)
  } finally {
    if (packagePath) {
      fs.rmSync(path.dirname(packagePath), { recursive: true, force: true })
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

if (require.main === module) main()
module.exports = { assertV4CompilerContracts, main }
