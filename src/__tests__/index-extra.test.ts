/**
 * Coverage for src/index.ts
 *
 * Tests:
 * - version export
 * - check() with valid code (returns null)
 * - check() with invalid code (returns Error)
 * - checkWithWarnings() returns both error and warnings
 */

import { version, check, checkWithWarnings } from '../index'

describe('src/index — exported symbols', () => {
  test('version export is a non-empty string', () => {
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  })
})

describe('src/index — check()', () => {
  test('check() returns null for valid code', () => {
    const result = check(`
      fn f(): int { return 42; }
    `)
    expect(result).toBeNull()
  })

  test('check() returns Error for invalid code', () => {
    const result = check(`
      fn f(): int { return "not an int"; }
    `)
    expect(result).toBeInstanceOf(Error)
  })

  test('check() returns null for empty function', () => {
    const result = check(`
      fn f(): void { }
    `)
    expect(result).toBeNull()
  })

  test('check() with custom namespace', () => {
    const result = check(`fn f(): int { return 1; }`, 'custom_ns')
    expect(result).toBeNull()
  })

  test('check() with syntax error returns Error', () => {
    const result = check(`
      fn f() {
        let x = ;;; invalid
      }
    `)
    expect(result).toBeInstanceOf(Error)
  })

  test('check() with filePath option', () => {
    const result = check(`fn f(): int { return 1; }`, 'ns', 'test.mcrs')
    expect(result).toBeNull()
  })
})

describe('src/index — checkWithWarnings()', () => {
  test('checkWithWarnings() returns null error for valid code', () => {
    const result = checkWithWarnings(`fn f(): int { return 1; }`)
    expect(result.error).toBeNull()
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  test('checkWithWarnings() returns Error for invalid code', () => {
    const result = checkWithWarnings(`fn f(): int { return "wrong"; }`)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.warnings).toEqual([])
  })

  test('checkWithWarnings() with namespace', () => {
    const result = checkWithWarnings(`fn f(): void { }`, 'myns')
    expect(result.error).toBeNull()
  })
})
