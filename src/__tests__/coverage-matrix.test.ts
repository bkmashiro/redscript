import * as fs from 'fs'
import * as path from 'path'
import { COMPILE_ALL_SKIP_MANIFEST } from './helpers/compile-all-skip-manifest'

const REPO_ROOT = path.resolve(__dirname, '../../')
const MATRIX_JSON = path.join(REPO_ROOT, 'docs/plans/redscript-coverage-matrix.json')
const MATRIX_MD = path.join(REPO_ROOT, 'docs/plans/redscript-coverage-matrix.md')
const LIVE_CANDIDATE_MD = path.join(REPO_ROOT, 'docs/plans/redscript-live-oracle-candidate-map.md')
const STDLIB_DIR = path.join(REPO_ROOT, 'src/stdlib')

describe('RedScript coverage matrix manifest', () => {
  function readMatrix(): any {
    return JSON.parse(fs.readFileSync(MATRIX_JSON, 'utf-8'))
  }

  it('represents every stdlib module exactly once', () => {
    const matrix = readMatrix()
    const stdlibModules = fs.readdirSync(STDLIB_DIR)
      .filter(file => file.endsWith('.mcrs'))
      .map(file => file.replace(/\.mcrs$/, ''))
      .sort()
    const matrixModules = matrix.stdlibModules
      .map((entry: any) => entry.module)
      .sort()

    expect(matrix.schemaVersion).toBe(1)
    expect(matrixModules).toEqual(stdlibModules)
    expect(new Set(matrixModules).size).toBe(matrixModules.length)
  })

  it('keeps each stdlib matrix entry evidence-based', () => {
    const matrix = readMatrix()

    for (const entry of matrix.stdlibModules) {
      expect(entry.path).toBe(`src/stdlib/${entry.module}.mcrs`)
      expect(fs.existsSync(path.join(REPO_ROOT, entry.path))).toBe(true)
      expect(entry.proofLevels).toContain('stdlib-source-present')
      expect(entry.proofLevels.length).toBeGreaterThanOrEqual(2)
      expect(Array.isArray(entry.evidenceFiles)).toBe(true)

      for (const evidenceFile of entry.evidenceFiles) {
        expect(fs.existsSync(path.join(REPO_ROOT, evidenceFile))).toBe(true)
      }
    }
  })

  it('documents high-value live candidates without claiming live proof', () => {
    const matrix = readMatrix()
    const liveCandidates = matrix.stdlibModules
      .filter((entry: any) => entry.livePaperStatus === 'candidate-high-value')
      .map((entry: any) => entry.module)

    expect(liveCandidates).toEqual(expect.arrayContaining([
      'events',
      'timer',
      'scheduler',
      'bossbar',
      'inventory',
      'world',
      'spawn',
      'mobs',
      'particles',
      'interactions',
    ]))

    for (const entry of matrix.stdlibModules) {
      expect(entry.proofLevels).not.toContain('live-paper')
    }
  })

  it('tracks bounded live-oracle candidates without requiring live harness for every stdlib module', () => {
    const matrix = readMatrix()
    const liveCandidates = matrix.stdlibModules
      .filter((entry: any) => entry.liveOracleCandidate?.priority !== 'none')

    expect(liveCandidates.length).toBeGreaterThanOrEqual(3)
    expect(liveCandidates.map((entry: any) => entry.module)).toEqual(expect.arrayContaining([
      'events',
      'timer',
      'random',
    ]))
    for (const candidate of liveCandidates) {
      expect(candidate.liveOracleCandidate.reason.length).toBeGreaterThan(20)
    }

    const doc = fs.readFileSync(LIVE_CANDIDATE_MD, 'utf-8')
    expect(doc).toContain('RedScript Live Oracle Candidate Map')
    expect(doc).toContain('events')
    expect(doc).toContain('timer')
    expect(doc).toContain('Do not add live cases for now')
  })

  it('has a human-readable markdown companion that references the JSON source', () => {
    const md = fs.readFileSync(MATRIX_MD, 'utf-8')
    expect(md).toContain('Machine-readable source: `docs/plans/redscript-coverage-matrix.json`')
    expect(md).toContain('| Module | Category | Proof levels | Evidence | Live Paper status |')
    expect(md).toContain('## Language feature / product-readiness gaps')
  })
})

describe('compile-all skip manifest', () => {
  it('keeps skip entries structured, unique, and actionable', () => {
    const patterns = COMPILE_ALL_SKIP_MANIFEST.map(entry => entry.pattern)
    expect(new Set(patterns).size).toBe(patterns.length)

    for (const entry of COMPILE_ALL_SKIP_MANIFEST) {
      expect(entry.pattern.trim()).toBe(entry.pattern)
      expect(entry.pattern.length).toBeGreaterThan(0)
      expect(entry.reason.length).toBeGreaterThan(10)
      expect(entry.nextAction.length).toBeGreaterThan(10)
    }
  })

  it('tracks known compile-all language gaps explicitly', () => {
    const knownGaps = COMPILE_ALL_SKIP_MANIFEST.filter(entry => entry.category === 'known-language-gap')
    const patterns = knownGaps.map(entry => entry.pattern)

    expect(patterns).not.toContain('src/templates/')
    expect(patterns).toContain('src/templates/combat.mcrs')
    expect(patterns).toContain('src/templates/economy.mcrs')
    expect(patterns).toContain('src/templates/quest.mcrs')
    expect(patterns).not.toContain('capture_the_flag.mcrs')
    expect(patterns).not.toContain('tutorial_07_random.mcrs')
    expect(patterns).not.toContain('pvp_arena.mcrs')
    expect(patterns).not.toContain('showcase_game.mcrs')
    expect(knownGaps).toHaveLength(5)
  })
})
