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

import { compile, checkDetailed } from './index'
import { DiagnosticError, formatError } from './diagnostics'
import { parseMcVersion, DEFAULT_MC_VERSION, McVersion } from './types/mc-version'
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
import archiver from 'archiver'
import { loadProjectConfig, buildTomlTemplate } from './config/project-config'

// Parse command line arguments
const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
RedScript Compiler v2

Usage:
  redscript compile <file> [-o <out>] [--namespace <ns>] [--incremental]
  redscript publish <file> [-o <out.zip>] [--namespace <ns>] [--mc-version <ver>]
  redscript watch <dir> [-o <outdir>] [--namespace <ns>] [--hot-reload <url>]
  redscript test <file> [--dry-run] [--mc-url <url>]
  redscript check <file>
  redscript lint <file> [--max-function-lines <n>]
  redscript init [project-name]
  redscript fmt <file.mcrs> [file2.mcrs ...]
  redscript generate-dts [-o <file>]
  redscript repl
  redscript version

Commands:
  compile       Compile a RedScript file to a Minecraft datapack
  publish       Compile and package the datapack as a .zip (ready to install in Minecraft)
  watch         Watch a directory for .mcrs file changes, recompile, and hot reload
  test          Compile and run @test-annotated functions as tests
  check         Check a RedScript file for errors without generating output
  lint          Statically analyze a RedScript file for potential issues (warnings)
  init          Scaffold a new RedScript datapack project
  fmt           Auto-format RedScript source files
  generate-dts  Generate builtin function declaration file (builtins.d.mcrs)
  repl          Start an interactive RedScript REPL
  version       Print the RedScript version
  upgrade       Upgrade to the latest version (npm install -g redscript-mc@latest)

Options:
  -o, --output <path>    Output directory or file path
  --namespace <ns>       Datapack namespace (default: derived from filename)
  --hot-reload <url>     After each successful compile, POST to <url>/reload
                         (use with redscript-testharness; e.g. http://localhost:25561)
  --source-map           Generate .sourcemap.json files alongside .mcfunction output
  --mc-version <ver>     Target Minecraft version (default: 1.21). Affects codegen features.
                         e.g. --mc-version 1.20.2, --mc-version 1.19
  --lenient              Treat type errors as warnings instead of blocking compilation
  --include <dir>        Add a directory to the import search path (repeatable)
  --incremental          Enable file-level incremental compilation cache
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

function parseArgs(args: string[]): {
  command?: string
  file?: string
  output?: string
  namespace?: string
  help?: boolean
  hotReload?: string
  sourceMap?: boolean
  mcVersionStr?: string
  lenient?: boolean
  includeDirs?: string[]
  format?: 'human' | 'json'
  fmtCheck?: boolean
  incremental?: boolean
  maxFunctionLines?: number
  description?: string
  dryRun?: boolean
  mcUrl?: string
} {
  const result: ReturnType<typeof parseArgs> = {}
  let i = 0

  while (i < args.length) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      result.help = true
      i++
    } else if (arg === '-o' || arg === '--output') {
      result.output = args[++i]
      i++
    } else if (arg === '--namespace') {
      result.namespace = args[++i]
      i++
    } else if (arg === '--hot-reload') {
      result.hotReload = args[++i]
      i++
    } else if (arg === '--source-map') {
      result.sourceMap = true
      i++
    } else if (arg === '--mc-version') {
      result.mcVersionStr = args[++i]
      i++
    } else if (arg === '--lenient') {
      result.lenient = true
      i++
    } else if (arg === '--include') {
      if (!result.includeDirs) result.includeDirs = []
      result.includeDirs.push(args[++i])
      i++
    } else if (arg === '--format') {
      const format = args[++i]
      if (format === 'json' || format === 'human') {
        result.format = format
      }
      i++
    } else if (arg === '--check') {
      result.fmtCheck = true
      i++
    } else if (arg === '--incremental') {
      result.incremental = true
      i++
    } else if (arg === '--max-function-lines') {
      result.maxFunctionLines = parseInt(args[++i], 10)
      i++
    } else if (arg === '--description') {
      result.description = args[++i]
      i++
    } else if (arg === '--dry-run') {
      result.dryRun = true
      i++
    } else if (arg === '--mc-url') {
      result.mcUrl = args[++i]
      i++
    } else if (!result.command) {
      result.command = arg
      i++
    } else if (!result.file) {
      result.file = arg
      i++
    } else {
      i++
    }
  }

  return result
}

function deriveNamespace(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath))
  // Convert to valid identifier: lowercase, replace non-alphanumeric with underscore
  return basename.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function sanitizeProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function buildInitFiles(namespace: string): Record<string, string> {
  return {
    'src/main.mcrs': `@load
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

function compileCommand(
  file: string,
  output: string,
  namespace: string,
  sourceMap = false,
  mcVersionStr?: string,
  lenient = false,
  includeDirs?: string[],
  incremental = false,
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
    const result = compile(source, { namespace, filePath: file, generateSourceMap: sourceMap, mcVersion, lenient, includeDirs })

    for (const w of result.warnings) {
      console.error(`Warning: ${w}`)
    }

    // Create output directory
    fs.mkdirSync(output, { recursive: true })

    // Write all files
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
    console.error(formatError(err as Error, source, file))
    process.exit(1)
  }
}

interface CliDiagnostic {
  severity: 'warning' | 'error'
  kind: string
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

function checkCommand(file: string, namespace?: string, outputFormat: 'human' | 'json' = 'human'): void {
  // Read source file
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  const source = fs.readFileSync(file, 'utf-8')

  const ns = namespace ?? deriveNamespace(file)
  const result = checkDetailed(source, ns, file)
  const warnings = result.warnings.map(w => warningToDiagnostic(w, file))
  const errors = result.errors.map(errorToDiagnostic)
  const diagnostics = [...warnings, ...errors]
  const exitCode = errors.length > 0 ? 2 : warnings.length > 0 ? 1 : 0

  if (outputFormat === 'json') {
    console.log(JSON.stringify({
      file,
      namespace: ns,
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
 * Map a McVersion enum value to the corresponding pack_format integer.
 * https://minecraft.wiki/w/Pack_format
 */
function mcVersionToPackFormat(version: McVersion): number {
  // Use a threshold-based mapping (≥ version → pack_format)
  if (version >= McVersion.v1_21_4) return 48
  if (version >= McVersion.v1_21)   return 45
  if (version >= McVersion.v1_20_4) return 26
  if (version >= McVersion.v1_20_2) return 22
  if (version >= McVersion.v1_20)   return 18
  return 15 // 1.19 and below
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

  let compileResult
  try {
    compileResult = compile(source, {
      namespace,
      filePath: file,
      generateSourceMap: false,
      mcVersion,
      lenient,
      includeDirs,
    })
  } catch (err) {
    console.error(formatError(err as Error, source, file))
    process.exit(1)
  }

  for (const w of compileResult.warnings) {
    console.error(`Warning: ${w}`)
  }

  const packFormat = mcVersionToPackFormat(mcVersion)
  const mcmeta = JSON.stringify({
    pack: {
      pack_format: packFormat,
      description,
    }
  }, null, 2)

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(path.resolve(outputZip)), { recursive: true })

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputZip)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)

    // Add pack.mcmeta at root
    archive.append(mcmeta, { name: 'pack.mcmeta' })

    // Add compiled files — skip pack.mcmeta from compile result (we generate our own)
    // The compile result already produces correct datapack paths, e.g.:
    //   data/<namespace>/function/setup.mcfunction
    //   data/minecraft/tags/function/load.json
    for (const dataFile of compileResult.files) {
      if (dataFile.path === 'pack.mcmeta') continue
      archive.append(dataFile.content, { name: dataFile.path })
    }

    void archive.finalize()
  })

  console.log(`✓ Published ${file} → ${outputZip}`)
  console.log(`  Namespace:   ${namespace}`)
  console.log(`  pack_format: ${packFormat}`)
  console.log(`  Files:       ${compileResult.files.length}`)
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
  const noCheckCmds = new Set(['upgrade', 'update', 'version', 'repl'])
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
        // Load redscript.toml (walk up from file's directory); CLI args take priority
        const fileDir = path.dirname(path.resolve(parsed.file))
        const tomlConfig = loadProjectConfig(fileDir)

        const namespace = parsed.namespace
          ?? tomlConfig?.project?.namespace
          ?? deriveNamespace(parsed.file)
        const output = parsed.output
          ?? tomlConfig?.output?.dir
          ?? './dist'
        const mcVersionStr = parsed.mcVersionStr ?? tomlConfig?.project?.['mc-version']
        const includeDirs = parsed.includeDirs
          ?? tomlConfig?.compiler?.['include-dirs']

        compileCommand(
          parsed.file,
          output,
          namespace,
          parsed.sourceMap,
          mcVersionStr,
          parsed.lenient,
          includeDirs,
          parsed.incremental,
        )
      }
      break

    case 'publish': {
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      {
        // Determine project directory
        const fileDir = path.dirname(path.resolve(parsed.file))
        // Load redscript.toml first, fall back to legacy redscript.config.json
        const tomlConfig = loadProjectConfig(fileDir)
        const legacyConfig = readConfig(fileDir)

        const namespace = parsed.namespace
          ?? tomlConfig?.project?.namespace
          ?? legacyConfig.namespace
          ?? deriveNamespace(parsed.file)
        const description = parsed.description
          ?? tomlConfig?.project?.description
          ?? legacyConfig.description
          ?? `${namespace} datapack`
        const mcVersionStr = parsed.mcVersionStr
          ?? tomlConfig?.project?.['mc-version']
          ?? legacyConfig.mcVersion
        const includeDirs = parsed.includeDirs
          ?? tomlConfig?.compiler?.['include-dirs']

        // Default output: <namespace>.zip in cwd
        const defaultZip = path.join(process.cwd(), `${namespace}.zip`)
        const outputZip = parsed.output ?? tomlConfig?.output?.dir
          ? path.join(tomlConfig!.output!.dir!, `${namespace}.zip`)
          : defaultZip

        await publishCommand(
          parsed.file,
          outputZip,
          namespace,
          description,
          mcVersionStr,
          parsed.lenient,
          includeDirs,
        )
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
        const fileDir = path.dirname(path.resolve(parsed.file))
        const tomlConfig = loadProjectConfig(fileDir)
        const namespace = parsed.namespace ?? tomlConfig?.project?.namespace
        checkCommand(parsed.file, namespace, parsed.format ?? 'human')
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

    case 'generate-dts': {
      const output = parsed.output ?? 'builtins.d.mcrs'
      const dtsContent = generateDts()
      fs.writeFileSync(output, dtsContent, 'utf-8')
      console.log(`Generated ${output}`)
      break
    }

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

    default:
      console.error(`Error: Unknown command '${parsed.command}'`)
      printUsage()
      process.exit(1)
  }
}

void main()
