/**
 * CLI entry point for `redscript tune`.
 * Usage: redscript tune --adapter <name> [--budget N] [--out path] [--manifest-out path]
 */

import * as fs from 'fs';
import * as path from 'path';
import { search, searchSA } from './engine';
import { lnPolynomialAdapter } from './adapters/ln-polynomial';
import { sqrtNewtonAdapter } from './adapters/sqrt-newton';
import { TunerAdapter, ResultMeta, TunerManifest } from './types';

const ADAPTERS: Record<string, TunerAdapter> = {
  'ln-polynomial': lnPolynomialAdapter,
  'sqrt-newton':   sqrtNewtonAdapter,
};

function printUsage(): void {
  console.log(`Usage: redscript tune --adapter <name> [--budget N] [--out path] [--manifest-out path]

Available adapters:
${Object.entries(ADAPTERS)
  .map(([name, a]) => `  ${name.padEnd(20)} ${a.description}`)
  .join('\n')}

Options:
  --adapter <name>   Adapter to use (required)
  --budget <N>       Max optimizer iterations (default: 10000)
  --out <path>       Output .mcrs file path (optional)
  --manifest-out <p> Output machine-readable tune manifest JSON (optional)
`);
}

function parseArgs(args: string[]): {
  adapter?: string;
  budget: number;
  out?: string;
  manifestOut?: string;
  strategy: 'nm' | 'sa';
} {
  const result: { adapter?: string; budget: number; out?: string; manifestOut?: string; strategy: 'nm' | 'sa' } = { budget: 10000, strategy: 'nm' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--adapter' && args[i + 1]) {
      result.adapter = args[++i] as string;
    } else if (args[i] === '--budget' && args[i + 1]) {
      result.budget = parseInt(args[++i]!, 10);
    } else if (args[i] === '--out' && args[i + 1]) {
      result.out = args[++i] as string;
    } else if (args[i] === '--manifest-out' && args[i + 1]) {
      result.manifestOut = args[++i] as string;
    } else if (args[i] === '--strategy' && args[i + 1]) {
      const s = args[++i];
      if (s === 'nm' || s === 'sa') result.strategy = s;
    }
  }

  return result;
}

function renderProgressBar(fraction: number, width = 30): string {
  const filled = Math.round(fraction * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}]`;
}

function writeTextFile(filePath: string, content: string): string {
  const outPath = path.resolve(filePath);
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outPath, content, 'utf8');
  return outPath;
}

function buildManifest(
  adapter: TunerAdapter,
  strategy: 'nm' | 'sa',
  budget: number,
  params: Record<string, number>,
  meta: ResultMeta,
  codePath?: string,
): TunerManifest {
  const command = [
    'redscript tune',
    '--adapter', adapter.name,
    '--budget', String(budget),
    '--strategy', strategy,
    ...(codePath ? ['--out', codePath] : []),
  ].join(' ');

  return {
    schemaVersion: 1,
    adapter: adapter.name,
    description: adapter.description,
    generatedAt: meta.tuneDate,
    strategy,
    input: adapter.input,
    output: adapter.output,
    overflowPolicy: adapter.overflowPolicy,
    params,
    paramSpecs: adapter.params,
    metrics: {
      maxError: meta.maxError,
      mae: meta.mae,
      rmse: meta.rmse,
    },
    budget: {
      requested: budget,
      used: meta.budgetUsed,
    },
    samples: {
      count: adapter.sampleInputs().length,
    },
    artifact: {
      codePath,
      command,
    },
  };
}

export async function runTunerCli(rawArgs = process.argv.slice(2)): Promise<void> {
  // Skip 'node', 'ts-node', 'cli.ts' etc from argv
  // Support `redscript tune` prefix (first arg might be 'tune')
  const args = rawArgs[0] === 'tune' ? rawArgs.slice(1) : rawArgs;

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const { adapter: adapterName, budget, out, manifestOut, strategy } = parseArgs(args);

  if (!adapterName) {
    console.error('Error: --adapter is required');
    printUsage();
    process.exit(1);
  }

  const adapter = ADAPTERS[adapterName];
  if (!adapter) {
    console.error(`Error: unknown adapter "${adapterName}"`);
    console.error(`Available: ${Object.keys(ADAPTERS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nredscript tune — ${adapter.name}`);
  console.log(`Description: ${adapter.description}`);
  console.log(`Strategy: ${strategy === 'sa' ? 'Simulated Annealing' : 'Nelder-Mead'}`);
  console.log(`Budget: ${budget} iterations`);
  console.log(`Parameters: ${adapter.params.map(p => p.name).join(', ')}\n`);

  let lastProgress = 0;
  const startTime = Date.now();

  const searchFn = strategy === 'sa' ? searchSA : search;
  const result = searchFn(adapter, budget, (iteration, bestError) => {
    const fraction = iteration / budget;
    const bar = renderProgressBar(fraction);
    const errorStr = isFinite(bestError) ? bestError.toFixed(6) : 'Inf';
    process.stdout.write(
      `\r  ${bar} ${(fraction * 100).toFixed(1)}%  iter=${iteration}  best_max_error=${errorStr}   `
    );
    lastProgress = iteration;
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write('\n');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Optimization complete in ${elapsed}s`);
  console.log(`Budget used: ${result.budgetUsed}/${budget} iterations`);
  console.log(`\nResults:`);
  console.log(`  max_error : ${result.maxError.toFixed(8)}`);
  console.log(`  mae       : ${result.mae.toFixed(8)}`);
  console.log(`  rmse      : ${result.rmse.toFixed(8)}`);
  console.log(`\nBest parameters:`);
  for (const [k, v] of Object.entries(result.params)) {
    console.log(`  ${k.padEnd(12)} = ${v}`);
  }

  // Estimate command count (rough: ~4 cmds per param + 10 overhead)
  const estimatedCmds = adapter.params.length * 4 + 15;

  const meta: ResultMeta = {
    maxError: result.maxError,
    mae: result.mae,
    rmse: result.rmse,
    estimatedCmds,
    tuneDate: new Date().toISOString().split('T')[0],
    budgetUsed: result.budgetUsed,
  };

  const code = adapter.generateCode(result.params, meta);

  let codePath: string | undefined;
  if (out) {
    codePath = writeTextFile(out, code);
    console.log(`\nWrote: ${codePath}`);
  } else {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('Generated code:');
    console.log('─'.repeat(60));
    console.log(code);
  }

  if (manifestOut) {
    const manifest = buildManifest(adapter, strategy, budget, result.params, meta, codePath);
    const manifestPath = writeTextFile(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote manifest: ${manifestPath}`);
  }
}

if (require.main === module) {
  runTunerCli().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
