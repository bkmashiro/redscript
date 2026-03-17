/**
 * Tests for fixed (×10000 fixed-point) support in the RedScript compiler.
 *
 * RedScript fixed-point values are stored as ×10000 integers on MC scoreboards.
 * 1.5 → 15000, 3.14 → 31400, etc.
 */

import { compile } from '../emit/compile'

function getAllMcContent(files: { path: string; content: string }[]): string {
  return files.filter(f => f.path.endsWith('.mcfunction')).map(f => f.content).join('\n')
}

describe('fixed literals (×10000 fixed-point)', () => {
  test('1.5 literal compiles to scoreboard value 15000', () => {
    const source = `fn t(): fixed { return 1.5; }`
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('15000')
  })

  test('3.14 literal compiles to scoreboard value 31400', () => {
    const source = `fn t(): fixed { return 3.14; }`
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('31400')
  })

  test('2.0 literal compiles to 20000', () => {
    const source = `fn t(): fixed { return 2.0; }`
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('20000')
  })

  test('0.5 literal compiles to 5000', () => {
    const source = `fn t(): fixed { return 0.5; }`
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('5000')
  })
})

describe('fixed addition', () => {
  test('1.5 + 2.5 = 4.0 → result 40000 in output', () => {
    // 15000 + 25000 = 40000 — addition needs no scale correction
    const source = `
      fn t(): fixed {
        let a: fixed = 1.5;
        let b: fixed = 2.5;
        return a + b;
      }
    `
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    // Constant folder folds 15000+25000=40000 — result must appear
    expect(all).toContain('40000')
  })

  test('2.0 + 3.0 = 5.0 → result 50000', () => {
    const source = `
      fn t(): fixed {
        let a: fixed = 2.0;
        let b: fixed = 3.0;
        return a + b;
      }
    `
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('50000')
  })
})

describe('fixed multiplication (scale correction ÷10000)', () => {
  test('2.0 * 3.0 = 6.0 → result 60000 (not 600000000)', () => {
    // Without correction: 20000 * 30000 = 600000000 (wrong)
    // With correction: 20000 * 30000 / 10000 = 60000 ✓
    const source = `
      fn t(): fixed {
        let a: fixed = 2.0;
        let b: fixed = 3.0;
        return a * b;
      }
    `
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('60000')
    // Must NOT contain the uncorrected result
    expect(all).not.toContain('600000000')
  })

  test('1.5 * 2.0 = 3.0 → result 30000 (not 300000000)', () => {
    // Without correction: 15000 * 20000 = 300000000 (wrong)
    // With correction: 15000 * 20000 / 10000 = 30000 ✓
    const source = `
      fn t(): fixed {
        let a: fixed = 1.5;
        let b: fixed = 2.0;
        return a * b;
      }
    `
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('30000')
    expect(all).not.toContain('300000000')
  })
})

describe('fixed division (scale correction ×10000)', () => {
  test('6.0 / 2.0 = 3.0 → result 30000 (not 3)', () => {
    // Without correction: 60000 / 20000 = 3 (wrong)
    // With correction: 60000 * 10000 / 20000 = 30000 ✓
    const source = `
      fn t(): fixed {
        let a: fixed = 6.0;
        let b: fixed = 2.0;
        return a / b;
      }
    `
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('30000')
    // The uncorrected result would be 3 (without the trailing 0000)
    expect(all).toMatch(/30000/)
  })

  test('10.0 / 4.0 = 2.5 → result 25000 (not 2)', () => {
    // Without correction: 100000 / 40000 = 2 (wrong, loses precision)
    // With correction: 100000 * 10000 / 40000 = 25000 ✓
    const source = `
      fn t(): fixed {
        let a: fixed = 10.0;
        let b: fixed = 4.0;
        return a / b;
      }
    `
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('25000')
  })
})

describe("'float' keyword deprecation", () => {
  test("using 'float' as type emits a deprecation warning", () => {
    const source = `fn t(): float { return 1.5; }`
    const result = compile(source, { namespace: 'fixedtest' })
    expect(result.warnings.some(w => w.includes('[DeprecatedType]'))).toBe(true)
    expect(result.warnings.some(w => w.includes("'float' is deprecated"))).toBe(true)
    expect(result.warnings.some(w => w.includes("use 'fixed' instead"))).toBe(true)
  })

  test("'float' still compiles correctly (acts as 'fixed')", () => {
    const source = `fn t(): float { return 1.5; }`
    const result = compile(source, { namespace: 'fixedtest' })
    const all = getAllMcContent(result.files)
    // 1.5 × 10000 = 15000
    expect(all).toContain('15000')
  })
})
