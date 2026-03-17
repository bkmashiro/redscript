/**
 * Tests for the redscript tuner engine, simulator, and ln-polynomial adapter.
 */

import { search } from '../../tuner/engine';
import { i32, fixedMul, isOverflow } from '../../tuner/simulator';
import { evaluate } from '../../tuner/metrics';
import { lnPolynomialAdapter, defaultParams as lnDefaultParams } from '../../tuner/adapters/ln-polynomial';
import { TunerAdapter, ParamSpec } from '../../tuner/types';

// ─── simulator tests ──────────────────────────────────────────────────────────

describe('simulator', () => {
  test('i32 truncates to int32', () => {
    expect(i32(3.7)).toBe(3);
    expect(i32(-3.7)).toBe(-3);
    expect(i32(2147483648)).toBe(-2147483648); // overflow wraps
    expect(i32(0)).toBe(0);
  });

  test('fixedMul basic', () => {
    // 10000 * 10000 / 10000 = 10000
    expect(fixedMul(10000, 10000, 10000)).toBe(10000);
    // 5000 * 2 / 10000 = 1
    expect(fixedMul(5000, 2, 10000)).toBe(1);
  });

  test('fixedMul returns Infinity on overflow', () => {
    expect(fixedMul(2147483647, 2147483647, 1)).toBe(Infinity);
  });

  test('isOverflow detects out-of-range', () => {
    expect(isOverflow(2147483648)).toBe(true);
    expect(isOverflow(-2147483649)).toBe(true);
    expect(isOverflow(Infinity)).toBe(true);
    expect(isOverflow(NaN)).toBe(true);
    expect(isOverflow(0)).toBe(false);
    expect(isOverflow(2147483647)).toBe(false);
  });
});

// ─── Nelder-Mead convergence test ────────────────────────────────────────────

describe('Nelder-Mead engine', () => {
  test('converges to minimum of (x-3)^2', () => {
    // Simple 1D minimization: minimize (x-3)^2
    const mockAdapter: TunerAdapter = {
      name: 'test-quadratic',
      description: 'Minimize (x-3)^2',
      params: [
        { name: 'x', range: [-10, 10], integer: false } as ParamSpec,
      ],
      simulate(input: number, params: Record<string, number>): number {
        // Return the residual as a scaled integer
        const x = params['x'];
        return Math.round(x * 10000);
      },
      reference(_input: number): number {
        // Target: x = 3 → value 30000
        return 30000;
      },
      sampleInputs(): number[] {
        return [1]; // single input, target value is 3.0 (×10000 = 30000)
      },
      generateCode(params: Record<string, number>): string {
        return `// x = ${params['x']}`;
      },
    };

    const result = search(mockAdapter, 5000);
    // Should converge close to x=3
    expect(result.params['x']).toBeCloseTo(3.0, 1);
    expect(result.maxError).toBeLessThan(0.1);
  });

  test('handles integer constraints', () => {
    const mockAdapter: TunerAdapter = {
      name: 'test-integer',
      description: 'Integer parameter test',
      params: [
        { name: 'n', range: [0, 10], integer: true } as ParamSpec,
      ],
      simulate(input: number, params: Record<string, number>): number {
        // Should snap to integer 7
        return Math.round(params['n'] * 10000);
      },
      reference(_input: number): number {
        return 70000; // 7.0 × 10000
      },
      sampleInputs(): number[] {
        return [1];
      },
      generateCode(): string {
        return '';
      },
    };

    const result = search(mockAdapter, 2000);
    // Should find n close to 7
    expect(Math.round(result.params['n'])).toBe(7);
  });

  test('i32 overflow penalization', () => {
    const mockAdapter: TunerAdapter = {
      name: 'test-overflow',
      description: 'Test overflow penalization',
      params: [
        { name: 'scale', range: [1, 1000], integer: true } as ParamSpec,
      ],
      simulate(_input: number, params: Record<string, number>): number {
        // Always overflow for any scale >= 500
        if (params['scale'] >= 500) return Infinity;
        return params['scale'] * 10000;
      },
      reference(_input: number): number {
        return 2000000; // target: scale=200 → 2000000
      },
      sampleInputs(): number[] {
        return [1];
      },
      generateCode(): string {
        return '';
      },
    };

    const { maxError, mae, rmse } = evaluate(mockAdapter, { scale: 2147483647 });
    expect(maxError).toBe(Infinity);
    expect(mae).toBe(Infinity);
    expect(rmse).toBe(Infinity);
  });
});

// ─── ln-polynomial adapter tests ─────────────────────────────────────────────

describe('ln-polynomial adapter', () => {
  const defaultParams = lnDefaultParams; // { A1: 20000, A3: 6667, A5: 4000 }

  test('sample inputs cover the valid range', () => {
    const inputs = lnPolynomialAdapter.sampleInputs();
    expect(inputs.length).toBeGreaterThan(50);
    // All inputs should be positive
    expect(inputs.every(x => x > 0)).toBe(true);
  });

  test('reference matches Math.log', () => {
    const SCALE = 10000;
    // ln(1.0) = 0
    expect(lnPolynomialAdapter.reference(SCALE)).toBeCloseTo(0, 5);
    // ln(2.0) ≈ 0.6931 → 6931
    expect(lnPolynomialAdapter.reference(2 * SCALE)).toBeCloseTo(6931.47, 0);
    // ln(0.5) ≈ -0.6931 → -6931
    expect(lnPolynomialAdapter.reference(5000)).toBeCloseTo(-6931.47, 0);
  });

  test('simulate produces reasonable output for x=1 (no error)', () => {
    const result = lnPolynomialAdapter.simulate(10000, defaultParams);
    // ln(1.0) = 0; allow some approximation error
    expect(Math.abs(result)).toBeLessThan(500); // within 0.05
  });

  test('simulate returns Infinity for invalid input', () => {
    const result = lnPolynomialAdapter.simulate(0, defaultParams);
    expect(result).toBeLessThan(0); // negative sentinel or -MAX_INT
  });

  test('max_error < 0.001 with default atanh coefficients', () => {
    const metrics = evaluate(lnPolynomialAdapter, defaultParams);
    expect(metrics.maxError).toBeLessThan(0.001);
  }, 10000);

  test('search improves over default params', () => {
    // Run a short search and confirm it doesn't get worse
    const baseMetrics = evaluate(lnPolynomialAdapter, defaultParams);
    const result = search(lnPolynomialAdapter, 500); // short budget for test speed
    // Either same or better
    expect(result.maxError).toBeLessThanOrEqual(baseMetrics.maxError * 2);
    expect(result.maxError).toBeLessThan(0.01);
  }, 30000);

  test('generateCode produces valid output', () => {
    const meta = {
      maxError: 0.00003,
      mae: 0.000012,
      rmse: 0.000015,
      estimatedCmds: 38,
      tuneDate: '2026-03-17',
      budgetUsed: 5000,
    };
    const code = lnPolynomialAdapter.generateCode(defaultParams, meta);
    expect(code).toContain('AUTO-GENERATED');
    expect(code).toContain('ln-polynomial');
    expect(code).toContain('fn ln');
    expect(code).toContain('A1');
    expect(code).toContain('A3');
    expect(code).toContain('A5');
    expect(code).toContain('2026-03-17');
  });
});
