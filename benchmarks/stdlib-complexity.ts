import * as fs from 'fs'
import * as path from 'path'

import {
  benchmarkMeta,
  listStdlibModules,
  OptimizationLevel,
  parseCliArgs,
  round,
  runPipeline,
  summarizeFiles,
  writeJsonReport,
} from './_shared'

const OPT_LEVELS: OptimizationLevel[] = [0, 1, 2]

function main(): void {
  const { output } = parseCliArgs(process.argv.slice(2))
  const modules = listStdlibModules().map(modulePath => {
    const source = fs.readFileSync(modulePath, 'utf8')
    const byOpt = OPT_LEVELS.map(level => {
      const result = runPipeline(source, {
        namespace: `stdlib_${path.basename(modulePath, '.mcrs')}`,
        filePath: modulePath,
        optimizationLevel: level,
      })
      return {
        optLevel: `O${level}`,
        timingsMs: {
          parse: round(result.timings.parseMs),
          hir: round(result.timings.hirMs),
          mir: round(result.timings.mirMs),
          emit: round(result.timings.emitMs),
          total: round(result.timings.totalMs),
        },
        ...summarizeFiles(result.files),
        warnings: result.warnings.length,
      }
    })

    return {
      module: path.basename(modulePath),
      path: modulePath,
      results: byOpt,
    }
  })

  writeJsonReport({
    ...benchmarkMeta('stdlib-complexity'),
    modules,
  }, output)
}

main()
