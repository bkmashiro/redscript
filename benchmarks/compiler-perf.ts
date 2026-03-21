import {
  benchmarkMeta,
  buildSyntheticProgram,
  mean,
  median,
  parseCliArgs,
  round,
  runPipeline,
  summarizeFiles,
  writeJsonReport,
} from './_shared'

interface StageSample {
  parseMs: number
  hirMs: number
  mirMs: number
  emitMs: number
  totalMs: number
}

const SCALE_TARGETS = [10, 100, 1000] as const

function main(): void {
  const { iterations, output } = parseCliArgs(process.argv.slice(2))
  const cases = SCALE_TARGETS.map(targetLines => {
    const program = buildSyntheticProgram(targetLines)
    const samples: StageSample[] = []
    let lastSummary = summarizeFiles([])

    for (let i = 0; i < iterations; i++) {
      const result = runPipeline(program.source, {
        namespace: `bench_${targetLines}`,
        optimizationLevel: 1,
      })
      samples.push(result.timings)
      lastSummary = summarizeFiles(result.files)
    }

    return {
      targetLines,
      actualLines: program.actualLines,
      helperCount: program.helperCount,
      callCount: program.callCount,
      output: lastSummary,
      samples: samples.map(sample => ({
        parseMs: round(sample.parseMs),
        hirMs: round(sample.hirMs),
        mirMs: round(sample.mirMs),
        emitMs: round(sample.emitMs),
        totalMs: round(sample.totalMs),
      })),
      averages: {
        parseMs: round(mean(samples.map(sample => sample.parseMs))),
        hirMs: round(mean(samples.map(sample => sample.hirMs))),
        mirMs: round(mean(samples.map(sample => sample.mirMs))),
        emitMs: round(mean(samples.map(sample => sample.emitMs))),
        totalMs: round(mean(samples.map(sample => sample.totalMs))),
      },
      medians: {
        parseMs: round(median(samples.map(sample => sample.parseMs))),
        hirMs: round(median(samples.map(sample => sample.hirMs))),
        mirMs: round(median(samples.map(sample => sample.mirMs))),
        emitMs: round(median(samples.map(sample => sample.emitMs))),
        totalMs: round(median(samples.map(sample => sample.totalMs))),
      },
    }
  })

  writeJsonReport({
    ...benchmarkMeta('compiler-perf'),
    iterations,
    scales: cases,
  }, output)
}

main()
