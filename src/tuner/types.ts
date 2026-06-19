/**
 * Shared types for the redscript tuner system.
 */

export interface ParamSpec {
  name: string;
  range: [number, number]; // search range
  integer: boolean; // whether to force integer rounding
}

export interface TunerValueContract {
  scale: number;
  unit: string;
}

export interface TunerInputContract extends TunerValueContract {
  min: number;
  max: number;
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
  input?: TunerInputContract;
  output?: TunerValueContract;
  overflowPolicy?: string;

  // Simulate function with int32 semantics, returns fixed-point integer result
  simulate(input: number, params: Record<string, number>): number;

  // Reference value (floating-point) for error computation
  reference(input: number): number;

  // Generate input sample points
  sampleInputs(): number[];

  // Generate full .mcrs code with the optimal params
  generateCode(params: Record<string, number>, meta: ResultMeta): string;
}

export interface TunerManifest {
  schemaVersion: 1;
  adapter: string;
  description: string;
  generatedAt: string;
  strategy: 'nm' | 'sa';
  input?: TunerInputContract;
  output?: TunerValueContract;
  overflowPolicy?: string;
  params: Record<string, number>;
  paramSpecs: ParamSpec[];
  metrics: {
    maxError: number;
    mae: number;
    rmse: number;
  };
  budget: {
    requested: number;
    used: number;
  };
  samples: {
    count: number;
  };
  artifact: {
    codePath?: string;
    command: string;
  };
}

export interface SearchResult {
  params: Record<string, number>;
  maxError: number;
  mae: number;
  rmse: number;
  budgetUsed: number;
}
