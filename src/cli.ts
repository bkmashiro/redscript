#!/usr/bin/env node
/**
 * RedScript CLI
 * 
 * Usage:
 *   redscript compile <file> [-o <out>] [--output-nbt <file>] [--namespace <ns>]
 *   redscript check <file>
 *   redscript repl
 *   redscript version
 */

import { compile, check } from './index'
import { generateCommandBlocks } from './codegen/cmdblock'
import { compileToStructure } from './codegen/structure'
import { formatError } from './diagnostics'
import { startRepl } from './repl'
import type { OptimizationStats } from './optimizer/commands'
import * as fs from 'fs'
import * as path from 'path'

// Parse command line arguments
const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
RedScript Compiler

Usage:
  redscript compile <file> [-o <out>] [--output-nbt <file>] [--namespace <ns>] [--target <target>]
  redscript watch <dir> [-o <outdir>] [--namespace <ns>] [--hot-reload <url>]
  redscript check <file>
  redscript repl
  redscript version

Commands:
  compile   Compile a RedScript file to a Minecraft datapack
  watch     Watch a directory for .rs file changes, recompile, and hot reload
  check     Check a RedScript file for errors without generating output
  repl      Start an interactive RedScript REPL
  version   Print the RedScript version

Options:
  -o, --output <path>    Output directory or file path, depending on target
  --output-nbt <file>    Output .nbt file path for structure target
  --namespace <ns>       Datapack namespace (default: derived from filename)
  --target <target>      Output target: datapack (default), cmdblock, or structure
  --stats                Print optimizer statistics
  --hot-reload <url>     After each successful compile, POST to <url>/reload
                         (use with redscript-testharness; e.g. http://localhost:25561)
  -h, --help             Show this help message

Targets:
  datapack  Generate a full Minecraft datapack (default)
  cmdblock  Generate JSON structure for command block placement
  structure Generate a Minecraft structure .nbt file with command blocks
`)
}

function printVersion(): void {
  const packagePath = path.join(__dirname, '..', 'package.json')
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
    console.log(`RedScript v${pkg.version}`)
  } catch {
    console.log('RedScript v0.1.0')
  }
}

function parseArgs(args: string[]): {
  command?: string
  file?: string
  output?: string
  outputNbt?: string
  namespace?: string
  target?: string
  stats?: boolean
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
    } else if (arg === '--output-nbt') {
      result.outputNbt = args[++i]
      i++
    } else if (arg === '--namespace') {
      result.namespace = args[++i]
      i++
    } else if (arg === '--target') {
      result.target = args[++i]
      i++
    } else if (arg === '--stats') {
      result.stats = true
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

function printWarnings(warnings: Array<{ code: string; message: string }> | undefined): void {
  if (!warnings || warnings.length === 0) {
    return
  }

  for (const warning of warnings) {
    console.error(`Warning [${warning.code}]: ${warning.message}`)
  }
}

function formatReduction(before: number, after: number): string {
  if (before === 0) return '0%'
  return `${Math.round(((before - after) / before) * 100)}%`
}

function printOptimizationStats(stats: OptimizationStats | undefined): void {
  if (!stats) return

  console.log('Optimizations applied:')
  console.log(`  LICM: ${stats.licmHoists} reads hoisted from ${stats.licmLoopBodies} loop bodies`)
  console.log(`  CSE:  ${stats.cseRedundantReads + stats.cseArithmetic} expressions eliminated`)
  console.log(`  setblock batching: ${stats.setblockMergedCommands} setblocks -> ${stats.setblockFillCommands} fills (saved ${stats.setblockSavedCommands} commands)`)
  console.log(`  dead code: ${stats.deadCodeRemoved} commands removed`)
  console.log(`  constant folding: ${stats.constantFolds} constants folded`)
  console.log(`  Total mcfunction commands: ${stats.totalCommandsBefore} -> ${stats.totalCommandsAfter} (${formatReduction(stats.totalCommandsBefore, stats.totalCommandsAfter)} reduction)`)
}

function compileCommand(file: string, output: string, namespace: string, target: string = 'datapack', showStats = false): void {
  // Read source file
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  const source = fs.readFileSync(file, 'utf-8')

  try {
    if (target === 'cmdblock') {
      const result = compile(source, { namespace, filePath: file })
      printWarnings(result.warnings)

      // Generate command block JSON
      const hasTick = result.files.some(f => f.path.includes('__tick.mcfunction'))
      const hasLoad = result.files.some(f => f.path.includes('__load.mcfunction'))
      const cmdBlocks = generateCommandBlocks(namespace, hasTick, hasLoad)

      // Write command block JSON
      fs.mkdirSync(output, { recursive: true })
      const outputFile = path.join(output, `${namespace}_cmdblocks.json`)
      fs.writeFileSync(outputFile, JSON.stringify(cmdBlocks, null, 2))

      console.log(`✓ Generated command blocks for ${file}`)
      console.log(`  Output: ${outputFile}`)
      console.log(`  Blocks: ${cmdBlocks.blocks.length}`)
      if (showStats) {
        printOptimizationStats(result.stats)
      }
    } else if (target === 'structure') {
      const structure = compileToStructure(source, namespace, file)
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.writeFileSync(output, structure.buffer)

      console.log(`✓ Generated structure for ${file}`)
      console.log(`  Output: ${output}`)
      console.log(`  Blocks: ${structure.blockCount}`)
      if (showStats) {
        printOptimizationStats(structure.stats)
      }
    } else {
      const result = compile(source, { namespace, filePath: file })
      printWarnings(result.warnings)

      // Default: generate datapack
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
      console.log(`  Functions: ${result.ir.functions.length}`)
      console.log(`  Files: ${result.files.length}`)
      if (showStats) {
        printOptimizationStats(result.stats)
      }
    }
  } catch (err) {
    console.error(formatError(err as Error, source))
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
    console.error(formatError(error, source))
    process.exit(1)
  }

  console.log(`✓ ${file} is valid`)
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

  console.log(`👁  Watching ${dir} for .rs file changes...`)
  console.log(`   Output: ${output}`)
  if (hotReloadUrl) console.log(`   Hot reload: ${hotReloadUrl}`)
  console.log(`   Press Ctrl+C to stop\n`)

  // Debounce timer
  let debounceTimer: NodeJS.Timeout | null = null

  // Compile all .rs files in directory
  async function compileAll(): Promise<void> {
    const files = findRsFiles(dir)
    if (files.length === 0) {
      console.log(`⚠  No .rs files found in ${dir}`)
      return
    }

    let hasErrors = false
    for (const file of files) {
      let source = ''
      try {
        source = fs.readFileSync(file, 'utf-8')
        const ns = namespace ?? deriveNamespace(file)
        const result = compile(source, { namespace: ns, filePath: file })
        printWarnings(result.warnings)

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
        console.error(`✗ [${timestamp}] ${formatError(err as Error, source)}`)
      }
    }

    if (!hasErrors) {
      if (hotReloadUrl) await hotReload(hotReloadUrl)
      console.log('')
    }
  }

  // Find all .rs files recursively
  function findRsFiles(directory: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(directory, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        results.push(...findRsFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.rs')) {
        results.push(fullPath)
      }
    }

    return results
  }

  // Initial compile
  void compileAll()

  // Watch for changes
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.rs')) {
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

  switch (parsed.command) {
    case 'compile':
      if (!parsed.file) {
        console.error('Error: No input file specified')
        printUsage()
        process.exit(1)
      }
      {
        const namespace = parsed.namespace ?? deriveNamespace(parsed.file)
        const target = parsed.target ?? 'datapack'
        const output = target === 'structure'
          ? (parsed.outputNbt ?? parsed.output ?? `./${namespace}.nbt`)
          : (parsed.output ?? './dist')

      compileCommand(
        parsed.file,
        output,
        namespace,
        target,
        parsed.stats
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
        parsed.hotReload
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

    case 'repl':
      await startRepl(parsed.namespace ?? 'repl')
      break

    case 'version':
      printVersion()
      break

    default:
      console.error(`Error: Unknown command '${parsed.command}'`)
      printUsage()
      process.exit(1)
  }
}

void main()
