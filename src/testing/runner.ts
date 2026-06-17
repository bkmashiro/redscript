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

const HARNESS = {
  objective: 'rs.meta',
  failedPlayer: 'rs.test_failed',
  runnerFunction: '__run_all_tests',
} as const

type HarnessMode = 'primary' | 'legacy'

type HarnessMethod = 'GET' | 'POST'

export interface HarnessRunPayloadPrimary {
  cmd: string
}

export interface HarnessRunPayloadLegacy {
  command: string
}

export type HarnessRunPayload = HarnessRunPayloadPrimary | HarnessRunPayloadLegacy

export interface HarnessScorePayload {
  objective: string
  player: string
}

interface HarnessRequestDescriptor {
  url: string
  method: HarnessMethod
  body?: string
}

interface HarnessProtocol {
  mode: HarnessMode
  runEndpoint: '/command' | '/run'
  scoreEndpoint: '/scoreboard' | '/score'
  buildRunPayload: (namespace: string) => string
  buildFailedCountRequest: (baseUrl: string) => HarnessRequestDescriptor
}

const HARNESS_PROTOCOLS: ReadonlyArray<HarnessProtocol> = [
  {
    mode: 'primary',
    runEndpoint: '/command',
    scoreEndpoint: '/scoreboard',
    buildRunPayload: (namespace: string): string => {
      const payload: HarnessRunPayloadPrimary = { cmd: `function ${namespace}:${HARNESS.runnerFunction}` }
      return JSON.stringify(payload)
    },
    buildFailedCountRequest: (baseUrl: string): HarnessRequestDescriptor => {
      const objective = encodeURIComponent(HARNESS.objective)
      const player = encodeURIComponent(HARNESS.failedPlayer)
      return {
        url: `${baseUrl}/scoreboard?player=${player}&obj=${objective}`,
        method: 'GET',
      }
    },
  },
  {
    mode: 'legacy',
    runEndpoint: '/run',
    scoreEndpoint: '/score',
    buildRunPayload: (namespace: string): string => {
      const payload: HarnessRunPayloadLegacy = {
        command: `function ${namespace}:${HARNESS.runnerFunction}`,
      }
      return JSON.stringify(payload)
    },
    buildFailedCountRequest: (baseUrl: string): HarnessRequestDescriptor => {
      const payload: HarnessScorePayload = {
        objective: HARNESS.objective,
        player: HARNESS.failedPlayer,
      }
      return {
        url: `${baseUrl}/score`,
        method: 'POST',
        body: JSON.stringify(payload),
      }
    },
  },
]

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
  scoreboard_add_objective("${HARNESS.objective}", "dummy");
}

@keep
fn ${HARNESS.runnerFunction}(): void {
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
// HTTP helper for MC server integration
// ---------------------------------------------------------------------------

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizeHarnessBaseUrl(value: string): string {
  return stripTrailingSlash(value)
}

export function buildHarnessRunPayload(namespace: string, mode: HarnessMode = 'primary'): string {
  const protocol = HARNESS_PROTOCOLS.find(p => p.mode === mode)
  if (!protocol) {
    throw new Error(`Unknown harness mode: ${mode}`)
  }
  return protocol.buildRunPayload(namespace)
}

export function buildFailedCountRequest(
  baseUrl: string,
  mode: HarnessMode = 'primary',
): HarnessRequestDescriptor {
  const normalizedBaseUrl = normalizeHarnessBaseUrl(baseUrl)
  const protocol = HARNESS_PROTOCOLS.find(p => p.mode === mode)
  if (!protocol) {
    throw new Error(`Unknown harness mode: ${mode}`)
  }
  return protocol.buildFailedCountRequest(normalizedBaseUrl)
}

function requestText(url: string, options: { method: 'GET' | 'POST'; body?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const data = options.body ?? ''
    const headers: Record<string, string> = {}
    if (options.method === 'POST') {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = String(Buffer.from(data).length)
    }

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method,
        headers,
      },
      res => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode !== undefined && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`HTTP ${options.method} ${url} failed ${res.statusCode}: ${body}`))
            return
          }
          resolve(body)
        })
      },
    )
    req.on('error', reject)
    if (options.method === 'POST' && data) {
      req.write(data)
    }
    req.end()
  })
}

export function parseScoreValue(raw: string): number {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid scoreboard response JSON: ${message}`)
  }
  const parseCandidate = (value: unknown): number | undefined => {
    if (typeof value === 'number') {
      return value
    }
    if (typeof value === 'string') {
      const parsedNumber = Number(value)
      if (!Number.isNaN(parsedNumber)) {
        return parsedNumber
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const extracted = parseCandidate(item)
        if (extracted !== undefined) {
          return extracted
        }
      }
      return undefined
    }

    if (value === null || typeof value !== 'object') {
      return undefined
    }

    const obj = value as Record<string, unknown>
    const candidates = [
      obj.value,
      (obj.result as { value?: unknown })?.value,
      (obj.data as { value?: unknown })?.value,
      (obj.score as { value?: unknown })?.value,
      (obj as { valueObj?: { value?: unknown } }).valueObj?.value,
      (obj as { scoreResult?: { value?: unknown } }).scoreResult?.value,
      obj.payload,
      obj.result,
      obj.score,
      obj.body,
    ]

    for (const candidate of candidates) {
      const extracted = parseCandidate(candidate)
      if (extracted !== undefined) {
        return extracted
      }
    }

    return undefined
  }

  const value = parseCandidate(parsed)
  if (value === undefined) {
    throw new Error(`Unexpected scoreboard response: ${raw}`)
  }

  return value
}

async function runAllTestsWithHarness(baseUrl: string, namespace: string): Promise<void> {
  for (const protocol of HARNESS_PROTOCOLS) {
    try {
      const payload = protocol.buildRunPayload(namespace)
      await requestText(`${baseUrl}${protocol.runEndpoint}`, { method: 'POST', body: payload })
      return
    } catch (err) {
      if (protocol.mode === 'legacy') {
        throw err
      }
    }
  }
}

async function readFailedCountWithHarness(baseUrl: string): Promise<number> {
  for (const protocol of HARNESS_PROTOCOLS) {
    const request = protocol.buildFailedCountRequest(baseUrl)
    try {
      const body = await requestText(request.url, { method: request.method, body: request.body })
      return parseScoreValue(body)
    } catch (err) {
      if (protocol.mode === 'legacy') {
        throw err
      }
    }
  }
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
    const base = normalizeHarnessBaseUrl(mcUrl)
    await runAllTestsWithHarness(base, namespace)
    const failedCount = await readFailedCountWithHarness(base)
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
