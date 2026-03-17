/**
 * Error metrics for tuner adapters.
 */

import { TunerAdapter } from './types';

export interface EvaluationResult {
  maxError: number;
  mae: number;
  rmse: number;
}

/**
 * Evaluate an adapter with given params across all sample inputs.
 * Returns max_error, mae, and rmse relative to the reference function.
 * Penalizes overflow by returning Infinity for all metrics.
 */
export function evaluate(
  adapter: TunerAdapter,
  params: Record<string, number>
): EvaluationResult {
  const inputs = adapter.sampleInputs();
  let maxError = 0;
  let sumAbsError = 0;
  let sumSqError = 0;
  let count = 0;

  for (const input of inputs) {
    const simResult = adapter.simulate(input, params);
    const refResult = adapter.reference(input);

    // Penalize overflow or NaN
    if (!isFinite(simResult) || isNaN(simResult)) {
      return { maxError: Infinity, mae: Infinity, rmse: Infinity };
    }

    if (!isFinite(refResult) || isNaN(refResult)) {
      continue; // skip degenerate reference points
    }

    // Both are in fixed-point; normalize to compare in floating-point units
    const SCALE = 10000;
    const simFloat = simResult / SCALE;
    const refFloat = refResult / SCALE;

    const absError = Math.abs(simFloat - refFloat);
    if (absError === Infinity) {
      return { maxError: Infinity, mae: Infinity, rmse: Infinity };
    }

    if (absError > maxError) maxError = absError;
    sumAbsError += absError;
    sumSqError += absError * absError;
    count++;
  }

  if (count === 0) {
    return { maxError: Infinity, mae: Infinity, rmse: Infinity };
  }

  return {
    maxError,
    mae: sumAbsError / count,
    rmse: Math.sqrt(sumSqError / count),
  };
}
