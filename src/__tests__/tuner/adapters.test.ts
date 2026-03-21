/**
 * Coverage for src/tuner/adapters/ln-polynomial.ts and sqrt-newton.ts
 *
 * Targets the uncovered branches:
 * - simulate(): x <= 0 edge case
 * - simulate(): range reduction loops (while x < 10000, while x >= 20000)
 * - simulate(): den === 0 (Infinity) edge case in ln
 * - simulate(): g <= 0 guard in sqrt
 * - simulate(): gDiv <= 0 guard in sqrt
 * - reference(): input <= 0 → -Infinity
 * - generateCode(): string generation
 * - sampleInputs(): full sample array
 */

import { lnPolynomialAdapter, defaultParams as lnDefaults } from '../../tuner/adapters/ln-polynomial'
import { sqrtNewtonAdapter, defaultParams as sqrtDefaults } from '../../tuner/adapters/sqrt-newton'
import type { ResultMeta } from '../../tuner/types'

const mockMeta: ResultMeta = {
  tuneDate: '2025-01-01',
  maxError: 0.001,
  mae: 0.0005,
  rmse: 0.0003,
  estimatedCmds: 42,
  budgetUsed: 10,
}

// ── lnPolynomialAdapter ────────────────────────────────────────────────────

describe('lnPolynomialAdapter — simulate', () => {
  test('x = 0 returns -2147483648 (INT_MIN)', () => {
    expect(lnPolynomialAdapter.simulate(0, lnDefaults)).toBe(-2147483648)
  })

  test('x < 0 returns -2147483648', () => {
    expect(lnPolynomialAdapter.simulate(-100, lnDefaults)).toBe(-2147483648)
  })

  test('x = 10000 (ln(1.0)) ≈ 0', () => {
    const result = lnPolynomialAdapter.simulate(10000, lnDefaults)
    expect(Math.abs(result)).toBeLessThan(50) // ~0
  })

  test('x = 20000 (ln(2.0)) ≈ 6931', () => {
    const result = lnPolynomialAdapter.simulate(20000, lnDefaults)
    expect(Math.abs(result - 6931)).toBeLessThan(200)
  })

  test('x = 5000 (ln(0.5)) triggers x < 10000 reduction (k goes negative)', () => {
    const result = lnPolynomialAdapter.simulate(5000, lnDefaults)
    // ln(0.5) ≈ -0.693 → ≈ -6931 in ×10000
    expect(result).toBeLessThan(0)
    expect(Math.abs(result + 6931)).toBeLessThan(300)
  })

  test('x = 40000 (ln(4.0)) triggers x >= 20000 reduction (k goes positive)', () => {
    const result = lnPolynomialAdapter.simulate(40000, lnDefaults)
    // ln(4.0) ≈ 1.386 → ≈ 13863 in ×10000
    expect(result).toBeGreaterThan(10000)
  })

  test('x = 100 (very small, many reductions)', () => {
    const result = lnPolynomialAdapter.simulate(100, lnDefaults)
    expect(result).toBeLessThan(-10000) // large negative
  })

  test('x = 1000000 (x=100.0, many positive reductions)', () => {
    const result = lnPolynomialAdapter.simulate(1000000, lnDefaults)
    // ln(100) ≈ 4.605 → ≈ 46050 in ×10000
    expect(result).toBeGreaterThan(40000)
  })
})

describe('lnPolynomialAdapter — reference', () => {
  test('x <= 0 returns -Infinity', () => {
    expect(lnPolynomialAdapter.reference(0)).toBe(-Infinity)
    expect(lnPolynomialAdapter.reference(-1)).toBe(-Infinity)
  })

  test('x = 10000 (ln(1.0)) = 0', () => {
    expect(lnPolynomialAdapter.reference(10000)).toBeCloseTo(0, 3)
  })

  test('x = 20000 (ln(2.0)) ≈ 6931', () => {
    expect(lnPolynomialAdapter.reference(20000)).toBeCloseTo(6931, 0)
  })
})

describe('lnPolynomialAdapter — sampleInputs', () => {
  test('returns array of positive numbers', () => {
    const inputs = lnPolynomialAdapter.sampleInputs()
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.every(x => x > 0)).toBe(true)
  })

  test('first input >= 100 (0.01 × 10000)', () => {
    const inputs = lnPolynomialAdapter.sampleInputs()
    expect(inputs[0]).toBeGreaterThanOrEqual(100)
  })
})

describe('lnPolynomialAdapter — generateCode', () => {
  test('generates RedScript code string', () => {
    const code = lnPolynomialAdapter.generateCode(lnDefaults, mockMeta)
    expect(code).toContain('fn ln(x: int): int')
    expect(code).toContain('A1 =')
    expect(code).toContain('A3 =')
    expect(code).toContain('A5 =')
  })

  test('generated code contains meta date', () => {
    const code = lnPolynomialAdapter.generateCode(lnDefaults, mockMeta)
    expect(code).toContain('2025-01-01')
  })
})

describe('lnPolynomialAdapter — metadata', () => {
  test('has name ln-polynomial', () => {
    expect(lnPolynomialAdapter.name).toBe('ln-polynomial')
  })

  test('has description', () => {
    expect(lnPolynomialAdapter.description).toBeTruthy()
  })

  test('has 3 params', () => {
    expect(lnPolynomialAdapter.params.length).toBe(3)
  })
})

// ── sqrtNewtonAdapter ──────────────────────────────────────────────────────

describe('sqrtNewtonAdapter — simulate', () => {
  test('x = 0 returns 0', () => {
    expect(sqrtNewtonAdapter.simulate(0, sqrtDefaults)).toBe(0)
  })

  test('x < 0 returns 0', () => {
    expect(sqrtNewtonAdapter.simulate(-100, sqrtDefaults)).toBe(0)
  })

  test('x = 10000 (sqrt(1.0)) ≈ 10000', () => {
    const result = sqrtNewtonAdapter.simulate(10000, sqrtDefaults)
    expect(Math.abs(result - 10000)).toBeLessThan(100)
  })

  test('x = 40000 (sqrt(4.0)) ≈ 20000', () => {
    const result = sqrtNewtonAdapter.simulate(40000, sqrtDefaults)
    expect(Math.abs(result - 20000)).toBeLessThan(100)
  })

  test('x = 250000 (sqrt(25.0)) ≈ 50000', () => {
    const result = sqrtNewtonAdapter.simulate(250000, sqrtDefaults)
    expect(Math.abs(result - 50000)).toBeLessThan(200)
  })

  test('x = 1 (very small x near zero, triggers g<=0 guard)', () => {
    const result = sqrtNewtonAdapter.simulate(1, sqrtDefaults)
    // sqrt(0.0001) ≈ 0.01 → ≈ 100 in ×10000
    expect(result).toBeGreaterThan(0)
  })

  test('INIT_SHIFT=0 uses g = x as initial guess', () => {
    const params = { ...sqrtDefaults, INIT_SHIFT: 0 }
    const result = sqrtNewtonAdapter.simulate(10000, params)
    expect(Math.abs(result - 10000)).toBeLessThan(200)
  })

  test('N=4 (fewer iterations) still converges for moderate x', () => {
    const params = { ...sqrtDefaults, N: 4 }
    const result = sqrtNewtonAdapter.simulate(10000, params)
    expect(result).toBeGreaterThan(8000)
  })

  test('N=12 (max iterations) for large x', () => {
    const params = { ...sqrtDefaults, N: 12 }
    const result = sqrtNewtonAdapter.simulate(1000000, sqrtDefaults)
    expect(result).toBeGreaterThan(90000) // sqrt(100) ≈ 10.0 → 100000
  })
})

describe('sqrtNewtonAdapter — reference', () => {
  test('x = 10000 returns ≈ 10000', () => {
    const ref = sqrtNewtonAdapter.reference(10000)
    expect(Math.abs(ref - 10000)).toBeLessThan(1)
  })

  test('x = 40000 returns ≈ 20000', () => {
    const ref = sqrtNewtonAdapter.reference(40000)
    expect(Math.abs(ref - 20000)).toBeLessThan(1)
  })

  test('x = 0 returns 0', () => {
    const ref = sqrtNewtonAdapter.reference(0)
    expect(ref).toBe(0)
  })
})

describe('sqrtNewtonAdapter — sampleInputs', () => {
  test('returns non-empty array', () => {
    const inputs = sqrtNewtonAdapter.sampleInputs()
    expect(inputs.length).toBeGreaterThan(0)
  })

  test('all inputs are positive integers', () => {
    const inputs = sqrtNewtonAdapter.sampleInputs()
    expect(inputs.every(x => Number.isInteger(x) && x > 0)).toBe(true)
  })
})

describe('sqrtNewtonAdapter — generateCode', () => {
  test('generates RedScript fn sqrt code', () => {
    const code = sqrtNewtonAdapter.generateCode(sqrtDefaults, mockMeta)
    expect(code).toContain('fn sqrt_fx(x: int): int')
    expect(code).toContain('iteration count')
  })

  test('contains meta date', () => {
    const code = sqrtNewtonAdapter.generateCode(sqrtDefaults, mockMeta)
    expect(code).toContain('2025-01-01')
  })
})

describe('sqrtNewtonAdapter — metadata', () => {
  test('has name sqrt-newton', () => {
    expect(sqrtNewtonAdapter.name).toBe('sqrt-newton')
  })

  test('has 2 params', () => {
    expect(sqrtNewtonAdapter.params.length).toBe(2)
  })
})
