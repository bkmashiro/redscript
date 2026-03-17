/**
 * Tests for float (×1000 fixed-point) support in the RedScript compiler.
 *
 * RedScript floats are stored as ×1000 fixed-point integers on MC scoreboards.
 * 1.5f → 1500, 3.14f → 3140, etc.
 */

import { compile } from '../emit/compile'

function getAllMcContent(files: { path: string; content: string }[]): string {
  return files.filter(f => f.path.endsWith('.mcfunction')).map(f => f.content).join('\n')
}

describe('float literals (×1000 fixed-point)', () => {
  test('1.5 literal compiles to scoreboard value 1500', () => {
    const source = `fn t(): float { return 1.5; }`
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('1500')
  })

  test('3.14 literal compiles to scoreboard value 3140', () => {
    const source = `fn t(): float { return 3.14; }`
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('3140')
  })

  test('2.0 literal compiles to 2000', () => {
    const source = `fn t(): float { return 2.0; }`
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('2000')
  })

  test('0.5 literal compiles to 500', () => {
    const source = `fn t(): float { return 0.5; }`
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('500')
  })
})

describe('float addition', () => {
  test('1.5 + 2.5 = 4.0 → result 4000 in output', () => {
    // 1500 + 2500 = 4000 — addition needs no scale correction
    const source = `
      fn t(): float {
        let a: float = 1.5;
        let b: float = 2.5;
        return a + b;
      }
    `
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    // Constant folder folds 1500+2500=4000 — result must appear
    expect(all).toContain('4000')
  })

  test('2.0 + 3.0 = 5.0 → result 5000', () => {
    const source = `
      fn t(): float {
        let a: float = 2.0;
        let b: float = 3.0;
        return a + b;
      }
    `
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('5000')
  })
})

describe('float multiplication (scale correction ÷1000)', () => {
  test('2.0 * 3.0 = 6.0 → result 6000 (not 6000000)', () => {
    // Without correction: 2000 * 3000 = 6000000 (wrong)
    // With correction: 2000 * 3000 / 1000 = 6000 ✓
    const source = `
      fn t(): float {
        let a: float = 2.0;
        let b: float = 3.0;
        return a * b;
      }
    `
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('6000')
    // Must NOT contain the uncorrected result
    expect(all).not.toContain('6000000')
  })

  test('1.5 * 2.0 = 3.0 → result 3000 (not 3000000)', () => {
    // Without correction: 1500 * 2000 = 3000000 (wrong)
    // With correction: 1500 * 2000 / 1000 = 3000 ✓
    const source = `
      fn t(): float {
        let a: float = 1.5;
        let b: float = 2.0;
        return a * b;
      }
    `
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('3000')
    expect(all).not.toContain('3000000')
  })

  test('0.5 * 0.5 = 0.25 → result 250 (not 250000)', () => {
    // Without correction: 500 * 500 = 250000 (wrong)
    // With correction: 500 * 500 / 1000 = 250 ✓
    const source = `
      fn t(): float {
        let a: float = 0.5;
        let b: float = 0.5;
        return a * b;
      }
    `
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('250')
    expect(all).not.toContain('250000')
  })
})

describe('float division (scale correction ×1000)', () => {
  test('6.0 / 2.0 = 3.0 → result 3000 (not 3)', () => {
    // Without correction: 6000 / 2000 = 3 (wrong)
    // With correction: 6000 * 1000 / 2000 = 3000 ✓
    const source = `
      fn t(): float {
        let a: float = 6.0;
        let b: float = 2.0;
        return a / b;
      }
    `
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('3000')
    // The uncorrected result would be 3 (without the trailing 000)
    // Check we get 3000 not just 3
    expect(all).toMatch(/3000/)
  })

  test('10.0 / 4.0 = 2.5 → result 2500 (not 2)', () => {
    // Without correction: 10000 / 4000 = 2 (wrong, loses precision)
    // With correction: 10000 * 1000 / 4000 = 2500 ✓
    const source = `
      fn t(): float {
        let a: float = 10.0;
        let b: float = 4.0;
        return a / b;
      }
    `
    const result = compile(source, { namespace: 'floattest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('2500')
  })
})
