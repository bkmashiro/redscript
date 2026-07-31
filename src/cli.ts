#!/usr/bin/env node
/**
 * RedScript CLI
 *
 * Usage:
 *   redscript compile <file> [-o <out>] [--namespace <ns>]
 *   redscript check <file>
 *   redscript init [project-name]
 *   redscript repl
 *   redscript version
 */

import { compile, createCompilerSession, checkDetailed, Lexer, Parser, type CompileStageName, type CompileStageSnapshot } from './index'
import type { FnDecl, TypeNode } from './ast/types'
import { DiagnosticError, formatError } from './diagnostics'
import { parseMcVersion, DEFAULT_MC_VERSION, McVersion, mcVersionToPackFormat } from './types/mc-version'
import { startRepl } from './repl'
import { generateDts } from './builtins/metadata'
import { FileCache } from './cache/index'
import { DependencyGraph } from './cache/deps'
import { compileIncremental } from './cache/incremental'
import { lintFile, formatLintWarning } from './lint/index'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { execSync } from 'child_process'
import { loadProjectConfig, buildTomlTemplate } from './config/project-config'
import { loadProject, ProjectManifestError, resolveBuildTarget } from './project/manifest'
import { loadProjectModuleGraph, type ProjectModuleGraph } from './project/module-graph'
import type { BuildTarget, LoadedProject } from './project/model'
import { docsCommand } from './docs'
import { applyCheckFixes } from './check-fix'
import { deriveNamespace, parseArgs, sanitizeProjectName } from './cli/args'
import { runTunerCli } from './tuner/cli'
import { analyzeProjectTarget } from './compiler/project-target-analysis'
import { resolveProjectDependencies } from './project/dependency-resolver'
import {
  createDatapackArtifactGraph,
  generatedDatapackArtifacts,
  withPackDescription,
  writeArtifactDirectoryAtomically,
  writeArtifactZipAtomically,
} from './artifacts'

// Parse command line arguments
const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
RedScript Compiler v2

Usage:
  redscript compile <file> [-o <out>] [--namespace <ns>] [--incremental]
  redscript publish <file> [-o <out.zip>] [--target <name>] [--namespace <ns>] [--mc-version <ver>]
  redscript watch <dir> [-o <outdir>] [--namespace <ns>] [--hot-reload <url>]
  redscript test <file> [--dry-run] [--mc-url <url>]
  redscript check <file> [--fix]
  redscript lint <file> [--max-function-lines <n>]
  redscript project [path] [--format human|json]
  redscript resolve [path] [--format human|json]
  redscript graph [path] --capabilities [--target <name>] [--format human|json]
  redscript init [project-name]
  redscript fmt <file.mcrs> [file2.mcrs ...]
  redscript declarations <file> [-o <file.d.mcrs>]
  redscript generate-dts [-o <file>]
  redscript docs [module] [--list]
  redscript tune --adapter <name> [--budget N] [--range min:max] [--samples N] [--out path] [--manifest-out path]
  redscript repl
  redscript version

Commands:
  compile       Compile a RedScript file to a Minecraft datapack
  publish       Compile and package the datapack as a .zip (ready to install in Minecraft)
  watch         Watch a directory for .mcrs file changes, recompile, and hot reload
  test          Compile and run @test-annotated functions as tests
  check         Check a RedScript file for errors without generating output
  lint          Statically analyze a RedScript file for potential issues (warnings)
  project       Inspect the nearest redscript.toml and resolved build targets
  resolve       Resolve Git dependencies into redscript.lock and the immutable cache
  graph         Inspect target reachability and required capabilities
  init          Scaffold a new RedScript datapack project
  fmt           Auto-format RedScript source files
  declarations  Generate a .d.mcrs declaration surface from exported APIs
  generate-dts  Generate builtin function declaration file (builtins.d.mcrs)
  docs          Open the stdlib documentation website in your browser
  tune          Tune numeric stdlib helper parameters and generate a reviewable .mcrs overlay
  repl          Start an interactive RedScript REPL
  version       Print the RedScript version
  upgrade       Upgrade to the latest version (npm install -g redscript-mc@latest)

Options:
  -o, --output <path>    Output directory or file path
  --namespace <ns>       Datapack namespace (default: derived from filename)
  --hot-reload <url>     After each successful compile, POST to <url>/reload
                         (use with redscript-testharness; e.g. http://localhost:25561)
  --source-map           Generate .sourcemap.json files alongside .mcfunction output
  --snapshot-stages <s>  Comma-separated compile stages to snapshot, or "all"
  --snapshot-output <p>  Write selected compile stage snapshots to JSON file
  --adapter <name>       (tune) Tuner adapter to run
  --budget <N>           (tune) Optimizer iteration budget
  --strategy <nm|sa>     (tune) Search strategy: Nelder-Mead or simulated annealing
  --range <min:max>      (tune) Override adapter sample range for this tune run
  --samples <N>          (tune) Evenly spaced sample count for --range
  --manifest-out <path>  (tune) Write machine-readable tune manifest JSON
  --mc-version <ver>     Target Minecraft version (default: 1.21). Affects codegen features.
                         e.g. --mc-version 26.2, --mc-version 1.21.4
  --target <name>        Select a named build target from redscript.toml
  --capabilities         (graph) Include target capability requirements and diagnostics
  --lenient              Treat type errors as warnings instead of blocking compilation
  --include <dir>        Add a directory to the import search path (repeatable)
  --incremental          Enable file-level incremental compilation cache
  --experimental-lir-local-copy-rewrite
                        EXPERIMENTAL manual opt-in for local-copy/LIR rewrites
                        (off by default; not a default/production path)
  --fix                  (check) Apply safe auto-fixes for lint-detected issues
  --dry-run              (test) Verify compilation only — no MC server connection needed
  --mc-url <url>         (test) MC server HTTP API URL for running tests live
  -h, --help             Show this help message
`)
}

function getLocalVersion(): string {
  const packagePath = path.join(__dirname, '..', 'package.json')
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function printVersion(): void {
  console.log(`RedScript v${getLocalVersion()}`)
}

/** Fetch latest version from npm registry (non-blocking, best-effort). */
function fetchLatestVersion(): Promise<string | null> {
  return new Promise(resolve => {
    const req = https.get(
      'https://registry.npmjs.org/redscript-mc/latest',
      { timeout: 3000 },
      res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve(json.version ?? null)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

/** Compare semver strings. Returns true if b > a. */
function isNewer(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [ca, cb, cc] = parse(current)
  const [la, lb, lc] = parse(latest)
  if (la !== ca) return la > ca
  if (lb !== cb) return lb > cb
  return lc > cc
}

/**
 * Check for a newer version and print a notice if one exists.
 * Runs in background — does NOT block normal CLI operation.
 */
async function checkForUpdates(silent = false): Promise<void> {
  const current = getLocalVersion()
  const latest = await fetchLatestVersion()
  if (latest && isNewer(current, latest)) {
    console.log(`\n💡 New version available: v${current} → v${latest}`)
    console.log(`   Run: redscript upgrade\n`)
  } else if (!silent && latest) {
    // Only print when explicitly running 'version' or 'upgrade'
    // No output for normal commands — keep startup noise-free
  }
}

/** Run npm install -g to upgrade to latest. */
function upgradeCommand(): void {
  const current = getLocalVersion()
  console.log(`Current version: v${current}`)
  console.log('Checking latest version...')

  fetchLatestVersion().then(latest => {
    if (!latest) {
      console.error('Could not fetch latest version from npm.')
      process.exit(1)
    }
    if (!isNewer(current, latest)) {
      console.log(`✅ Already up to date (v${current})`)
      return
    }
    console.log(`Upgrading v${current} → v${latest}...`)
    try {
      execSync('npm install -g redscript-mc@latest', { stdio: 'inherit' })
      console.log(`✅ Upgraded to v${latest}`)
    } catch {
      console.error('Upgrade failed. Try manually: npm install -g redscript-mc@latest')
      process.exit(1)
    }
  })
}

function buildInitFiles(namespace: string): Record<string, string> {
  return {
    'src/main.mcrs': `package ${namespace};

export fn main(): void {}

@load
fn setup(): void {
  say("Loaded ${namespace}");
}

@tick(rate=20)
fn heartbeat(): void {
  say("Tick from ${namespace}");
}
`,
    'redscript.toml': buildTomlTemplate(namespace),
    'redscript.config.json': `${JSON.stringify({
      namespace,
      entry: 'src/main.mcrs',
      outDir: 'dist/',
      mcVersion: '1.21.4',
    }, null, 2)}
`,
    '.gitignore': `dist/
.redscript-cache/
`,
    'README.md': `# ${namespace}

Minimal RedScript datapack scaffold.

## Quick Start

\`\`\`bash
redscript compile src/main.mcrs -o dist --namespace ${namespace}
\`\`\`

Then copy \`dist/\` into your world's datapacks folder and run \`/reload\`.

## Files

- \`src/main.mcrs\` contains \`@load\` and \`@tick\` examples.
- \`redscript.toml\` stores the project configuration (replaces CLI flags).
- \`redscript.config.json\` stores legacy project settings.
`,
  }
}

function initCommand(projectName?: string): void {
  const explicitName = projectName?.trim()
  const targetDir = explicitName
    ? path.resolve(process.cwd(), explicitName)
    : process.cwd()
  const namespaceSource = explicitName ? path.basename(targetDir) : path.basename(targetDir)
  const namespace = sanitizeProjectName(namespaceSource)

  if (!namespace) {
    console.error('Error: Project name must contain at least one letter or number')
    process.exit(1)
  }

  if (fs.existsSync(targetDir)) {
    const stat = fs.statSync(targetDir)
    if (!stat.isDirectory()) {
      console.error(`Error: Target path is not a directory: ${targetDir}`)
      process.exit(1)
    }
    if (explicitName && fs.readdirSync(targetDir).length > 0) {
      console.error(`Error: Target directory is not empty: ${targetDir}`)
      process.exit(1)
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const files = buildInitFiles(namespace)
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(targetDir, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
  }

  console.log(`✓ Initialized RedScript project in ${targetDir}`)
  console.log(`  Namespace: ${namespace}`)
  console.log('  Entry: src/main.mcrs')
}

const COMPILE_STAGE_NAMES: CompileStageName[] = [
  'preprocess',
  'parse',
  'runtimeAssets',
  'typecheck',
  'lowerToHIR',
  'runtimeMetadata',
  'lowerAndOptimize',
  'finalizeRuntimeLIR',
  'emitDatapack',
]

function parseSnapshotStages(value?: string): CompileStageName[] | undefined {
  if (!value) return undefined
  if (value === 'all') return [...COMPILE_STAGE_NAMES]

  const stages = value.split(',').map(stage => stage.trim()).filter(Boolean)
  const invalid = stages.filter(stage => !COMPILE_STAGE_NAMES.includes(stage as CompileStageName))
  if (invalid.length > 0) {
    throw new Error(`Unknown compile stage snapshot(s): ${invalid.join(', ')}. Valid stages: ${COMPILE_STAGE_NAMES.join(', ')}`)
  }
  return stages as CompileStageName[]
}

function writeStageSnapshots(
  outputPath: string,
  payload: { file: string; namespace: string; stages: CompileStageSnapshot[] },
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

interface AtomicOutputFile {
  path: string
  content: string
}

function writeOutputFilesAtomically(outputs: readonly AtomicOutputFile[]): void {
  const token = `.redscript-${process.pid}-${Date.now()}`
  const staged = outputs.map((output, index) => ({
    ...output,
    tempPath: `${output.path}${token}-${index}.tmp`,
    backupPath: `${output.path}${token}-${index}.bak`,
  }))
  const committed: typeof staged = []
  const backedUp: typeof staged = []

  try {
    for (const output of staged) {
      fs.mkdirSync(path.dirname(output.path), { recursive: true })
      fs.writeFileSync(output.tempPath, output.content, { flag: 'wx' })
    }
    for (const output of staged) {
      if (!fs.existsSync(output.path)) continue
      fs.renameSync(output.path, output.backupPath)
      backedUp.push(output)
    }
    for (const output of staged) {
      fs.renameSync(output.tempPath, output.path)
      committed.push(output)
    }
  } catch (error) {
    for (const output of committed) fs.rmSync(output.path, { recursive: true, force: true })
    for (const output of backedUp.reverse()) {
      if (fs.existsSync(output.backupPath)) fs.renameSync(output.backupPath, output.path)
    }
    for (const output of staged) fs.rmSync(output.tempPath, { force: true })
    throw error
  }

  // Once every destination rename succeeds, the new pair is committed. Failure
  // to clean a backup must not delete the newly committed artifacts.
  for (const output of backedUp) {
    try {
      fs.rmSync(output.backupPath, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup; a stale hidden backup is safer than data loss.
    }
  }
}

function commandTextOutputPath(output: string): string {
  return output.endsWith('.json') ? `${output.slice(0, -'.json'.length)}.txt` : `${output}.txt`
}

function compileCommand(
  file: string,
  output: string,
  namespace: string,
  sourceMap = false,
  mcVersionStr?: string,
  lenient = false,
  includeDirs?: string[],
  incremental = false,
  experimentalLirLocalCopyRewrite = false,
  snapshotStageSpec?: string,
  snapshotOutput?: string,
  projectSelection?: { project: LoadedProject; target: BuildTarget },
): void {
  // Read source file
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  let mcVersion = DEFAULT_MC_VERSION
  if (mcVersionStr) {
    try {
      mcVersion = parseMcVersion(mcVersionStr)
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`)
      process.exit(1)
    }
  }

  let snapshotStages: CompileStageName[] | undefined
  try {
    snapshotStages = parseSnapshotStages(snapshotStageSpec)
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`)
    process.exit(1)
  }

  const strictPackageProject = projectSelection?.target.compatibility === 'explicit'
  if (strictPackageProject) {
    const unsupported = [
      incremental && '--incremental',
      sourceMap && '--source-map',
      lenient && '--lenient',
      experimentalLirLocalCopyRewrite && '--experimental-lir-local-copy-rewrite',
      (snapshotStages || snapshotOutput) && '--snapshot-stages/--snapshot-output',
      includeDirs && includeDirs.length > 0 && '--include',
    ].filter(Boolean)
    if (unsupported.length > 0) {
      console.error(`Error: strict project package compilation does not yet support ${unsupported.join(', ')}`)
      process.exit(2)
    }
  }

  if (incremental && (snapshotStages || snapshotOutput)) {
    console.error('Error: --snapshot-stages/--snapshot-output are only supported for non-incremental compile')
    process.exit(1)
  }

  if (incremental && experimentalLirLocalCopyRewrite) {
    console.error('Error: --experimental-lir-local-copy-rewrite is not supported with --incremental')
    process.exit(1)
  }

  if (snapshotOutput && !snapshotStages) {
    console.error('Error: --snapshot-output requires --snapshot-stages')
    process.exit(1)
  }

  if (incremental) {
    const cacheDir = path.join(path.dirname(file), '.redscript-cache')
    const cache = new FileCache(cacheDir)
    cache.load()
    const depGraph = new DependencyGraph()

    const incResult = compileIncremental([file], cache, depGraph, {
      namespace,
      output,
      generateSourceMap: sourceMap,
      mcVersion,
      lenient,
      includeDirs,
    })
    if (incResult.errors.size > 0) {
      const [failedFile, errorMessage] = incResult.errors.entries().next().value as [string, string]
      const source = fs.existsSync(failedFile) ? fs.readFileSync(failedFile, 'utf-8') : ''
      console.error(formatError(new Error(errorMessage), source, failedFile))
      process.exit(1)
    }

    if (incResult.cached > 0) {
      const entry = cache.get(path.resolve(file))
      console.log(`✓ Reused cache for ${file}`)
      console.log(`  Namespace: ${namespace}`)
      console.log(`  Files: ${entry?.outputFiles?.length ?? 0}`)
      return
    }

    const compiled = incResult.results.get(path.resolve(file))
    console.log(`✓ Compiled ${file} to ${output}/`)
    console.log(`  Namespace: ${namespace}`)
    console.log(`  Files: ${compiled?.files.length ?? 0}`)
    return
  }

  const source = fs.readFileSync(file, 'utf-8')

  try {
    const stageSnapshots: CompileStageSnapshot[] = []
    const result = strictPackageProject && projectSelection
      ? createCompilerSession({
          project: projectSelection.project,
          target: projectSelection.target,
        }).compileProject({
          namespace,
          minecraftVersion: mcVersionStr,
        })
      : compile(source, {
          namespace,
          filePath: file,
          generateSourceMap: sourceMap,
          mcVersion,
          lenient,
          includeDirs,
          experimentalLirLocalCopyRewrite,
          snapshotStages,
          stageSnapshots: snapshotStages ? stageSnapshots : undefined,
        })

    if (snapshotOutput) {
      writeStageSnapshots(snapshotOutput, { file, namespace, stages: stageSnapshots })
    }

    for (const w of result.warnings) {
      console.error(`Warning: ${w}`)
    }

    if ('kind' in result && result.kind === 'commands') {
      const textOutput = commandTextOutputPath(output)
      writeOutputFilesAtomically([
        { path: output, content: result.manifestJson },
        { path: textOutput, content: result.textProjection },
      ])
      console.log(`✓ Compiled ${file} to ${output}`)
      console.log(`  Namespace: ${namespace}`)
      console.log(`  Command count: ${result.commandProgram.commandCount}`)
      console.log(`  Text projection: ${textOutput}`)
      return
    }

    if ('kind' in result && result.kind === 'datapack') {
      writeArtifactDirectoryAtomically(result.artifactGraph, output)
      console.log(`✓ Compiled ${file} to ${output}/`)
      console.log(`  Namespace: ${namespace}`)
      console.log(`  Artifacts: ${result.artifacts.length}`)
      return
    }

    // Legacy single-file adapter preserves its historical projection behavior.
    fs.mkdirSync(output, { recursive: true })
    for (const dataFile of result.files) {
      const filePath = path.join(output, dataFile.path)
      const dir = path.dirname(filePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, dataFile.content)
    }

    console.log(`✓ Compiled ${file} to ${output}/`)
    console.log(`  Namespace: ${namespace}`)
    console.log(`  Files: ${result.files.length}`)
  } catch (err) {
    console.error(formatError(
      err as Error,
      strictPackageProject ? undefined : source,
      strictPackageProject ? undefined : file,
    ))
    process.exit(1)
  }
}

interface CliDiagnostic {
  severity: 'warning' | 'error'
  kind: string
  code?: string
  message: string
  file?: string
  line?: number
  col?: number
}

function warningToDiagnostic(warning: string, defaultFile?: string): CliDiagnostic {
  const located = warning.match(/^\[([^\]]+)\]\s+(?:(.*?):)?line (\d+), col (\d+): (.+)$/)
  if (located) {
    return {
      severity: 'warning',
      kind: located[1],
      file: located[2] || defaultFile,
      line: Number(located[3]),
      col: Number(located[4]),
      message: located[5],
    }
  }

  const simple = warning.match(/^\[([^\]]+)\]\s+(.+)$/)
  if (simple) {
    return {
      severity: 'warning',
      kind: simple[1],
      message: simple[2],
      file: defaultFile,
    }
  }

  return {
    severity: 'warning',
    kind: 'Warning',
    message: warning,
    file: defaultFile,
  }
}

function errorToDiagnostic(error: DiagnosticError): CliDiagnostic {
  return {
    severity: 'error',
    kind: error.kind,
    code: error.code,
    message: error.message,
    file: error.location.file,
    line: error.location.line,
    col: error.location.col,
  }
}

function formatWarningHuman(diagnostic: CliDiagnostic): string {
  if (diagnostic.file && diagnostic.line && diagnostic.col) {
    return `${diagnostic.file}:${diagnostic.line}:${diagnostic.col}: warning: [${diagnostic.kind}] ${diagnostic.message}`
  }
  if (diagnostic.file) {
    return `${diagnostic.file}: warning: [${diagnostic.kind}] ${diagnostic.message}`
  }
  return `warning: [${diagnostic.kind}] ${diagnostic.message}`
}

function checkCommand(file: string, namespace?: string, outputFormat: 'human' | 'json' = 'human', fix = false): void {
  // Read source file
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  let source = fs.readFileSync(file, 'utf-8')

  const ns = namespace ?? deriveNamespace(file)
  let fixSummary: {
    removedUnusedImports: number
    removedDeadBranches: number
    annotatedMagicNumbers: number
  } | undefined
  if (fix) {
    try {
      const fixed = applyCheckFixes(source, file, ns)
      fixSummary = fixed.summary
      if (fixed.source !== source) {
        fs.writeFileSync(file, fixed.source, 'utf-8')
        source = fixed.source
      }
      if (outputFormat !== 'json') {
        console.log(`Applied fixes to ${file}`)
        console.log(`  Removed unused imports: ${fixed.summary.removedUnusedImports}`)
        console.log(`  Removed dead branches: ${fixed.summary.removedDeadBranches}`)
        console.log(`  Annotated magic numbers: ${fixed.summary.annotatedMagicNumbers}`)
      }
    } catch (err) {
      const error = err as Error
      if (err instanceof DiagnosticError) {
        console.error(formatError(error, source, file))
      } else {
        console.error(error.message)
      }
      process.exit(2)
    }
  }

  const result = checkDetailed(source, ns, file)
  const warnings = result.warnings.map(w => warningToDiagnostic(w, file))
  const errors = result.errors.map(errorToDiagnostic)
  const diagnostics = [...warnings, ...errors]
  const exitCode = errors.length > 0 ? 2 : warnings.length > 0 ? 1 : 0

  if (outputFormat === 'json') {
    console.log(JSON.stringify({
      file,
      namespace: ns,
      fixes: fixSummary,
      diagnostics,
      summary: {
        warnings: warnings.length,
        errors: errors.length,
      },
    }, null, 2))
  } else {
    for (const warning of warnings) {
      console.error(formatWarningHuman(warning))
    }

    for (const error of result.errors) {
      console.error(formatError(error, source, file))
    }

    if (exitCode === 0) {
      console.log('✓ No issues found')
    }
  }

  process.exit(exitCode)
}

function checkProjectCommand(
  file: string,
  project: LoadedProject,
  target: BuildTarget,
  namespaceOverride: string | undefined,
  outputFormat: 'human' | 'json',
  fix: boolean,
): void {
  if (fix) {
    console.error('Error: --fix is not supported for strict multi-file project packages')
    process.exit(2)
  }

  let warnings: CliDiagnostic[] = []
  let errors: DiagnosticError[] = []
  try {
    const result = createCompilerSession({ project, target }).compileProject({ namespace: namespaceOverride })
    warnings = result.warnings.map(warning => warningToDiagnostic(warning))
  } catch (error) {
    if (error instanceof DiagnosticError) {
      errors = [error]
    } else {
      const collected = (error as { diagnostics?: unknown }).diagnostics
      if (Array.isArray(collected) && collected.every(item => item instanceof DiagnosticError)) {
        errors = collected as DiagnosticError[]
      } else {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(2)
      }
    }
  }

  const diagnostics = [...warnings, ...errors.map(errorToDiagnostic)]
  const exitCode = errors.length > 0 ? 2 : warnings.length > 0 ? 1 : 0
  if (outputFormat === 'json') {
    console.log(JSON.stringify({
      file,
      namespace: namespaceOverride ?? target.namespace,
      diagnostics,
      summary: { warnings: warnings.length, errors: errors.length },
    }, null, 2))
  } else {
    for (const warning of warnings) console.error(formatWarningHuman(warning))
    for (const error of errors) console.error(formatError(error))
    if (exitCode === 0) console.log('✓ No issues found')
  }
  process.exit(exitCode)
}

async function hotReload(url: string): Promise<void> {
  try {
    const res = await fetch(`${url}/reload`, { method: 'POST' })
    if (res.ok) {
      console.log(`🔄 Hot reload sent → ${url}`)
    } else {
      console.warn(`⚠  Hot reload failed: HTTP ${res.status}`)
    }
  } catch (e) {
    console.warn(`⚠  Hot reload failed (is the server running?): ${(e as Error).message}`)
  }
}

function watchCommand(dir: string, output: string, namespace?: string, hotReloadUrl?: string): void {
  // Check if directory exists
  if (!fs.existsSync(dir)) {
    console.error(`Error: Directory not found: ${dir}`)
    process.exit(1)
  }

  const stat = fs.statSync(dir)
  if (!stat.isDirectory()) {
    console.error(`Error: ${dir} is not a directory`)
    process.exit(1)
  }

  console.log(`👁  Watching ${dir} for .mcrs file changes...`)
  console.log(`   Output: ${output}`)
  if (hotReloadUrl) console.log(`   Hot reload: ${hotReloadUrl}`)
  console.log(`   Incremental compilation enabled`)
  console.log(`   Press Ctrl+C to stop\n`)

  // Set up incremental compilation infrastructure
  const cacheDir = path.join(dir, '.redscript-cache')
  const cache = new FileCache(cacheDir)
  cache.load()
  const depGraph = new DependencyGraph()

  // Debounce timer
  let debounceTimer: NodeJS.Timeout | null = null

  // Compile all .mcrs files in directory (incrementally)
  async function compileAllIncremental(): Promise<void> {
    const files = findRsFiles(dir)
    if (files.length === 0) {
      console.log(`⚠  No .mcrs files found in ${dir}`)
      return
    }

    const incResult = compileIncremental(files, cache, depGraph, {
      namespace,
      output,
      includeDirs: undefined,
    })

    const timestamp = new Date().toLocaleTimeString()

    // Print warnings from recompiled files
    for (const [file, compileResult] of incResult.results) {
      for (const w of compileResult.warnings) {
        console.error(`Warning: ${w}`)
      }
      console.log(`✓ [${timestamp}] Compiled ${path.relative(dir, file)} (${compileResult.files.length} files)`)
    }

    if (incResult.cached > 0) {
      console.log(`  [${timestamp}] ${incResult.cached} file(s) unchanged (cached)`)
    }

    // Print errors
    for (const [file, errMsg] of incResult.errors) {
      console.error(`✗ [${timestamp}] ${path.relative(dir, file)}: ${errMsg}`)
    }

    // Persist cache
    cache.save()

    if (incResult.errors.size === 0 && hotReloadUrl) await hotReload(hotReloadUrl)
    console.log('')
  }

  // Find all .mcrs files recursively
  function findRsFiles(directory: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(directory, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory() && entry.name !== '.redscript-cache') {
        results.push(...findRsFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.mcrs')) {
        results.push(fullPath)
      }
    }

    return results
  }

  // Initial compile
  void compileAllIncremental()

  // Watch for changes
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.mcrs')) {
      // Debounce rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        console.log(`📝 Change detected: ${filename}`)
        void compileAllIncremental()
      }, 100)
    }
  })
}

/**
 * Read redscript.config.json from the given directory (if it exists).
 */
function readConfig(dir: string): Record<string, string> {
  const configPath = path.join(dir, 'redscript.config.json')
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      // ignore parse errors
    }
  }
  return {}
}

/**
 * publish command — compile then zip as a Minecraft datapack.
 */
async function publishCommand(
  file: string,
  outputZip: string,
  namespace: string,
  description: string,
  mcVersionStr: string | undefined,
  lenient = false,
  includeDirs?: string[],
  experimentalLirLocalCopyRewrite = false,
  projectSelection?: { project: LoadedProject; target: BuildTarget },
): Promise<void> {
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  let mcVersion = DEFAULT_MC_VERSION
  if (mcVersionStr) {
    try {
      mcVersion = parseMcVersion(mcVersionStr)
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`)
      process.exit(1)
    }
  }

  const source = fs.readFileSync(file, 'utf-8')
  const strictPackageProject = projectSelection?.target.compatibility === 'explicit'
  if (strictPackageProject) {
    const unsupported = [
      lenient && '--lenient',
      includeDirs && includeDirs.length > 0 && '--include',
      experimentalLirLocalCopyRewrite && '--experimental-lir-local-copy-rewrite',
    ].filter(Boolean)
    if (unsupported.length > 0) {
      console.error(`Error: strict project package publishing does not support ${unsupported.join(', ')}`)
      process.exit(2)
    }
  }

  try {
    let graph
    let warnings: readonly string[]
    if (strictPackageProject && projectSelection) {
      const result = createCompilerSession({
        project: projectSelection.project,
        target: projectSelection.target,
      }).compileProject({ namespace, minecraftVersion: mcVersionStr })
      if (result.kind !== 'datapack') {
        throw new Error(`Target '${projectSelection.target.name}' is '${result.kind}' and cannot be published as a datapack zip`)
      }
      graph = result.artifactGraph
      warnings = result.warnings
    } else {
      const result = compile(source, {
        namespace,
        filePath: file,
        generateSourceMap: false,
        mcVersion,
        lenient,
        includeDirs,
        experimentalLirLocalCopyRewrite,
      })
      graph = createDatapackArtifactGraph(
        generatedDatapackArtifacts(result.files, mcVersion),
        { minecraftVersion: mcVersion, localNamespaces: [namespace] },
      )
      warnings = result.warnings
    }

    for (const warning of warnings) console.error(`Warning: ${warning}`)
    graph = withPackDescription(graph, description)
    await writeArtifactZipAtomically(graph, outputZip)

    console.log(`✓ Published ${file} → ${outputZip}`)
    console.log(`  Namespace:   ${namespace}`)
    console.log(`  pack_format: ${mcVersionToPackFormat(mcVersion)}`)
    console.log(`  Artifacts:   ${graph.artifacts.length}`)
  } catch (err) {
    console.error(formatError(
      err as Error,
      strictPackageProject ? undefined : source,
      strictPackageProject ? undefined : file,
    ))
    process.exit(1)
  }
}

function declarationTypeToString(type: TypeNode): string {
  switch (type.kind) {
    case 'named':
      return type.name
    case 'resource':
      return `resource<${type.registry}>`
    case 'array':
      return `${declarationTypeToString(type.elem)}[]`
    case 'tuple':
      return `(${type.elements.map(declarationTypeToString).join(', ')})`
    case 'option':
      return `Option<${declarationTypeToString(type.inner)}>`
    case 'struct':
      return type.name
    case 'enum':
      return type.name
    default:
      return 'void'
  }
}

function declarationFnSignature(fn: FnDecl): string {
  const typeParams = fn.typeParams?.length ? `<${fn.typeParams.join(', ')}>` : ''
  const params = fn.params
    .map(param => `${param.name}: ${declarationTypeToString(param.type)}`)
    .join(', ')
  return `declare fn ${fn.name}${typeParams}(${params}): ${declarationTypeToString(fn.returnType)};`
}

function declarationLinesForFn(fn: FnDecl): string[] {
  const lines: string[] = []
  if (fn.doc) lines.push(fn.doc)
  lines.push(declarationFnSignature(fn))
  return lines
}

function generateDeclarationSurface(file: string, namespace?: string): string {
  const source = fs.readFileSync(file, 'utf-8')
  const effectiveNamespace = namespace ?? deriveNamespace(file)
  const checkResult = checkDetailed(source, effectiveNamespace, file)
  if (checkResult.errors.length > 0) {
    throw checkResult.errors[0]
  }

  const tokens = new Lexer(source).tokenize()
  const program = new Parser(tokens).parse(effectiveNamespace)
  const lines: string[] = [
    '// Generated by redscript declarations; do not edit by hand.',
  ]

  const publicFns = [
    ...(program.declarations ?? []).filter(fn => fn.isExported),
    ...(program.declaredFunctions ?? []).filter(fn => fn.isExported),
  ]
  for (const fn of publicFns) {
    lines.push(...declarationLinesForFn(fn))
  }
  for (const resource of program.resourceDeclarations ?? []) {
    if (resource.doc) lines.push(resource.doc)
    lines.push(`resource ${resource.registry} ${resource.id};`)
  }

  return `${lines.join('\n')}\n`
}

function declarationsCommand(file: string, output?: string, namespace?: string): void {
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  try {
    const declarationSurface = generateDeclarationSurface(file, namespace)
    const target = output ?? path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.d.mcrs`)
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true })
    fs.writeFileSync(target, declarationSurface, 'utf-8')
    console.log(`Generated ${target}`)
  } catch (err) {
    if (err instanceof DiagnosticError) {
      console.error(formatError(err))
    } else {
      console.error(`Error: ${(err as Error).message}`)
    }
    process.exit(1)
  }
}

function loadCliProjectTarget(startPath: string, targetName?: string): {
  project: LoadedProject
  target: BuildTarget
} | null {
  const project = loadProject(startPath)
  if (!project) {
    if (targetName) {
      throw new ProjectManifestError(
        path.join(path.resolve(startPath), 'redscript.toml'),
        `--target '${targetName}' requires a redscript.toml project manifest`,
      )
    }
    return null
  }
  return { project, target: resolveBuildTarget(project, targetName) }
}

function projectJson(project: LoadedProject, moduleGraph: ProjectModuleGraph): object {
  return {
    rootDir: project.rootDir,
    manifestPath: project.manifestPath,
    project: project.manifest.project,
    sourceRoots: project.sourceRoots,
    assets: project.assets,
    dependencies: [...project.dependencies.values()].sort((left, right) =>
      left.modulePath.localeCompare(right.modulePath),
    ),
    modules: moduleGraph.topologicalOrder.map(modulePath => {
      const loaded = moduleGraph.modules.get(modulePath)!
      return {
        modulePath,
        rootDir: loaded.project.rootDir,
        contentHash: loaded.contentHash,
      }
    }),
    dependencyHash: moduleGraph.dependencyHash,
    lockfile: project.dependencyContext?.lock
      ? {
          path: fs.realpathSync(project.dependencyContext.lockfilePath),
          schemaVersion: project.dependencyContext.lock.schemaVersion,
          dependencies: project.dependencyContext.lock.dependencies,
        }
      : undefined,
    defaultTarget: project.defaultTarget,
    targets: Object.values(project.targets).sort((left, right) => left.name.localeCompare(right.name)),
  }
}

function projectCommand(startPath: string, format: 'human' | 'json'): void {
  try {
    const project = loadProject(startPath)
    if (!project) {
      console.error(`Error: No redscript.toml found from ${path.resolve(startPath)}`)
      process.exit(2)
    }
    const moduleGraph = loadProjectModuleGraph(project)

    if (format === 'json') {
      console.log(JSON.stringify(projectJson(project, moduleGraph), null, 2))
      return
    }

    console.log(`Project: ${project.manifest.project.name}`)
    console.log(`  Root: ${project.rootDir}`)
    console.log(`  Module: ${project.manifest.project.modulePath}`)
    console.log(`  Namespace: ${project.manifest.project.namespace}`)
    console.log(`  Dependency hash: ${moduleGraph.dependencyHash}`)
    console.log(`  Modules:`)
    for (const modulePath of moduleGraph.topologicalOrder) {
      const loaded = moduleGraph.modules.get(modulePath)!
      console.log(`    ${modulePath}: ${loaded.project.rootDir}`)
    }
    console.log(`  Targets:`)
    for (const target of Object.values(project.targets).sort((left, right) => left.name.localeCompare(right.name))) {
      const marker = target.name === project.defaultTarget ? ' (default)' : ''
      console.log(`    ${target.name}: ${target.kind}${marker} -> ${target.outputPath}`)
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`)
    process.exit(error instanceof ProjectManifestError ? 2 : 1)
  }
}

async function resolveCommand(startPath: string, format: 'human' | 'json'): Promise<void> {
  try {
    const result = await resolveProjectDependencies(startPath)
    const output = {
      projectRoot: fs.realpathSync(result.project.rootDir),
      lockfilePath: fs.realpathSync(result.lockfilePath),
      schemaVersion: result.lock.schemaVersion,
      cacheDir: fs.existsSync(result.cacheDir)
        ? fs.realpathSync(result.cacheDir)
        : path.resolve(result.cacheDir),
      dependencies: result.lock.dependencies,
    }
    if (format === 'json') {
      console.log(JSON.stringify(output, null, 2))
      return
    }
    console.log(
      `Resolved ${output.dependencies.length} remote dependenc${output.dependencies.length === 1 ? 'y' : 'ies'}`,
    )
    console.log(`  Lock: ${output.lockfilePath}`)
    console.log(`  Cache: ${output.cacheDir}`)
    for (const dependency of output.dependencies) {
      console.log(
        `  ${dependency.modulePath}@${dependency.version} ${dependency.revision.slice(0, 12)} license=${dependency.license.declared ?? '<none>'}`,
      )
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`)
    process.exit(error instanceof ProjectManifestError ? 2 : 1)
  }
}

function graphCapabilitiesJson(project: LoadedProject, target: BuildTarget): object {
  const analysis = analyzeProjectTarget(project, target)
  const { plan } = analysis
  return {
    project: project.manifest.project.modulePath,
    dependencyHash: analysis.graph.dependencyHash,
    target: {
      name: target.name,
      kind: target.kind,
      entry: target.entry,
    },
    profile: {
      capabilities: plan.profile.capabilities,
    },
    compatible: analysis.diagnostics.length === 0,
    roots: plan.roots,
    reachableSymbols: plan.reachableSymbols,
    callGraph: plan.reachableSymbols.map(symbolId => ({
      symbolId,
      calls: plan.callGraph.get(symbolId) ?? [],
    })),
    requirements: plan.requirements.map(requirement => ({
      capability: requirement.capability,
      origin: requirement.origin,
      symbolId: requirement.symbolId,
      callChain: requirement.callChain,
      location: requirement.span && {
        file: requirement.span.file,
        line: requirement.span.line,
        col: requirement.span.col,
      },
    })),
    diagnostics: analysis.diagnostics.map(errorToDiagnostic),
  }
}

function graphCommand(
  startPath: string,
  targetName: string | undefined,
  format: 'human' | 'json',
): void {
  try {
    const selected = loadCliProjectTarget(startPath, targetName)
    if (!selected) {
      console.error(`Error: No redscript.toml found from ${path.resolve(startPath)}`)
      process.exit(2)
    }
    const payload = graphCapabilitiesJson(selected.project, selected.target) as {
      target: { name: string; kind: string; entry?: string }
      compatible: boolean
      roots: readonly string[]
      reachableSymbols: readonly string[]
      requirements: readonly { capability: string; origin: string; callChain: readonly string[] }[]
      diagnostics: readonly CliDiagnostic[]
    }
    if (format === 'json') {
      console.log(JSON.stringify(payload, null, 2))
      return
    }

    console.log(`Target: ${payload.target.name} (${payload.target.kind})`)
    console.log(`  Entry: ${payload.target.entry}`)
    console.log(`  Compatible: ${payload.compatible ? 'yes' : 'no'}`)
    console.log(`  Roots: ${payload.roots.join(', ')}`)
    console.log(`  Reachable symbols (${payload.reachableSymbols.length}):`)
    for (const symbol of payload.reachableSymbols) console.log(`    ${symbol}`)
    console.log(`  Requirements (${payload.requirements.length}):`)
    for (const requirement of payload.requirements) {
      const chain = requirement.callChain.length > 0 ? ` via ${requirement.callChain.join(' -> ')}` : ''
      console.log(`    ${requirement.capability}: ${requirement.origin}${chain}`)
    }
    for (const diagnostic of payload.diagnostics) {
      console.log(`  ${diagnostic.code ?? diagnostic.kind}: ${diagnostic.message}`)
    }
  } catch (error) {
    if (error instanceof DiagnosticError) console.error(formatError(error))
    else console.error(`Error: ${(error as Error).message}`)
    process.exit(error instanceof ProjectManifestError ? 2 : 1)
  }
}

// Main
const parsed = parseArgs(args)

async function main(): Promise<void> {
  if (parsed.help || !parsed.command) {
    printUsage()
    process.exit(parsed.help ? 0 : 1)
  }

  // Background update check — non-blocking, only shows notice if newer version exists
  // Skip for repl/upgrade/version to avoid double-printing
  const noCheckCmds = new Set(['upgrade', 'update', 'version', 'repl', 'docs', 'tune', 'resolve'])
  if (!process.env.REDSCRIPT_NO_UPDATE_CHECK && !noCheckCmds.has(parsed.command ?? '')) {
    checkForUpdates().catch(() => { /* ignore */ })
  }

  switch (parsed.command) {
    case 'compile':
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      {
        try {
          const fileDir = path.dirname(path.resolve(parsed.file))
          const selected = loadCliProjectTarget(fileDir, parsed.target)

          const namespace = parsed.namespace
            ?? selected?.target.namespace
            ?? deriveNamespace(parsed.file)
          const output = parsed.output
            ?? selected?.target.outputPath
            ?? './dist'
          const mcVersionStr = parsed.mcVersionStr ?? selected?.target.minecraftVersion
          const includeDirs = parsed.includeDirs
            ?? selected?.project.compiler.includeDirs

          compileCommand(
            parsed.file,
            output,
            namespace,
            parsed.sourceMap,
            mcVersionStr,
            parsed.lenient,
            includeDirs,
            parsed.incremental,
            parsed.experimentalLirLocalCopyRewrite,
            parsed.snapshotStages,
            parsed.snapshotOutput,
            selected ?? undefined,
          )
        } catch (error) {
          console.error(`Error: ${(error as Error).message}`)
          process.exit(error instanceof ProjectManifestError ? 2 : 1)
        }
      }
      break

    case 'publish': {
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      {
        try {
          const fileDir = path.dirname(path.resolve(parsed.file))
          const selected = loadCliProjectTarget(fileDir, parsed.target)
          const tomlConfig = loadProjectConfig(fileDir)
          const legacyConfig = readConfig(fileDir)

          const namespace = parsed.namespace
            ?? selected?.target.namespace
            ?? tomlConfig?.project?.namespace
            ?? legacyConfig.namespace
            ?? deriveNamespace(parsed.file)
          const description = parsed.description
            ?? selected?.project.manifest.project.description
            ?? tomlConfig?.project?.description
            ?? legacyConfig.description
            ?? `${namespace} datapack`
          const mcVersionStr = parsed.mcVersionStr
            ?? selected?.target.minecraftVersion
            ?? tomlConfig?.project?.['mc-version']
            ?? legacyConfig.mcVersion
          const includeDirs = parsed.includeDirs
            ?? selected?.project.compiler.includeDirs
            ?? tomlConfig?.compiler?.['include-dirs']

          const defaultZip = path.join(process.cwd(), `${namespace}.zip`)
          const outputZip = parsed.output
            ?? (tomlConfig?.output?.dir ? path.join(tomlConfig.output.dir, `${namespace}.zip`) : defaultZip)

          await publishCommand(
            parsed.file,
            outputZip,
            namespace,
            description,
            mcVersionStr,
            parsed.lenient,
            includeDirs,
            parsed.experimentalLirLocalCopyRewrite,
            selected ?? undefined,
          )
        } catch (error) {
          console.error(`Error: ${(error as Error).message}`)
          process.exit(error instanceof ProjectManifestError ? 2 : 1)
        }
      }
      break
    }

    case 'watch':
      if (!parsed.file) {
        console.error('Error: No directory specified')
        printUsage()
        process.exit(1)
      }
      watchCommand(
        parsed.file,
        parsed.output ?? './dist',
        parsed.namespace,
        parsed.hotReload,
      )
      break

    case 'test': {
      if (!parsed.file) {
        console.error('Error: No input file specified\nUsage: redscript test <file> [--dry-run] [--mc-url <url>]')
        process.exit(1)
      }
      {
        const { runTests } = require('./testing/runner')
        const namespace = parsed.namespace ?? deriveNamespace(parsed.file)
        await runTests({
          filePath: parsed.file,
          outputDir: parsed.output,
          dryRun: parsed.dryRun ?? !parsed.mcUrl,
          mcUrl: parsed.mcUrl,
          namespace,
        })
      }
      break
    }

    case 'check':
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      {
        try {
          const fileDir = path.dirname(path.resolve(parsed.file))
          const selected = loadCliProjectTarget(fileDir, parsed.target)
          if (selected?.target.compatibility === 'explicit') {
            checkProjectCommand(
              parsed.file,
              selected.project,
              selected.target,
              parsed.namespace,
              parsed.format ?? 'human',
              parsed.fix ?? false,
            )
          }
          const namespace = parsed.namespace ?? selected?.target.namespace
          checkCommand(parsed.file, namespace, parsed.format ?? 'human', parsed.fix ?? false)
        } catch (error) {
          console.error(`Error: ${(error as Error).message}`)
          process.exit(error instanceof ProjectManifestError ? 2 : 1)
        }
      }
      break

    case 'lint':
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      {
        const namespace = parsed.namespace ?? deriveNamespace(parsed.file)
        try {
          const warnings = lintFile(parsed.file, namespace, {
            maxFunctionLines: parsed.maxFunctionLines,
          })
          for (const w of warnings) {
            console.log(formatLintWarning(w))
          }
          if (warnings.length === 0) {
            console.log('✓ No lint issues found')
          } else {
            console.log(`\n${warnings.length} lint issue(s) found`)
          }
          process.exit(warnings.length > 0 ? 1 : 0)
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`)
          process.exit(2)
        }
      }
      break

    case 'fmt':
    case 'format': {
      const files = args.filter(a => a.endsWith('.mcrs'))
      if (files.length === 0) {
        console.error('Usage: redscript fmt <file.mcrs> [file2.mcrs ...]')
        process.exit(1)
      }
      const { format } = require('./formatter')
      let changed = 0
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8')
        const formatted = format(content)
        if (content !== formatted) {
          changed++
          if (!parsed.fmtCheck) {
            fs.writeFileSync(file, formatted)
            console.log(`Formatted: ${file}`)
          } else {
            console.log(`Would format: ${file}`)
          }
        } else if (!parsed.fmtCheck) {
          console.log(`Already formatted: ${file}`)
        }
      }
      if (parsed.fmtCheck) {
        if (changed > 0) {
          process.exit(1)
        }
        console.log('All files are formatted')
      }
      break
    }

    case 'declarations': {
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      declarationsCommand(parsed.file, parsed.output, parsed.namespace)
      break
    }

    case 'generate-dts': {
      const output = parsed.output ?? 'builtins.d.mcrs'
      const dtsContent = generateDts()
      fs.writeFileSync(output, dtsContent, 'utf-8')
      console.log(`Generated ${output}`)
      break
    }

    case 'project':
      projectCommand(parsed.file ?? process.cwd(), parsed.format ?? 'human')
      break

    case 'resolve':
      await resolveCommand(parsed.file ?? process.cwd(), parsed.format ?? 'human')
      break

    case 'graph':
      if (!parsed.capabilities) {
        console.error('Error: graph currently requires --capabilities')
        process.exit(2)
      }
      graphCommand(parsed.file ?? process.cwd(), parsed.target, parsed.format ?? 'human')
      break

    case 'init':
      initCommand(parsed.file)
      break

    case 'repl':
      await startRepl(parsed.namespace ?? 'repl')
      break

    case 'version':
      printVersion()
      await checkForUpdates()
      break

    case 'upgrade':
    case 'update':
      upgradeCommand()
      break

    case 'docs':
      // parsed.file holds the positional argument after the command (module name)
      docsCommand(parsed.file, parsed.list ?? false)
      break

    case 'tune':
      await runTunerCli(args)
      break

    default:
      console.error(`Error: Unknown command '${parsed.command}'`)
      printUsage()
      process.exit(1)
  }
}

void main()
