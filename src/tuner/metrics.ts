/**
 * Error metrics for tuner adapters.
 */

import { TunerAdapter, TunerSimulationReport } from './types';

export interface EvaluationResult {
  maxError: number;
  mae: number;
  rmse: number;
}

export function buildSimulationReport(
  adapter: TunerAdapter,
  params: Record<string, number>
): TunerSimulationReport {
  const inputs = adapter.sampleInputs();
  const uniqueInputs = Array.from(new Set(inputs));
  const min = inputs.length > 0 ? Math.min(...inputs) : undefined;
  const max = inputs.length > 0 ? Math.max(...inputs) : undefined;

  let inRangeCount = 0;
  let outOfRangeCount = 0;
  if (adapter.input) {
    for (const input of inputs) {
      if (input >= adapter.input.min && input <= adapter.input.max) {
        inRangeCount++;
      } else {
        outOfRangeCount++;
      }
    }
  }

  let nonFiniteSimCount = 0;
  let invalidReferenceCount = 0;
  for (const input of inputs) {
    const simResult = adapter.simulate(input, params);
    if (!isFinite(simResult) || isNaN(simResult)) {
      nonFiniteSimCount++;
    }

    const refResult = adapter.reference(input);
    if (!isFinite(refResult) || isNaN(refResult)) {
      invalidReferenceCount++;
    }
  }

  return {
    samples: {
      count: inputs.length,
      uniqueCount: uniqueInputs.length,
      min,
      max,
      ...(adapter.input ? {
        containsDeclaredMin: inputs.includes(adapter.input.min),
        containsDeclaredMax: inputs.includes(adapter.input.max),
        inRangeCount,
        outOfRangeCount,
      } : {}),
    },
    overflow: {
      nonFiniteSimCount,
      invalidReferenceCount,
    },
  };
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
