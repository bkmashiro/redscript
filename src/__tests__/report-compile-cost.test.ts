import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync, execSync, spawnSync } from 'node:child_process'

const REPO_ROOT = path.resolve(__dirname, '../..')
const REPORT_COMPILE_COST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'report-compile-cost.js')
const COMPILE_ENTRY = path.join(REPO_ROOT, 'dist', 'src', 'compile.js')
const TUTORIAL_RANDOM = path.join(REPO_ROOT, 'src/examples', 'tutorial_07_random.mcrs')
const TUTORIAL_MATH_PARTICLES = path.join(REPO_ROOT, 'src/examples', 'tutorial_06_math_particles.mcrs')
const EXPECTED_FAMILY_KEYS = [
  'scoreboard',
  'execute',
  'data',
  'function',
  'summon',
  'tp',
  'storage',
  'particle',
  'title',
  'bossbar',
  'setblock',
  'fill',
  'other',
]

function ensureCompilerBuild() {
  if (!fs.existsSync(COMPILE_ENTRY)) {
    execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' })
  }
}

function runCostReport(sources: string[]): any {
  const output = execFileSync('node', [REPORT_COMPILE_COST_SCRIPT, ...sources, '--pretty'], {
    encoding: 'utf8',
  })
  return JSON.parse(output)
}

interface CliResult {
  exitCode: number
  stdout: string
  stderr: string
  combined: string
}

function runCostReportCli(args: string[]): CliResult {
  const result = spawnSync('node', [REPORT_COMPILE_COST_SCRIPT, ...args], {
    encoding: 'utf8',
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  return {
    exitCode: result.status ?? 0,
    stdout,
    stderr,
    combined: `${stdout}${stderr}`,
  }
}

interface CostFileSummary {
  path: string
}

function sortByPath<T extends CostFileSummary>(input: T[]): T[] {
  return [...input].sort((a, b) => a.path.localeCompare(b.path))
}

function assertExpectedFamilyKeys(subject: Record<string, number>) {
  for (const family of EXPECTED_FAMILY_KEYS) {
    expect(subject).toHaveProperty(family)
  }
}

describe('scripts/report-compile-cost.js', () => {
  beforeAll(ensureCompilerBuild)

  it('emits parseable JSON with stable totals for a single source', () => {
    const report = runCostReport([TUTORIAL_RANDOM]) as any

    expect(Array.isArray(report.sources)).toBe(true)
    expect(report.sources).toHaveLength(1)

    const [summary] = report.sources
    expect(summary).toMatchObject({
      source: TUTORIAL_RANDOM,
      namespace: path.parse(path.basename(TUTORIAL_RANDOM)).name,
      totalFiles: expect.any(Number),
      mcfunctionFiles: expect.any(Number),
      nonCommentCommands: expect.any(Number),
      commandFamilyCounts: expect.any(Object),
      files: expect.any(Array),
    })

    expect(summary.totalFiles).toBeGreaterThan(0)
    expect(summary.mcfunctionFiles).toBeGreaterThan(0)
    expect(summary.nonCommentCommands).toBeGreaterThan(0)

    const sortedPaths = sortByPath(summary.files as CostFileSummary[]).map((file: CostFileSummary) => file.path)
    const actualPaths = (summary.files as CostFileSummary[]).map((file: CostFileSummary) => file.path)
    expect(actualPaths).toEqual(sortedPaths)

    assertExpectedFamilyKeys(summary.commandFamilyCounts)
    expect(summary.commandFamilyCounts).toMatchObject({ other: expect.any(Number) })

    expect(report.totals.totalFiles).toBeGreaterThan(0)
    expect(report.totals.mcfunctionFiles).toBeGreaterThan(0)
    expect(report.totals.nonCommentCommands).toBeGreaterThan(0)

    assertExpectedFamilyKeys(report.totals.commandFamilyCounts)
    expect(report.totals.commandFamilyCounts).toMatchObject({ other: expect.any(Number) })
  })

  it('dedupes duplicate input sources and keeps source output sorted', () => {
    const report = runCostReport([
      TUTORIAL_MATH_PARTICLES,
      TUTORIAL_RANDOM,
      TUTORIAL_MATH_PARTICLES,
      TUTORIAL_RANDOM,
    ]) as any

    const expectedSources = [TUTORIAL_MATH_PARTICLES, TUTORIAL_RANDOM].sort()
    expect(report.sources.map((summary: any) => summary.source)).toEqual(expectedSources)

    for (const summary of report.sources as Array<{ files: CostFileSummary[]; commandFamilyCounts: Record<string, number> }>) {
      const sortedPaths = sortByPath(summary.files).map((file: CostFileSummary) => file.path)
      const actualPaths = summary.files.map((file: CostFileSummary) => file.path)
      expect(actualPaths).toEqual(sortedPaths)
      assertExpectedFamilyKeys(summary.commandFamilyCounts)
    }
  })

  it('prints usage and exits 0 for --help', () => {
    const result = runCostReportCli(['--help'])

    expect(result.exitCode).toBe(0)
    expect(result.combined).toContain('Usage:')
    expect(result.combined).toContain('Options:')
    expect(result.combined).toContain('--namespace <name>')
    expect(result.combined).toContain('--pretty')
  })

  it('errors when source is missing', () => {
    const result = runCostReportCli([])

    expect(result.exitCode).not.toBe(0)
    expect(result.combined).toContain('Missing source.mcrs')
    expect(result.combined).toContain('Usage:')
  })

  it('errors on unknown options', () => {
    const result = runCostReportCli(['--does-not-exist'])

    expect(result.exitCode).not.toBe(0)
    expect(result.combined).toContain('Unknown option')
    expect(result.combined).toContain('Usage:')
  })

  it('errors when --namespace is missing a value', () => {
    const result = runCostReportCli([TUTORIAL_RANDOM, '--namespace'])

    expect(result.exitCode).not.toBe(0)
    expect(result.combined).toContain('Missing value for --namespace')
    expect(result.combined).toContain('Usage:')
  })
})
