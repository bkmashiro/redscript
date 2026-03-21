/**
 * Extra coverage for tuner/simulator, tuner/metrics, tuner/adapters/sqrt-newton.
 */

import {
  i32, isOverflow, fixedMul, safeAdd, safeSub, safeMul, safeDiv,
  INT32_MAX, INT32_MIN,
} from '../../tuner/simulator'
import { evaluate } from '../../tuner/metrics'
import { sqrtNewtonAdapter, defaultParams as sqrtDefaultParams } from '../../tuner/adapters/sqrt-newton'
import type { TunerAdapter, ResultMeta } from '../../tuner/types'

// ─── simulator: safeAdd / safeSub / safeMul / safeDiv ─────────────────────

describe('simulator — safe arithmetic', () => {
  test('safeAdd normal values', () => {
    expect(safeAdd(10, 20)).toBe(30)
    expect(safeAdd(-5, 3)).toBe(-2)
    expect(safeAdd(0, 0)).toBe(0)
  })

  test('safeAdd returns Infinity on overflow', () => {
    expect(safeAdd(INT32_MAX, 1)).toBe(Infinity)
    expect(safeAdd(INT32_MIN, -1)).toBe(Infinity)
  })

  test('safeSub normal values', () => {
    expect(safeSub(10, 3)).toBe(7)
    expect(safeSub(-5, -3)).toBe(-2)
  })

  test('safeSub returns Infinity on overflow', () => {
    expect(safeSub(INT32_MIN, 1)).toBe(Infinity)
    expect(safeSub(INT32_MAX, -1)).toBe(Infinity)
  })

  test('safeMul normal values', () => {
    expect(safeMul(6, 7)).toBe(42)
    expect(safeMul(-3, 4)).toBe(-12)
    expect(safeMul(0, 999)).toBe(0)
  })

  test('safeMul returns Infinity on overflow', () => {
    expect(safeMul(INT32_MAX, 2)).toBe(Infinity)
  })

  test('safeDiv normal values', () => {
    expect(safeDiv(10, 2)).toBe(5)
    expect(safeDiv(-9, 3)).toBe(-3)
    expect(safeDiv(7, 2)).toBe(3) // truncates toward zero
  })

  test('safeDiv returns Infinity on division by zero', () => {
    expect(safeDiv(100, 0)).toBe(Infinity)
  })

  test('fixedMul overflow on divided result', () => {
    // Force the "divided overflow" branch: a*b fits but divided/scale overflows
    // Use scale=0 to make divided = product/0 = Infinity
    // Actually, JS division by 0 gives Infinity not NaN for non-zero numerator
    const result = fixedMul(1000, 1000, 0)
    expect(result).toBe(Infinity)
  })

  test('isOverflow edge cases', () => {
    expect(isOverflow(INT32_MAX)).toBe(false)
    expect(isOverflow(INT32_MIN)).toBe(false)
    expect(isOverflow(INT32_MAX + 1)).toBe(true)
    expect(isOverflow(INT32_MIN - 1)).toBe(true)
  })
})

// ─── metrics: evaluate edge cases ─────────────────────────────────────────

describe('metrics — evaluate', () => {
  test('returns Infinity when simulate returns Infinity', () => {
    const adapter: TunerAdapter = {
      name: 'overflow-adapter',
      description: 'always overflows',
      params: [],
      simulate: () => Infinity,
      reference: () => 10000,
      sampleInputs: () => [10000],
      generateCode: () => '',
    }
    const result = evaluate(adapter, {})
    expect(result.maxError).toBe(Infinity)
    expect(result.mae).toBe(Infinity)
    expect(result.rmse).toBe(Infinity)
  })

  test('returns Infinity when simulate returns NaN', () => {
    const adapter: TunerAdapter = {
      name: 'nan-adapter',
      description: 'returns NaN',
      params: [],
      simulate: () => NaN,
      reference: () => 10000,
      sampleInputs: () => [10000],
      generateCode: () => '',
    }
    const result = evaluate(adapter, {})
    expect(result.maxError).toBe(Infinity)
  })

  test('skips degenerate reference points (Infinity)', () => {
    const adapter: TunerAdapter = {
      name: 'degenerate-ref',
      description: 'ref returns Infinity',
      params: [],
      simulate: () => 10000,
      reference: () => Infinity,
      sampleInputs: () => [10000],
      generateCode: () => '',
    }
    // count=0 → all metrics Infinity
    const result = evaluate(adapter, {})
    expect(result.maxError).toBe(Infinity)
  })

  test('returns Infinity when empty sample inputs', () => {
    const adapter: TunerAdapter = {
      name: 'empty-adapter',
      description: 'no inputs',
      params: [],
      simulate: () => 0,
      reference: () => 0,
      sampleInputs: () => [],
      generateCode: () => '',
    }
    const result = evaluate(adapter, {})
    expect(result.maxError).toBe(Infinity)
  })

  test('computes metrics for perfect match', () => {
    const adapter: TunerAdapter = {
      name: 'perfect',
      description: 'exact match',
      params: [],
      simulate: (x) => x,
      reference: (x) => x,
      sampleInputs: () => [10000, 20000, 30000],
      generateCode: () => '',
    }
    const result = evaluate(adapter, {})
    expect(result.maxError).toBe(0)
    expect(result.mae).toBe(0)
    expect(result.rmse).toBe(0)
  })
})

// ─── sqrt-newton adapter ──────────────────────────────────────────────────

describe('sqrtNewtonAdapter', () => {
  test('simulate returns 0 for x <= 0', () => {
    expect(sqrtNewtonAdapter.simulate(0, sqrtDefaultParams)).toBe(0)
    expect(sqrtNewtonAdapter.simulate(-1, sqrtDefaultParams)).toBe(0)
  })

  test('simulate reasonable for perfect squares', () => {
    // sqrt(1.0) = 1.0 → input 10000, expected ~10000
    const result = sqrtNewtonAdapter.simulate(10000, sqrtDefaultParams)
    expect(result).toBeCloseTo(10000, -2) // within 100 units
    // sqrt(4.0) = 2.0 → input 40000, expected ~20000
    const result2 = sqrtNewtonAdapter.simulate(40000, sqrtDefaultParams)
    expect(result2).toBeCloseTo(20000, -2)
  })

  test('reference returns 0 for x <= 0', () => {
    expect(sqrtNewtonAdapter.reference(0)).toBe(0)
    expect(sqrtNewtonAdapter.reference(-10)).toBe(0)
  })

  test('reference returns correct sqrt', () => {
    // sqrt(1.0) = 1.0 → 10000
    expect(sqrtNewtonAdapter.reference(10000)).toBe(10000)
    // sqrt(4.0) = 2.0 → 20000
    expect(sqrtNewtonAdapter.reference(40000)).toBe(20000)
    // sqrt(9.0) = 3.0 → 30000
    expect(sqrtNewtonAdapter.reference(90000)).toBe(30000)
  })

  test('sampleInputs returns an array of positive numbers', () => {
    const inputs = sqrtNewtonAdapter.sampleInputs()
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.every(x => x > 0)).toBe(true)
  })

  test('generateCode produces valid code string', () => {
    const meta: ResultMeta = {
      tuneDate: '2026-01-01',
      maxError: 0.01,
      mae: 0.005,
      rmse: 0.007,
      estimatedCmds: 42,
      budgetUsed: 100,
    }
    const code = sqrtNewtonAdapter.generateCode!(sqrtDefaultParams, meta)
    expect(code).toContain('fn sqrt_fx')
    expect(code).toContain('return g;')
    expect(code).toContain('sqrt-newton')
  })

  test('evaluate with sqrtNewton gives finite metrics', () => {
    const result = evaluate(sqrtNewtonAdapter, sqrtDefaultParams)
    expect(result.maxError).toBeLessThan(0.5)
    expect(result.mae).toBeLessThan(0.5)
    expect(result.rmse).toBeLessThan(0.5)
  })

  test('INIT_SHIFT=0 still converges', () => {
    const params = { N: 8, INIT_SHIFT: 0 }
    const result = sqrtNewtonAdapter.simulate(10000, params)
    expect(result).toBeGreaterThan(0)
  })

  test('INIT_SHIFT=3 (x/8 initial guess) still converges', () => {
    const params = { N: 12, INIT_SHIFT: 3 }
    const result = sqrtNewtonAdapter.simulate(10000, params)
    expect(result).toBeGreaterThan(0)
  })
})
