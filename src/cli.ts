#!/usr/bin/env node
/**
 * RedScript CLI
 * 
 * Usage:
 *   redscript compile <file> [-o <outdir>] [--namespace <ns>]
 *   redscript check <file>
 *   redscript version
 */

import { compile, check } from './index'
import * as fs from 'fs'
import * as path from 'path'

// Parse command line arguments
const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
RedScript Compiler

Usage:
  redscript compile <file> [-o <outdir>] [--namespace <ns>]
  redscript check <file>
  redscript version

Commands:
  compile   Compile a RedScript file to a Minecraft datapack
  check     Check a RedScript file for errors without generating output
  version   Print the RedScript version

Options:
  -o, --output <dir>     Output directory (default: ./dist)
  --namespace <ns>       Datapack namespace (default: derived from filename)
  -h, --help             Show this help message
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
  namespace?: string
  help?: boolean
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

function compileCommand(file: string, output: string, namespace: string): void {
  // Read source file
  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`)
    process.exit(1)
  }

  const source = fs.readFileSync(file, 'utf-8')

  try {
    const result = compile(source, { namespace })

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
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
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

  const error = check(source)
  if (error) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }

  console.log(`✓ ${file} is valid`)
}

// Main
const parsed = parseArgs(args)

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
    compileCommand(
      parsed.file,
      parsed.output ?? './dist',
      parsed.namespace ?? deriveNamespace(parsed.file)
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

  case 'version':
    printVersion()
    break

  default:
    console.error(`Error: Unknown command '${parsed.command}'`)
    printUsage()
    process.exit(1)
}
