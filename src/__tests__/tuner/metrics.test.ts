import { evaluate } from '../../tuner/metrics';
import { TunerAdapter, ParamSpec } from '../../tuner/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal TunerAdapter from plain arrays.
 * simulate() returns fixedPoint values (scaled by 10000).
 * reference() returns floating-point values.
 */
function makeAdapter(
  inputs: number[],
  simulateResults: number[],
  referenceResults: number[]
): TunerAdapter {
  return {
    name: 'test',
    description: 'test adapter',
    params: [] as ParamSpec[],
    sampleInputs: () => inputs,
    simulate: (_input: number, _params: Record<string, number>) => {
      const idx = inputs.indexOf(_input);
      return simulateResults[idx];
    },
    reference: (_input: number) => {
      const idx = inputs.indexOf(_input);
      return referenceResults[idx];
    },
    generateCode: () => '',
  };
}

// ---------------------------------------------------------------------------
// evaluate() — known inputs and expected outputs
// ---------------------------------------------------------------------------

describe('evaluate', () => {
  test('perfect simulation returns zero errors', () => {
    // simulate returns exactly the reference value (both in fixed-point units)
    // refFloat = 10000 / 10000 = 1.0, simFloat = 10000 / 10000 = 1.0
    const adapter = makeAdapter([1], [10000], [10000]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBe(0);
    expect(result.mae).toBe(0);
    expect(result.rmse).toBe(0);
  });

  test('single point with known error', () => {
    // simFloat = 10000/10000 = 1.0, refFloat = 11000/10000 = 1.1 → error = 0.1
    const adapter = makeAdapter([1], [10000], [11000]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBeCloseTo(0.1);
    expect(result.mae).toBeCloseTo(0.1);
    expect(result.rmse).toBeCloseTo(0.1);
  });

  test('two points, different errors — maxError tracks the worst', () => {
    // point 1: sim=10000, ref=10000 → error=0
    // point 2: sim=10000, ref=12000 → error=0.2
    const adapter = makeAdapter([1, 2], [10000, 10000], [10000, 12000]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBeCloseTo(0.2);
    expect(result.mae).toBeCloseTo(0.1); // (0 + 0.2) / 2
    expect(result.rmse).toBeCloseTo(Math.sqrt((0 + 0.04) / 2));
  });

  test('mae and rmse over multiple points with symmetric errors', () => {
    // point 1: sim=9000, ref=10000 → error=0.1
    // point 2: sim=11000, ref=10000 → error=0.1
    const adapter = makeAdapter([1, 2], [9000, 11000], [10000, 10000]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBeCloseTo(0.1);
    expect(result.mae).toBeCloseTo(0.1);
    expect(result.rmse).toBeCloseTo(0.1);
  });

  test('returns Infinity for all metrics when simulate returns Infinity', () => {
    const adapter = makeAdapter([1], [Infinity], [10000]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBe(Infinity);
    expect(result.mae).toBe(Infinity);
    expect(result.rmse).toBe(Infinity);
  });

  test('returns Infinity for all metrics when simulate returns NaN', () => {
    const adapter = makeAdapter([1], [NaN], [10000]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBe(Infinity);
    expect(result.mae).toBe(Infinity);
    expect(result.rmse).toBe(Infinity);
  });

  test('skips degenerate reference points (Infinity reference)', () => {
    // Only the valid second point contributes
    const adapter = makeAdapter([1, 2], [10000, 10000], [Infinity, 10000]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBe(0);
    expect(result.mae).toBe(0);
    expect(result.rmse).toBe(0);
  });

  test('skips degenerate reference points (NaN reference)', () => {
    const adapter = makeAdapter([1, 2], [10000, 10000], [NaN, 12000]);
    const result = evaluate(adapter, {});
    // Only point 2 contributes: sim=10000, ref=12000 → error=0.2
    expect(result.maxError).toBeCloseTo(0.2);
  });

  test('returns Infinity when all reference points are degenerate', () => {
    const adapter = makeAdapter([1], [10000], [Infinity]);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBe(Infinity);
    expect(result.mae).toBe(Infinity);
    expect(result.rmse).toBe(Infinity);
  });

  test('returns Infinity when sample input list is empty', () => {
    const adapter = makeAdapter([], [], []);
    const result = evaluate(adapter, {});
    expect(result.maxError).toBe(Infinity);
    expect(result.mae).toBe(Infinity);
    expect(result.rmse).toBe(Infinity);
  });

  test('params are forwarded to simulate', () => {
    // The adapter uses the params to offset its result
    const adapter: TunerAdapter = {
      name: 'param-test',
      description: '',
      params: [],
      sampleInputs: () => [1],
      simulate: (_input, params) => 10000 + (params['offset'] ?? 0),
      reference: () => 10000,
      generateCode: () => '',
    };
    // With no offset: error = 0
    expect(evaluate(adapter, {}).maxError).toBe(0);
    // With offset = 1000: simFloat = 1.1, refFloat = 1.0, error = 0.1
    expect(evaluate(adapter, { offset: 1000 }).maxError).toBeCloseTo(0.1);
  });
});
