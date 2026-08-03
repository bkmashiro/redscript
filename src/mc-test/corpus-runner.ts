import { createHash } from 'crypto'
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { MCTestClient } from './client'
import {
  DEFAULT_HARNESS_HOST,
  DEFAULT_HARNESS_PORT,
  ManagedPaperServer,
  findHarnessPlugin,
  findJava,
  prepareServerRoot,
} from './managed-paper'

export type CorpusSuite = 'core' | 'stdlib-gap' | 'events' | 'player' | 'integration'

export interface CorpusRunOptions {
  readonly channel: string
  readonly templateDir: string
  readonly reportPath: string
  readonly suites: readonly CorpusSuite[]
}

export interface CorpusSuiteReport {
  readonly suite: CorpusSuite
  readonly command: string
  readonly exitCode: number
  readonly durationMs: number
  readonly outputSha256: string
  readonly outputTail: string
  readonly summary: { suites?: string; tests?: string }
}

export interface CorpusRunReport {
  readonly schemaVersion: 1
  readonly evidenceClass: 'managed-runtime-corpus'
  readonly sourceRevision: string
  readonly channel: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly paperVersion?: string
  readonly disposableRootRemoved: boolean
  readonly suites: readonly CorpusSuiteReport[]
  readonly bot?: { readonly connected: boolean; readonly outputTail: string }
  readonly passed: boolean
  readonly error?: string
}

interface ChildResult {
  readonly exitCode: number
  readonly output: string
  readonly durationMs: number
}

export function parseJestSummary(output: string): { suites?: string; tests?: string } {
  return {
    suites: output.match(/Test Suites:\s*([^\n]+)/)?.[1]?.trim(),
    tests: output.match(/Tests:\s*([^\n]+)/)?.[1]?.trim(),
  }
}

function runChild(args: string[], env: NodeJS.ProcessEnv): Promise<ChildResult> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { output += chunk.toString() })
    child.once('error', reject)
    child.once('exit', code => resolve({
      exitCode: code ?? 1,
      output,
      durationMs: Date.now() - started,
    }))
  })
}

interface ManagedBotProcess {
  readonly child: ChildProcessWithoutNullStreams
  readonly output: () => string
}

async function startTestBot(channel: string): Promise<ManagedBotProcess> {
  const botVersion = process.env.MC_BOT_VERSION ?? (channel === 'stable-1.21.4' ? '1.21.4' : undefined)
  const child = spawn(process.execPath, [path.resolve(process.cwd(), 'scripts', 'testbot-server.js')], {
    cwd: process.cwd(),
    env: { ...process.env, MC_BOT_VERSION: botVersion, MC_GAME_HOST: '127.0.0.1', MC_GAME_PORT: '25566', MC_BOT_API_PORT: '25562' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString() })
  child.stderr.on('data', chunk => { output += chunk.toString() })
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`TestBot exited before ready: ${output.slice(-2000)}`)
    try {
      const response = await fetch('http://127.0.0.1:25562/status')
      const status = await response.json() as { connected?: boolean }
      if (status.connected === true) return { child, output: () => output }
    } catch {
      // TestBot HTTP server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  child.kill('SIGTERM')
  throw new Error(`TestBot did not connect within 45 seconds: ${output.slice(-2000)}`)
}

async function stopTestBot(bot: ManagedBotProcess | undefined): Promise<void> {
  if (bot == null || bot.child.exitCode != null) return
  const exited = new Promise<void>(resolve => bot.child.once('exit', () => resolve()))
  bot.child.kill('SIGTERM')
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
  if (bot.child.exitCode == null) bot.child.kill('SIGKILL')
}

function suiteArgs(suite: CorpusSuite): string[] {
  if (suite === 'core') return ['run', 'test:mc-core:live']
  if (suite === 'stdlib-gap') return ['run', 'test:mc-stdlib-gap:live']
  if (suite === 'events') {
    return [
      'test', '--', '--selectProjects', 'mc-integration', '--runInBand', '--runTestsByPath',
      'src/__tests__/mc-integration/event-runtime.test.ts', '--testTimeout=120000',
    ]
  }
  if (suite === 'player') {
    return [
      'test', '--', '--selectProjects', 'mc-integration', '--runInBand', '--runTestsByPath',
      'src/__tests__/mc-integration/stdlib-coverage-6.test.ts', '--testTimeout=120000',
    ]
  }
  return ['test', '--', '--selectProjects', 'mc-integration', '--runInBand', '--testTimeout=120000']
}

function suiteReport(suite: CorpusSuite, args: string[], result: ChildResult): CorpusSuiteReport {
  return {
    suite,
    command: `npm ${args.join(' ')}`,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    outputSha256: createHash('sha256').update(result.output).digest('hex'),
    outputTail: result.output.slice(-8000),
    summary: parseJestSummary(result.output),
  }
}

function writeReport(reportPath: string, report: CorpusRunReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(reportPath, 0o600)
}

export function resolveSourceRevision(): string {
  if (process.env.GITHUB_SHA?.trim()) return process.env.GITHUB_SHA.trim()
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim()
}

export async function runManagedCorpus(options: CorpusRunOptions): Promise<CorpusRunReport> {
  const startedAt = new Date().toISOString()
  const reports: CorpusSuiteReport[] = []
  const java = findJava()
  const harness = findHarnessPlugin(options.templateDir)
  const root = prepareServerRoot(options.templateDir, harness)
  const client = new MCTestClient(DEFAULT_HARNESS_HOST, DEFAULT_HARNESS_PORT)
  const paper = new ManagedPaperServer(root, java.executable, client, {
    sourceTemplateDir: options.templateDir,
  })
  let paperVersion: string | undefined
  let bot: ManagedBotProcess | undefined
  let error: string | undefined
  let cleanupError: string | undefined

  try {
    const started = await paper.start()
    paperVersion = started.status.version
    await client.fullReset()
    if (options.suites.includes('player') || options.suites.includes('events')) bot = await startTestBot(options.channel)
    for (const suite of options.suites) {
      const args = suiteArgs(suite)
      const result = await runChild(args, {
        ...process.env,
        MC_HOST: DEFAULT_HARNESS_HOST,
        MC_PORT: String(DEFAULT_HARNESS_PORT),
        MC_SERVER_DIR: root,
        MC_INTEGRATION_REQUIRE_ONLINE: 'true',
        MC_INTEGRATION_REQUIRE_BOT: suite === 'player' || suite === 'events' ? 'true' : process.env.MC_INTEGRATION_REQUIRE_BOT,
        MC_CORE_INSTRUMENT_COVERAGE: suite === 'core' ? 'true' : process.env.MC_CORE_INSTRUMENT_COVERAGE,
        MC_STDLIB_GAP_INSTRUMENT_COVERAGE: suite === 'stdlib-gap' ? 'true' : process.env.MC_STDLIB_GAP_INSTRUMENT_COVERAGE,
      })
      reports.push(suiteReport(suite, args, result))
      if (result.exitCode !== 0) break
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    try {
      await stopTestBot(bot)
    } catch (caught) {
      cleanupError = `bot: ${caught instanceof Error ? caught.message : String(caught)}`
    }
    try {
      const cleanup = await paper.cleanup()
      if (cleanup.failures.length > 0) {
        const paperCleanup = cleanup.failures.map(failure => `${failure.stage}: ${failure.message}`).join('; ')
        cleanupError = [cleanupError, paperCleanup].filter(Boolean).join('; ')
      }
    } catch (caught) {
      const paperCleanup = caught instanceof Error ? caught.message : String(caught)
      cleanupError = [cleanupError, paperCleanup].filter(Boolean).join('; ')
    }
  }

  const disposableRootRemoved = !fs.existsSync(root)
  const passed = error == null && cleanupError == null && disposableRootRemoved &&
    reports.length === options.suites.length && reports.every(report => report.exitCode === 0)
  const rootError = disposableRootRemoved ? undefined : 'cleanup: disposable root was not removed'
  const report: CorpusRunReport = {
    schemaVersion: 1,
    evidenceClass: 'managed-runtime-corpus',
    sourceRevision: resolveSourceRevision(),
    channel: options.channel,
    startedAt,
    finishedAt: new Date().toISOString(),
    paperVersion,
    disposableRootRemoved,
    suites: reports,
    bot: bot == null ? undefined : { connected: true, outputTail: bot.output().slice(-4000) },
    passed,
    error: [error, cleanupError && `cleanup: ${cleanupError}`, rootError].filter(Boolean).join('; ') || undefined,
  }
  writeReport(options.reportPath, report)
  return report
}

function parseSuites(value: string | undefined): CorpusSuite[] {
  const suites = (value ?? 'core').split(',').filter(Boolean) as CorpusSuite[]
  if (suites.length === 0 || suites.some(suite => !['core', 'stdlib-gap', 'events', 'player', 'integration'].includes(suite))) {
    throw new Error(`MC_CORPUS_SUITES must contain only core,stdlib-gap,events,player,integration; got '${value ?? ''}'`)
  }
  return suites
}

async function main(): Promise<void> {
  const channel = process.env.MC_CORPUS_CHANNEL ?? 'stable-1.21.4'
  const templateDir = process.env.MC_CORPUS_TEMPLATE_DIR ?? path.join(
    process.env.HOME!,
    channel === 'paper-26.2' ? 'mc-test-server-26.2' : 'mc-test-server',
  )
  const reportPath = process.env.MC_CORPUS_REPORT ?? path.resolve(
    process.cwd(),
    'docs',
    'evidence',
    `mcrs-runtime-corpus-${channel}.json`,
  )
  const report = await runManagedCorpus({
    channel,
    templateDir,
    reportPath,
    suites: parseSuites(process.env.MC_CORPUS_SUITES),
  })
  process.stdout.write(`${JSON.stringify({ reportPath, passed: report.passed, suites: report.suites.map(s => s.summary) })}\n`)
  if (!report.passed) process.exitCode = 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
