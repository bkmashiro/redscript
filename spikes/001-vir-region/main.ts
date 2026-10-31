import * as fs from 'fs'
import * as path from 'path'
import { parseSourceStage, lowerToHIRStage, collectRuntimeMetadataStage } from '../../src/emit/compile'
import { lowerToMIR } from '../../src/mir/lower'
import { optimizeModule } from '../../src/optimizer/pipeline'
import { lowerToLIR } from '../../src/lir/lower'
import { lirOptimizeModule } from '../../src/optimizer/lir/pipeline'
import { lowerMirToVir } from '../../src/optimizer/vir/lower/mir-to-vir'
import { chooseVirLoweringPlan } from '../../src/optimizer/vir/lower/vir-to-lir'
import { runVIRPasses } from '../../src/optimizer/vir/pass-manager'
import { checkBoundedLirEquivalence } from '../../src/optimizer/lir/equivalence'
import { slotKey } from '../../src/optimizer/lir/analysis'
import { emit } from '../../src/emit'
import { summarizeDatapackCommands } from '../../src/optimizer/report'
import type { LIRModule } from '../../src/lir/types'

// No new backend: isolate existing production MIR and call the existing VIR
// experiment APIs. This script measures static shapes, never execution speed.
const sourcePath = path.resolve(__dirname, '../../tests/mc-cases/scoreboard-call-effects.mcrs')
const namespace = 'vir_region_spike'
const parsed = parseSourceStage(fs.readFileSync(sourcePath, 'utf8'), namespace, { filePath: sourcePath })
const hir = lowerToHIRStage(parsed.ast, namespace).hir
const metadata = collectRuntimeMetadataStage(hir, namespace)
const mir = lowerToMIR(hir, sourcePath)
mir.noInlineFunctions = metadata.noInlineFunctions
const optimized = optimizeModule(mir)
const whole = lowerMirToVir(optimized)

function commandCount(module: LIRModule, name: string) {
  const report = summarizeDatapackCommands(emit(module, { namespace }))
  return report.functions.find(fn => fn.path.endsWith(`/${name}.mcfunction`))!.commands
}

const regions = ['scale_cost', 'scale_cost__partial_x_1_0'].map(name => {
  const fn = optimized.functions.find(fn => fn.name === name)
  if (!fn) throw new Error(`Missing production fixture function ${name}`)
  const region = { ...optimized, functions: [fn] }
  const vir = lowerMirToVir(region)
  if (vir.kind !== 'ok') return { name, status: 'unsupported', reason: vir.reason }
  const values = runVIRPasses(vir.module)
  const plan = chooseVirLoweringPlan(values, { runAllocationCheck: true })
  if (!plan.selectedModule) return { name, status: 'unsupported', reason: plan.unsupportedReason }
  const baseline = lirOptimizeModule(lowerToLIR(region))
  const unadapted = lirOptimizeModule(plan.selectedModule)
  // The experimental VIR contract reads $vN, not the production $pN call ABI.
  // Account for explicit boundary copies. This adapter is intentionally local
  // to one isolated function, not a production multi-function allocation ABI.
  const mode = plan.decisions[0].selectedMode
  const copies = values.functions[0].paramValues.map((id, index) => ({
    kind: 'score_copy' as const,
    src: { player: `$p${index}`, obj: mir.objective },
    dst: { player: `$v${mode === 'planned' ? index : Number(id)}`, obj: mir.objective },
  }))
  const after = lirOptimizeModule({ ...plan.selectedModule, functions: [{
    ...plan.selectedModule.functions[0], instructions: [...copies, ...plan.selectedModule.functions[0].instructions],
  }] })
  const samples = [[2, 3, 7], [-7, 1, 0], [-3, -2, 5]].map(values =>
    Object.fromEntries(fn.params.map((_param, index) => [slotKey({ player: `$p${index}`, obj: mir.objective }), values[index]])))
  const equivalence = checkBoundedLirEquivalence({
    name, before: baseline.functions[0], after: after.functions[0],
    observedSlots: [{ player: '$ret', obj: mir.objective }], samples,
  })
  return {
    name, status: equivalence.status,
    selectedMode: mode,
    productionCommands: commandCount(baseline, name),
    virCommandsWithoutABI: commandCount(unadapted, name),
    virCommandsWithABI: commandCount(after, name),
    equivalence,
  }
})

console.log(JSON.stringify({
  wholeModule: whole.kind === 'ok' ? { status: 'supported' } : { status: 'unsupported', reason: whole.reason, tags: whole.reasonTags },
  regions,
  scope: 'static command counts and three bounded, initialized, non-overflow arithmetic samples per region',
  limitations: ['no runtime speed measurement', 'no division, overflow, missing-score or game-state equivalence proof', 'no production VIR integration'],
}, null, 2))
if (regions.some(region => region.status !== 'equivalent')) process.exitCode = 1
