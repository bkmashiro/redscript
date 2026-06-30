/**
 * MC Version Tests — Phase 5a
 *
 * Verifies:
 *  - parseMcVersion() parses version strings correctly
 *  - compareMcVersion() returns the right ordering
 *  - Codegen emits macro syntax ($ prefix, `with storage`) for >= 1.20.2
 *  - Codegen emits compat syntax for < 1.20.2
 */

import { compile } from '../index'
import { McVersion, parseMcVersion, compareMcVersion, DEFAULT_MC_VERSION } from '../types/mc-version'

// ---------------------------------------------------------------------------
// parseMcVersion
// ---------------------------------------------------------------------------

describe('parseMcVersion', () => {
  it('parses "1.21" correctly', () => {
    expect(parseMcVersion('1.21')).toBe(McVersion.v1_21)
  })

  it('parses "1.20.2" correctly', () => {
    expect(parseMcVersion('1.20.2')).toBe(McVersion.v1_20_2)
  })

  it('parses "1.20" correctly', () => {
    expect(parseMcVersion('1.20')).toBe(McVersion.v1_20)
  })

  it('parses "1.19" correctly', () => {
    expect(parseMcVersion('1.19')).toBe(McVersion.v1_19)
  })

  it('parses "1.21.4" correctly', () => {
    expect(parseMcVersion('1.21.4')).toBe(McVersion.v1_21_4)
  })

  it('throws on invalid format', () => {
    expect(() => parseMcVersion('1')).toThrow()
    expect(() => parseMcVersion('abc')).toThrow()
    expect(() => parseMcVersion('2.0')).toThrow()
    expect(() => parseMcVersion('1.20.2.1')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// compareMcVersion
// ---------------------------------------------------------------------------

describe('compareMcVersion', () => {
  it('returns 0 for equal versions', () => {
    expect(compareMcVersion(McVersion.v1_21, McVersion.v1_21)).toBe(0)
  })

  it('returns negative when a < b', () => {
    expect(compareMcVersion(McVersion.v1_20, McVersion.v1_21)).toBeLessThan(0)
    expect(compareMcVersion(McVersion.v1_20_2, McVersion.v1_21)).toBeLessThan(0)
    expect(compareMcVersion(McVersion.v1_19, McVersion.v1_20_2)).toBeLessThan(0)
  })

  it('returns positive when a > b', () => {
    expect(compareMcVersion(McVersion.v1_21, McVersion.v1_20)).toBeGreaterThan(0)
    expect(compareMcVersion(McVersion.v1_21_4, McVersion.v1_21)).toBeGreaterThan(0)
  })

  it('1.20.2 >= 1.20.2 boundary', () => {
    expect(McVersion.v1_20_2 >= McVersion.v1_20_2).toBe(true)
    expect(McVersion.v1_20 >= McVersion.v1_20_2).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Default version
// ---------------------------------------------------------------------------

describe('DEFAULT_MC_VERSION', () => {
  it('is 1.21', () => {
    expect(DEFAULT_MC_VERSION).toBe(McVersion.v1_21)
  })
})

// ---------------------------------------------------------------------------
// Codegen — macro syntax (>= 1.20.2)
// ---------------------------------------------------------------------------

function getMcFunction(files: ReturnType<typeof compile>['files'], fnSuffix: string): string {
  const mcPath = `data/test/function/${fnSuffix}.mcfunction`
  const file = files.find(f => f.path === mcPath)
  if (!file) {
    const paths = files.map(f => f.path).join(', ')
    throw new Error(`Missing mcfunction: ${mcPath}\nAvailable: ${paths}`)
  }
  return file.content
}

const macroSource = `
fn spawn_zombie(x: int, y: int, z: int) {
  summon("minecraft:zombie", x, y, z);
}
`

describe('codegen — macro syntax (>= 1.20.2)', () => {
  it('emits $ prefix for macro lines on 1.21', () => {
    const result = compile(macroSource, { namespace: 'test', mcVersion: McVersion.v1_21 })
    const fn = getMcFunction(result.files, 'spawn_zombie')
    expect(fn).toContain('$summon')
  })

  it('emits `function ... with storage` call for macro on 1.21', () => {
    const callerSource = `
fn spawn_zombie(x: int, y: int, z: int) {
  summon("minecraft:zombie", x, y, z);
}
fn main() {
  spawn_zombie(1, 2, 3);
}
`
    const result = compile(callerSource, { namespace: 'test', mcVersion: McVersion.v1_21 })
    const fn = getMcFunction(result.files, 'main')
    expect(fn).toContain('with storage')
  })

  it('emits $ prefix for macro lines on 1.20.2', () => {
    const result = compile(macroSource, { namespace: 'test', mcVersion: McVersion.v1_20_2 })
    const fn = getMcFunction(result.files, 'spawn_zombie')
    expect(fn).toContain('$summon')
  })
})

// ---------------------------------------------------------------------------
// Codegen — compat syntax (< 1.20.2)
// ---------------------------------------------------------------------------

describe('codegen — compat syntax (< 1.20.2)', () => {
  it('rejects macro lines on 1.20 (< 1.20.2)', () => {
    expect(() => compile(macroSource, { namespace: 'test', mcVersion: McVersion.v1_20 })).toThrow(
      /Minecraft function macros require target Minecraft 1\.20\.2 or newer/,
    )
  })

  it('rejects macro lines on 1.19', () => {
    expect(() => compile(macroSource, { namespace: 'test', mcVersion: McVersion.v1_19 })).toThrow(
      /Minecraft function macros require target Minecraft 1\.20\.2 or newer/,
    )
  })

  it('rejects macro function calls on 1.19', () => {
    const callerSource = `
fn spawn_zombie(x: int, y: int, z: int) {
  summon("minecraft:zombie", x, y, z);
}
fn main() {
  spawn_zombie(1, 2, 3);
}
`
    expect(() => compile(callerSource, { namespace: 'test', mcVersion: McVersion.v1_19 })).toThrow(
      /Minecraft function macros require target Minecraft 1\.20\.2 or newer/,
    )
  })
})

// ---------------------------------------------------------------------------
// Default version produces macro syntax
// ---------------------------------------------------------------------------

describe('codegen — default version (no mcVersion specified)', () => {
  it('uses macro syntax by default', () => {
    const result = compile(macroSource, { namespace: 'test' })
    const fn = getMcFunction(result.files, 'spawn_zombie')
    expect(fn).toContain('$summon')
  })
})
