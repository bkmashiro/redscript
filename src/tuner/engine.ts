/**
 * Nelder-Mead simplex optimization engine for hyperparameter tuning.
 * Suitable for continuous parameter spaces without gradient information.
 * Supports mixed-integer parameters.
 */

import { TunerAdapter, SearchResult, ParamSpec } from './types';
import { evaluate } from './metrics';

export type ProgressCallback = (iteration: number, bestError: number) => void;

interface SimplexPoint {
  coords: number[];
  score: number;
}

/**
 * Apply integer constraints to parameters.
 */
function applyIntegerConstraints(
  coords: number[],
  specs: ParamSpec[]
): number[] {
  return coords.map((v, i) => {
    const spec = specs[i];
    // Clamp to range
    const clamped = Math.max(spec.range[0], Math.min(spec.range[1], v));
    return spec.integer ? Math.round(clamped) : clamped;
  });
}

/**
 * Convert coordinate array to params record.
 */
function coordsToParams(
  coords: number[],
  specs: ParamSpec[]
): Record<string, number> {
  const params: Record<string, number> = {};
  for (let i = 0; i < specs.length; i++) {
    params[specs[i].name] = coords[i];
  }
  return params;
}

/**
 * Evaluate a point using the adapter.
 */
function scorePoint(
  coords: number[],
  specs: ParamSpec[],
  adapter: TunerAdapter
): number {
  const constrained = applyIntegerConstraints(coords, specs);
  const params = coordsToParams(constrained, specs);
  const metrics = evaluate(adapter, params);
  return metrics.maxError;
}

/**
 * Run Nelder-Mead optimization.
 */
export function search(
  adapter: TunerAdapter,
  budget: number = 10000,
  onProgress?: ProgressCallback
): SearchResult {
  const specs = adapter.params;
  const n = specs.length;

  if (n === 0) {
    // No params to optimize
    const params = coordsToParams([], specs);
    const metrics = evaluate(adapter, params);
    return {
      params,
      maxError: metrics.maxError,
      mae: metrics.mae,
      rmse: metrics.rmse,
      budgetUsed: 0,
    };
  }

  // Nelder-Mead parameters
  const alpha = 1.0; // reflection
  const gamma = 2.0; // expansion
  const rho = 0.5; // contraction
  const sigma = 0.5; // shrink

  // Initialize simplex with n+1 points
  const simplex: SimplexPoint[] = [];

  // Start point: midpoint of each parameter range
  const startCoords = specs.map(s => (s.range[0] + s.range[1]) / 2);
  simplex.push({
    coords: startCoords,
    score: scorePoint(startCoords, specs, adapter),
  });

  // Generate remaining n points by perturbing each dimension
  for (let i = 0; i < n; i++) {
    const coords = [...startCoords];
    const span = specs[i].range[1] - specs[i].range[0];
    // Perturb by 20% of the range
    coords[i] = startCoords[i] + span * 0.2;
    simplex.push({
      coords,
      score: scorePoint(coords, specs, adapter),
    });
  }

  let iteration = 0;

  while (iteration < budget) {
    // Sort simplex by score (ascending = better)
    simplex.sort((a, b) => a.score - b.score);

    const best = simplex[0];
    const worst = simplex[n];
    const secondWorst = simplex[n - 1];

    if (onProgress && iteration % 100 === 0) {
      onProgress(iteration, best.score);
    }

    // Check convergence: if all scores are the same, we're stuck
    if (
      simplex[n].score - simplex[0].score < 1e-15 &&
      iteration > 100
    ) {
      break;
    }

    // Compute centroid of all but worst
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i].coords[j] / n;
      }
    }

    // Reflection
    const reflected = centroid.map(
      (c, j) => c + alpha * (c - worst.coords[j])
    );
    const reflectedScore = scorePoint(reflected, specs, adapter);
    iteration++;

    if (reflectedScore < best.score) {
      // Expansion
      const expanded = centroid.map(
        (c, j) => c + gamma * (reflected[j] - c)
      );
      const expandedScore = scorePoint(expanded, specs, adapter);
      iteration++;

      if (expandedScore < reflectedScore) {
        simplex[n] = { coords: expanded, score: expandedScore };
      } else {
        simplex[n] = { coords: reflected, score: reflectedScore };
      }
    } else if (reflectedScore < secondWorst.score) {
      simplex[n] = { coords: reflected, score: reflectedScore };
    } else {
      // Contraction
      const useReflected = reflectedScore < worst.score;
      const contractionBase = useReflected ? reflected : worst.coords;
      const contracted = centroid.map(
        (c, j) => c + rho * (contractionBase[j] - c)
      );
      const contractedScore = scorePoint(contracted, specs, adapter);
      iteration++;

      if (contractedScore < (useReflected ? reflectedScore : worst.score)) {
        simplex[n] = { coords: contracted, score: contractedScore };
      } else {
        // Shrink
        for (let i = 1; i <= n; i++) {
          simplex[i].coords = simplex[0].coords.map(
            (c, j) => c + sigma * (simplex[i].coords[j] - c)
          );
          simplex[i].score = scorePoint(simplex[i].coords, specs, adapter);
          iteration++;
        }
      }
    }
  }

  // Sort final simplex
  simplex.sort((a, b) => a.score - b.score);
  const bestCoords = applyIntegerConstraints(simplex[0].coords, specs);
  const bestParams = coordsToParams(bestCoords, specs);
  const finalMetrics = evaluate(adapter, bestParams);

  return {
    params: bestParams,
    maxError: finalMetrics.maxError,
    mae: finalMetrics.mae,
    rmse: finalMetrics.rmse,
    budgetUsed: iteration,
  };
}

/**
 * Simulated Annealing search strategy.
 * More robust than Nelder-Mead for integer parameters and multimodal objectives.
 * Uses 3 independent restarts, taking the global best.
 */
export function searchSA(
  adapter: TunerAdapter,
  budget: number,
  onProgress?: ProgressCallback,
): SearchResult {
  const RESTARTS = 3;
  const budgetPerRun = Math.floor(budget / RESTARTS);
  let globalBest: { params: Record<string, number>; error: number } | null = null;

  for (let r = 0; r < RESTARTS; r++) {
    // Random initialisation within param ranges
    let current: Record<string, number> = {};
    for (const p of adapter.params) {
      current[p.name] = p.range[0] + Math.random() * (p.range[1] - p.range[0]);
      if (p.integer) current[p.name] = Math.round(current[p.name]);
    }

    // T: 1.0 → 1e-4 over budgetPerRun iterations
    let T = 1.0;
    const cooling = Math.pow(1e-4, 1 / budgetPerRun);
    let currentError = evaluate(adapter, current).maxError;
    let bestLocal = { params: { ...current }, error: currentError };

    for (let i = 0; i < budgetPerRun; i++) {
      T *= cooling;
      // Perturb one random param by ±10% of its range
      const neighbor = { ...current };
      const spec = adapter.params[Math.floor(Math.random() * adapter.params.length)];
      const step = (spec.range[1] - spec.range[0]) * 0.1 * (Math.random() * 2 - 1);
      neighbor[spec.name] = Math.max(
        spec.range[0],
        Math.min(spec.range[1], neighbor[spec.name] + step),
      );
      if (spec.integer) neighbor[spec.name] = Math.round(neighbor[spec.name]);

      const neighborError = evaluate(adapter, neighbor).maxError;
      const delta = neighborError - currentError;
      if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
        current = neighbor;
        currentError = neighborError;
      }
      if (currentError < bestLocal.error) {
        bestLocal = { params: { ...current }, error: currentError };
      }
      const globalIter = r * budgetPerRun + i;
      if (onProgress && globalIter % 100 === 0) {
        onProgress(globalIter, globalBest?.error ?? bestLocal.error);
      }
    }

    if (!globalBest || bestLocal.error < globalBest.error) {
      globalBest = bestLocal;
    }
  }

  const finalMetrics = evaluate(adapter, globalBest!.params);
  return {
    params: globalBest!.params,
    maxError: finalMetrics.maxError,
    mae: finalMetrics.mae,
    rmse: finalMetrics.rmse,
    budgetUsed: budget,
  };
}
