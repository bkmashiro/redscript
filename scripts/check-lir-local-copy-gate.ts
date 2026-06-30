import * as fs from 'fs'
import * as path from 'path'

import {
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
  const gate = report.experimentalLocalCopyRewriteNoRegressionGate
  const rolloutReadiness = report.experimentalLocalCopyRewriteRolloutReadinessSummary
  const comparison = report.experimentalLocalCopyRewriteComparison
  const offlinePack = report.offlineRewriteEquivalencePackSummary
  const boundarySidecarSummary = report.boundarySidecarSummary

  if (!gate) {
    console.error('Missing experimentalLocalCopyRewriteNoRegressionGate in explicit local-copy report output')
    process.exit(1)
  }
  if (!rolloutReadiness) {
    console.error('Missing experimentalLocalCopyRewriteRolloutReadinessSummary in explicit local-copy report output')
    process.exit(1)
  }

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
  console.log(
    `rollout readiness: status=${rolloutReadiness?.status ?? 'unknown'}`
    + ` recommendation=${rolloutReadiness?.recommendation ?? 'unknown'}`
    + ` evidence=${rolloutReadiness?.evidenceStatus ?? 'unknown'}`
    + ` commandDelta=${rolloutReadiness?.commandDelta ?? 0}`
    + ` scoreCopyDelta=${rolloutReadiness?.scoreCopyDelta ?? 0}`
    + ` improvedCases=${rolloutReadiness?.improvedCaseNames?.length ?? 0}`,
  )
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
  if (boundarySidecarSummary) {
    console.log(
      `sidecar totals: totalInstructions=${boundarySidecarSummary.totalInstructions}`
      + ` exact=${boundarySidecarSummary.byConfidence.exact}`
      + ` conservative=${boundarySidecarSummary.byConfidence.conservative}`
      + ` opaque=${boundarySidecarSummary.byConfidence.opaque}`,
    )
    console.log(
      `sidecar provenance: typed-lir=${boundarySidecarSummary.byProvenance['typed-lir']}`
      + ` macro-helper=${boundarySidecarSummary.byProvenance['macro-helper']}`
      + ` raw-user-command=${boundarySidecarSummary.byProvenance['raw-user-command']}`
      + ` lowering-compat=${boundarySidecarSummary.byProvenance['lowering-compat']}`,
    )
    console.log(
      `sidecar barriers: barriers=${boundarySidecarSummary.barrierInstructions}`
      + ` rawText=${boundarySidecarSummary.rawTextInstructions}`
      + ` macroSub=${boundarySidecarSummary.macroSubstitutionInstructions}`
      + ` opaqueStorage=${boundarySidecarSummary.opaqueStorageInstructions}`,
    )
  } else {
    console.log('sidecar totals: missing')
  }
  console.log(`output: ${outputPath}`)

  if (gate.status !== 'pass' || rolloutReadiness.status !== 'pass') {
    process.exit(1)
  }
}

main()
