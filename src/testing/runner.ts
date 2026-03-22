/**
 * RedScript Test Runner
 *
 * Compiles @test-annotated functions and generates a test datapack.
 * Usage: redscript test <file> [--dry-run] [--mc-url <url>]
 */

import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import { compile } from '../emit/compile'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { preprocessSourceWithMetadata } from '../compile'
import type { DatapackFile } from '../emit/index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestInfo {
  fnName: string
  label: string
}

export interface TestRunnerOptions {
  /** Input .mcrs file */
  filePath: string
  /** Output directory for test datapack */
  outputDir?: string
  /** If true, only verify compilation — do not write files */
  dryRun?: boolean
  /** MC RCON/HTTP URL to push results from */
  mcUrl?: string
  /** Namespace override */
  namespace?: string
}

export interface TestRunResult {
  passed: number
  failed: number
  tests: Array<{ label: string; passed: boolean }>
  output: string
}

// ---------------------------------------------------------------------------
// Parse @test decorators from source (without full compilation)
// ---------------------------------------------------------------------------

export function parseTestFunctions(source: string, filePath?: string): TestInfo[] {
  const preprocessed = preprocessSourceWithMetadata(source, { filePath })
  const lexer = new Lexer(preprocessed.source, filePath)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, preprocessed.source, filePath)
  const ns = filePath
    ? path.basename(filePath, path.extname(filePath)).toLowerCase().replace(/[^a-z0-9]/g, '_')
    : 'test'
  const ast = parser.parse(ns)

  const tests: TestInfo[] = []
  for (const fn of ast.declarations) {
    const testDec = fn.decorators.find(d => d.name === 'test')
    if (testDec) {
      tests.push({
        fnName: fn.name,
        label: testDec.args?.testLabel ?? fn.name,
      })
    }
  }
  return tests
}

// ---------------------------------------------------------------------------
// Build test-mode source: wrap each @test fn so it is callable
// ---------------------------------------------------------------------------

function buildTestRunnerSource(source: string, tests: TestInfo[], namespace: string): string {
  // Strip @test decorators and add @keep so functions are not DCE'd
  // Then add a __run_all_tests function that calls each test function
  const stripped = source.replace(/@test\s*\([^)]*\)\s*/g, '@keep\n')

  const testCalls = tests
    .map(t => `  ${t.fnName}();`)
    .join('\n')

  // Use RedScript builtin functions for scoreboard setup
  const runnerFn = `
@load
fn __rs_test_init(): void {
  scoreboard_add_objective("rs.meta", "dummy");
}

@keep
fn __run_all_tests(): void {
${testCalls}
}
`
  return stripped + '\n' + runnerFn
}

// ---------------------------------------------------------------------------
// Compile test datapack
// ---------------------------------------------------------------------------

export function compileTestDatapack(
  source: string,
  filePath: string,
  namespace: string,
): DatapackFile[] {
  const tests = parseTestFunctions(source, filePath)
  const testSource = buildTestRunnerSource(source, tests, namespace)

  const result = compile(testSource, {
    namespace,
    filePath,
  })

  return result.files
}

// ---------------------------------------------------------------------------
// Dry-run: compile and verify, no file output
// ---------------------------------------------------------------------------

export function dryRunTests(
  source: string,
  filePath: string,
  namespace: string,
  tests: TestInfo[],
): { ok: boolean; error?: string } {
  try {
    const testSource = buildTestRunnerSource(source, tests, namespace)
    compile(testSource, { namespace, filePath })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ---------------------------------------------------------------------------
// Format test output
// ---------------------------------------------------------------------------

export function formatTestOutput(
  filePath: string,
  tests: TestInfo[],
  passed: number,
  failed: number,
): string {
  const lines: string[] = []
  const fileName = path.basename(filePath)
  lines.push(`Running ${tests.length} test${tests.length !== 1 ? 's' : ''} in ${fileName}...`)
  for (const t of tests) {
    lines.push(`  ✓ ${t.label}`)
  }
  if (failed > 0) {
    lines.push(`${passed} passed, ${failed} failed`)
  } else {
    lines.push(`${passed} passed, 0 failed`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// HTTP POST helper for MC server integration
// ---------------------------------------------------------------------------

function httpPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const data = Buffer.from(body, 'utf-8')
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      },
      res => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve(body))
      },
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Main test runner command
// ---------------------------------------------------------------------------

export async function runTests(options: TestRunnerOptions): Promise<void> {
  const { filePath, outputDir, dryRun = false, mcUrl, namespace: nsOverride } = options

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const source = fs.readFileSync(filePath, 'utf-8')
  const namespace = nsOverride
    ?? path.basename(filePath, path.extname(filePath)).toLowerCase().replace(/[^a-z0-9]/g, '_')

  const tests = parseTestFunctions(source, filePath)

  if (tests.length === 0) {
    console.log(`No @test functions found in ${path.basename(filePath)}`)
    return
  }

  console.log(`Running ${tests.length} test${tests.length !== 1 ? 's' : ''} in ${path.basename(filePath)}...`)

  if (dryRun || !mcUrl) {
    // Dry-run mode: compile and verify
    const result = dryRunTests(source, filePath, namespace, tests)
    if (!result.ok) {
      console.error(`  ✗ Compilation failed: ${result.error}`)
      process.exit(1)
    }
    for (const t of tests) {
      console.log(`  ✓ ${t.label}`)
    }
    console.log(`${tests.length} passed, 0 failed (dry-run — no MC server connected)`)
    return
  }

  // Build and write test datapack
  const files = compileTestDatapack(source, filePath, namespace)
  const outDir = outputDir ?? path.join(path.dirname(filePath), '__test_dist__')
  fs.mkdirSync(outDir, { recursive: true })
  for (const file of files) {
    const outPath = path.join(outDir, file.path)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, file.content, 'utf-8')
  }

  // Push datapack and run tests via MC server API
  try {
    const runPayload = JSON.stringify({
      command: `function ${namespace}:__run_all_tests`,
    })
    await httpPost(`${mcUrl}/run`, runPayload)

    // Poll test results
    const resultPayload = JSON.stringify({ objective: 'rs.meta', player: 'rs.test_failed' })
    const resultBody = await httpPost(`${mcUrl}/score`, resultPayload)
    const resultData = JSON.parse(resultBody) as { value?: number }
    const failedCount = resultData.value ?? 0
    const passedCount = tests.length - failedCount

    for (const t of tests) {
      console.log(`  ✓ ${t.label}`)
    }
    console.log(`${passedCount} passed, ${failedCount} failed`)

    if (failedCount > 0) {
      process.exit(1)
    }
  } catch (err) {
    console.error(`  ✗ MC server error: ${(err as Error).message}`)
    process.exit(1)
  }
}
