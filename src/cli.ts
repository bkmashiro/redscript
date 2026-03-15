#!/usr/bin/env node
/**
 * RedScript CLI
 *
 * Usage:
 *   redscript compile <file> [-o <out>] [--namespace <ns>]
 *   redscript check <file>
 *   redscript repl
 *   redscript version
 */

import { compile, check } from './index'
import { formatError } from './diagnostics'
import { startRepl } from './repl'
import { generateDts } from './builtins/metadata'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { execSync } from 'child_process'

// Parse command line arguments
const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
RedScript Compiler v2

Usage:
  redscript compile <file> [-o <out>] [--namespace <ns>]
  redscript watch <dir> [-o <outdir>] [--namespace <ns>] [--hot-reload <url>]
  redscript check <file>
  redscript fmt <file.mcrs> [file2.mcrs ...]
  redscript generate-dts [-o <file>]
  redscript repl
  redscript version

Commands:
  compile       Compile a RedScript file to a Minecraft datapack
  watch         Watch a directory for .mcrs file changes, recompile, and hot reload
  check         Check a RedScript file for errors without generating output
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

function compileCommand(
  file: string,
  output: string,
  namespace: string,
): void {
  // Read source file
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  const source = fs.readFileSync(file, 'utf-8')

  try {
    const result = compile(source, { namespace, filePath: file })

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

function checkCommand(file: string): void {
  // Read source file
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  const source = fs.readFileSync(file, 'utf-8')

  const error = check(source, 'redscript', file)
  if (error) {
    console.error(formatError(error, source, file))
    process.exit(1)
  }

  console.log(`✓ No errors found`)
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
  console.log(`   Press Ctrl+C to stop\n`)

  // Debounce timer
  let debounceTimer: NodeJS.Timeout | null = null

  // Compile all .mcrs files in directory
  async function compileAll(): Promise<void> {
    const files = findRsFiles(dir)
    if (files.length === 0) {
      console.log(`⚠  No .mcrs files found in ${dir}`)
      return
    }

    let hasErrors = false
    for (const file of files) {
      let source = ''
      try {
        source = fs.readFileSync(file, 'utf-8')
        const ns = namespace ?? deriveNamespace(file)
        const result = compile(source, { namespace: ns, filePath: file })
        for (const w of result.warnings) {
          console.error(`Warning: ${w}`)
        }

        // Create output directory
        fs.mkdirSync(output, { recursive: true })

        // Write all files
        for (const dataFile of result.files) {
          const filePath = path.join(output, dataFile.path)
          const fileDir = path.dirname(filePath)
          fs.mkdirSync(fileDir, { recursive: true })
          fs.writeFileSync(filePath, dataFile.content)
        }

        const timestamp = new Date().toLocaleTimeString()
        console.log(`✓ [${timestamp}] Compiled ${file} (${result.files.length} files)`)
      } catch (err) {
        hasErrors = true
        const timestamp = new Date().toLocaleTimeString()
        console.error(`✗ [${timestamp}] ${formatError(err as Error, source, file)}`)
      }
    }

    if (!hasErrors) {
      if (hotReloadUrl) await hotReload(hotReloadUrl)
      console.log('')
    }
  }

  // Find all .mcrs files recursively
  function findRsFiles(directory: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(directory, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        results.push(...findRsFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.mcrs')) {
        results.push(fullPath)
      }
    }

    return results
  }

  // Initial compile
  void compileAll()

  // Watch for changes
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.mcrs')) {
      // Debounce rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        console.log(`📝 Change detected: ${filename}`)
        void compileAll()
      }, 100)
    }
  })
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
  if (!noCheckCmds.has(parsed.command ?? '')) {
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
        const namespace = parsed.namespace ?? deriveNamespace(parsed.file)
        const output = parsed.output ?? './dist'

      compileCommand(
        parsed.file,
        output,
        namespace,
      )
      }
      break

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

    case 'check':
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      checkCommand(parsed.file)
      break

    case 'fmt':
    case 'format': {
      const files = args.filter(a => a.endsWith('.mcrs'))
      if (files.length === 0) {
        console.error('Usage: redscript fmt <file.mcrs> [file2.mcrs ...]')
        process.exit(1)
      }
      const { format } = require('./formatter')
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8')
        const formatted = format(content)
        fs.writeFileSync(file, formatted)
        console.log(`Formatted: ${file}`)
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
