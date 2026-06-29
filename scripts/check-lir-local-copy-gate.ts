import * as fs from 'fs'
import * as path from 'path'

import {
  evaluateExperimentalLocalCopyRewriteNoRegressionGate,
  runArithmeticProbeReport,
} from '../benchmarks/arithmetic-probes'

const DEFAULT_OUTPUT_PATH = '/tmp/redscript-lir-local-copy-gate.json'

interface GateArgs {
  output?: string
}

function printUsage(): void {
  process.stdout.write(
    'Usage: npx ts-node scripts/check-lir-local-copy-gate.ts [--output <path>]\n'
    + 'Runs the arithmetic probe report with experimental local-copy rewrite enabled for O1/all,\n'
    + 'evaluates the explicit no-regression evidence gate, writes full JSON to output,\n'
    + 'and prints a concise evidence-only summary.\n',
  )
}

function parseArgs(argv: string[]): GateArgs {
  const args: GateArgs = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--output' || arg === '-o') {
      const value = argv[++i]
      if (!value || value.startsWith('-')) {
        throw new Error(`${arg} requires an output path`)
      }
      args.output = value
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
    throw new Error(`Unknown argument '${arg}'`)
  }

  return args
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const outputPath = args.output ?? DEFAULT_OUTPUT_PATH

  const report = runArithmeticProbeReport('all', [1], true)
  const gate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(
    report.experimentalLocalCopyRewriteComparison,
    report.offlineRewriteEquivalencePackSummary,
  )
  report.experimentalLocalCopyRewriteNoRegressionGate = gate
  const comparison = report.experimentalLocalCopyRewriteComparison
  const offlinePack = report.offlineRewriteEquivalencePackSummary

  const outputDir = path.dirname(outputPath)
  if (outputDir !== '.') {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  )

  console.log(`gate status: ${gate.status}`)
  console.log(`failReasons: ${gate.failReasons.length > 0 ? gate.failReasons.join('; ') : 'none'}`)
  if (offlinePack) {
    console.log(
      `offline pack: status=${offlinePack.status}`
      + ` evidence=${offlinePack.evidenceStatus}`
      + ` total=${offlinePack.totalFixtures}`
      + ` failed=${offlinePack.failedFixtures}`,
    )
  } else {
    console.log('offline pack: missing')
  }
  console.log(
    `commandDelta=${comparison?.commandDelta ?? 0}`
    + ` scoreCopyDelta=${comparison?.scoreCopyDelta ?? 0}`,
  )
  console.log(
    `regressedCount command=${comparison?.commandDeltaSummary?.regressedCount ?? 0}`
    + ` scoreCopy=${comparison?.scoreCopyDeltaSummary?.regressedCount ?? 0}`,
  )
  console.log(`output: ${outputPath}`)

  if (gate.status !== 'pass') {
    process.exit(1)
  }
}

main()
