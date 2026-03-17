/**
 * Shared types for the redscript tuner system.
 */

export interface ParamSpec {
  name: string;
  range: [number, number]; // search range
  integer: boolean; // whether to force integer rounding
}

export interface ResultMeta {
  maxError: number;
  mae: number;
  rmse: number;
  estimatedCmds: number; // estimated mcfunction command count
  tuneDate: string;
  budgetUsed: number;
}

export interface TunerAdapter {
  name: string;
  description: string;
  params: ParamSpec[];

  // Simulate function with int32 semantics, returns fixed-point integer result
  simulate(input: number, params: Record<string, number>): number;

  // Reference value (floating-point) for error computation
  reference(input: number): number;

  // Generate input sample points
  sampleInputs(): number[];

  // Generate full .mcrs code with the optimal params
  generateCode(params: Record<string, number>, meta: ResultMeta): string;
}

export interface SearchResult {
  params: Record<string, number>;
  maxError: number;
  mae: number;
  rmse: number;
  budgetUsed: number;
}
