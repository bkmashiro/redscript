#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')

const PROGRAM = '@load fn init() { say("release smoke"); }'
const NAMESPACE = 'release_smoke'
const NPM_CACHE_DIR = path.join(os.tmpdir(), 'redscript-smoke-npm-cache')

fs.mkdirSync(NPM_CACHE_DIR, { recursive: true })

function fail(message, error) {
  if (error?.message) console.error(error.message)
  console.error(message)
  process.exit(1)
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

    if (!Array.isArray(entries)) entries = [entries]
    const filename = entries[0]?.filename
    if (!filename) throw new Error('`npm pack` returned no tarball filename')
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

function main() {
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

    const requiredArtifactExports = [
      'createDatapackArtifactGraph',
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

main()
