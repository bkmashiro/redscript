import * as fs from 'fs'
import * as path from 'path'

import {
  benchmarkMeta,
  listStdlibModules,
  OptimizationLevel,
  parseCliArgs,
  runPipeline,
  summarizeFiles,
  writeTextReport,
} from './_shared'

const OPT_LEVELS: OptimizationLevel[] = [0, 1, 2]
const DEFAULT_OUTPUT = 'benchmarks/stdlib-size.md'

function formatReport(modules: Array<{
  module: string
  results: Array<{
    optLevel: string
    mcfunctionFileCount: number
    mcfunctionLineCount: number
  }>
}>): string {
  const meta = benchmarkMeta('stdlib-size')
  const lines: string[] = [
    '# Stdlib Size Benchmark',
    '',
    `Generated: ${meta.generatedAt}`,
    '',
    `Host: ${meta.host.cpuModel} | ${meta.host.cpuCount} cores | ${meta.host.totalMemoryMb} MB RAM | ${meta.host.platform} ${meta.host.release} (${meta.host.arch})`,
    '',
    '| Module | O0 Files | O0 Lines | O1 Files | O1 Lines | O2 Files | O2 Lines |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const module of modules) {
    const [o0, o1, o2] = module.results
    lines.push(
      `| ${module.module} | ${o0.mcfunctionFileCount} | ${o0.mcfunctionLineCount} | ${o1.mcfunctionFileCount} | ${o1.mcfunctionLineCount} | ${o2.mcfunctionFileCount} | ${o2.mcfunctionLineCount} |`
    )
  }

  const totals = OPT_LEVELS.map(level => {
    const index = level
    return modules.reduce((acc, module) => {
      acc.mcfunctionFileCount += module.results[index].mcfunctionFileCount
      acc.mcfunctionLineCount += module.results[index].mcfunctionLineCount
      return acc
    }, { mcfunctionFileCount: 0, mcfunctionLineCount: 0 })
  })

  lines.push(
    `| Total | ${totals[0].mcfunctionFileCount} | ${totals[0].mcfunctionLineCount} | ${totals[1].mcfunctionFileCount} | ${totals[1].mcfunctionLineCount} | ${totals[2].mcfunctionFileCount} | ${totals[2].mcfunctionLineCount} |`
  )

  return lines.join('\n')
}

function main(): void {
  const { output } = parseCliArgs(process.argv.slice(2))
  const modules = listStdlibModules().map(modulePath => {
    const source = fs.readFileSync(modulePath, 'utf8')
    const results = OPT_LEVELS.map(level => {
      const result = runPipeline(source, {
        namespace: `stdlib_${path.basename(modulePath, '.mcrs')}`,
        filePath: modulePath,
        optimizationLevel: level,
      })
      const summary = summarizeFiles(result.files)

      return {
        optLevel: `O${level}`,
        mcfunctionFileCount: summary.mcfunctionFileCount,
        mcfunctionLineCount: summary.mcfunctionLineCount,
      }
    })

    return {
      module: path.basename(modulePath),
      results,
    }
  })

  writeTextReport(
    formatReport(modules),
    output ?? DEFAULT_OUTPUT,
  )
}

main()
