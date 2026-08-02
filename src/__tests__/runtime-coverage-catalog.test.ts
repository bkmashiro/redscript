import * as fs from 'fs'
import * as path from 'path'

import { buildStdlibRuntimeCatalog } from '../mc-test/runtime-coverage-catalog'
import { STDLIB_GAP_CASES } from '../../tests/mc-cases/stdlib-gap-cases'

const STDLIB_DIR = path.resolve(process.cwd(), 'src', 'stdlib')

describe('runtime coverage source catalog', () => {
  it('inventory is deterministic and matches the audited declaration baseline', () => {
    const catalog = buildStdlibRuntimeCatalog(STDLIB_DIR)
    const functions = catalog.entries.filter(entry => entry.kind === 'function' || entry.kind === 'method')
    const constants = catalog.entries.filter(entry => entry.kind === 'constant')

    expect(catalog.modules).toHaveLength(51)
    expect(functions).toHaveLength(721)
    expect(functions.filter(entry => entry.requiresRuntimeProbe)).toHaveLength(663)
    expect(functions.filter(entry => entry.internal)).toHaveLength(58)
    expect(constants).toHaveLength(401)
    expect(catalog.entries.filter(entry => entry.kind === 'enum').map(entry => entry.name)).toContain('Result')
    expect(catalog.entries.filter(entry => entry.kind === 'struct').map(entry => entry.name)).toContain('Timer')
  })

  it('uses unique bytewise-sorted stable ids', () => {
    const catalog = buildStdlibRuntimeCatalog(STDLIB_DIR)
    const ids = catalog.entries.map(entry => entry.id)
    const expected = [...ids].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))

    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('requires runtime probes only for non-internal functions and methods', () => {
    const catalog = buildStdlibRuntimeCatalog(STDLIB_DIR)
    for (const entry of catalog.entries) {
      expect(entry.requiresRuntimeProbe).toBe(
        (entry.kind === 'function' || entry.kind === 'method') && !entry.name.startsWith('_'),
      )
    }
  })

  it('uses canonical catalog ids for every stdlib oracle claim', () => {
    const runtimeRequired = new Set(
      buildStdlibRuntimeCatalog(STDLIB_DIR).entries
        .filter(entry => entry.requiresRuntimeProbe)
        .map(entry => entry.id),
    )
    for (const scenario of STDLIB_GAP_CASES) {
      for (const featureId of scenario.featureIds ?? []) expect(runtimeRequired.has(featureId)).toBe(true)
    }
  })

  it('fails closed when the checked-in manifest drifts from source declarations', () => {
    const catalog = buildStdlibRuntimeCatalog(STDLIB_DIR)
    const manifest = JSON.parse(fs.readFileSync(
      path.resolve(process.cwd(), 'docs', 'plans', 'mcrs-runtime-coverage-manifest.json'),
      'utf8',
    )) as {
      runtimeRequired: string[]
      internalFunctions: string[]
      compileOnly: string[]
      scenarioMappings: Record<string, { caseIds: string[]; channels: string[] }>
      expectedMissingRuntimeCount: number
    }

    const runtimeRequired = catalog.entries
      .filter(entry => entry.requiresRuntimeProbe)
      .map(entry => entry.id)
    const internalFunctions = catalog.entries
      .filter(entry => (entry.kind === 'function' || entry.kind === 'method') && entry.internal)
      .map(entry => entry.id)
    const compileOnly = catalog.entries
      .filter(entry => entry.kind === 'constant' || entry.kind === 'enum' || entry.kind === 'struct')
      .map(entry => entry.id)

    expect(manifest.runtimeRequired).toEqual(runtimeRequired)
    expect(manifest.internalFunctions).toEqual(internalFunctions)
    expect(manifest.compileOnly).toEqual(compileOnly)

    for (const [featureId, mapping] of Object.entries(manifest.scenarioMappings)) {
      expect(runtimeRequired).toContain(featureId)
      expect(mapping.caseIds.length).toBeGreaterThan(0)
      expect(mapping.channels.length).toBeGreaterThan(0)
    }

    const missing = runtimeRequired.filter(featureId => manifest.scenarioMappings[featureId] == null)
    expect(missing).toHaveLength(manifest.expectedMissingRuntimeCount)
  })
})
