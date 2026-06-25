import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'
import type { ValueId } from '../ids'
import type { VIRFunction, VIRModule, VIROperation } from '../types'
import { isPureOp, operationOperands, operationResults } from '../types'
import { verifyVIR } from '../verifier'
import { collectAllocationFailure } from './allocation-checker'
import { emitPlannedFunction, planSlotsForFunction } from './slot-planner'

interface BrandedId {
  readonly __brand: string
}

type LoweredFunctionResult = VirToLirResultUnsupported | { kind: 'ok'; functionInstructions: LIRInstr[] }

export type VirToLirResultUnsupported = { kind: 'unsupported'; reason: string }
export type VirToLirResultOk = { kind: 'ok'; module: LIRModule }
export type VirToLirResult = VirToLirResultOk | VirToLirResultUnsupported

export interface VirToLirOptions {
  mode?: 'direct' | 'planned' | 'auto' | 'compare'
  runAllocationCheck?: boolean
}

export type VirLoweringAttemptStatus = 'ok' | 'unsupported'

export type VirLoweringDecisionStatus = 'accepted' | 'rejected' | 'unsupported'

export type VirLoweringRejectCategory =
  | 'planned_unsupported'
  | 'allocation_check_failed'
  | 'higher_cost'
  | 'direct_unsupported'
  | 'unsupported_both'

export interface VirLoweringAttemptSummary {
  kind: VirLoweringAttemptStatus
  instructionCount: number
  scoreCopyCount: number
  unsupportedReason?: string
  allocationCheckFailureReason?: string
}

export interface VirFunctionLoweringDecision {
  functionName: string
  status: VirLoweringDecisionStatus
  selectedMode: 'direct' | 'planned'
  direct: VirLoweringAttemptSummary
  planned: VirLoweringAttemptSummary
  rejectionCategory?: VirLoweringRejectCategory
  rejectionReason?: string
}

export interface VirToLirDecisionReport {
  kind: 'ok' | 'unsupported'
  selectedMode: 'direct' | 'planned' | 'mixed'
  directCommandCount: number
  plannedCommandCount: number
  directScoreCopyCount: number
  plannedScoreCopyCount: number
  acceptedFunctionCount: number
  rejectedFunctionCount: number
  unsupportedFunctionCount: number
  rejectionCategoryCounts: Record<VirLoweringRejectCategory, number>
  decisions: VirFunctionLoweringDecision[]
  unsupportedReason?: string
  selectedModule?: LIRModule
}

function makeZeroRejectionCounts(): Record<VirLoweringRejectCategory, number> {
  return {
    planned_unsupported: 0,
    allocation_check_failed: 0,
    higher_cost: 0,
    direct_unsupported: 0,
    unsupported_both: 0,
  }
}

function asNumber(id: BrandedId): number {
  return Number(id)
}

function countFunctionInstructions(instructions: LIRInstr[]): {
  commandCount: number
  scoreCopyCount: number
} {
  let commandCount = 0
  let scoreCopyCount = 0

  for (const instr of instructions) {
    commandCount += 1
    if (instr.kind === 'score_copy') scoreCopyCount += 1
  }

  return { commandCount, scoreCopyCount }
}

function isPlannedAllocationFailure(reason: string): string | undefined {
  const parsed = /^planned allocation check failed for .*?: (.*)$/.exec(reason)
  return parsed ? parsed[1] : undefined
}

function summarizeLowerAttempt(
  mode: 'direct' | 'planned',
  result: LoweredFunctionResult,
): VirLoweringAttemptSummary {
  if (result.kind === 'ok') {
    const { commandCount, scoreCopyCount } = countFunctionInstructions(result.functionInstructions)
    return {
      kind: 'ok',
      instructionCount: commandCount,
      scoreCopyCount,
    }
  }

  return {
    kind: 'unsupported',
    instructionCount: 0,
    scoreCopyCount: 0,
    unsupportedReason: result.reason,
    allocationCheckFailureReason:
      mode === 'planned' ? isPlannedAllocationFailure(result.reason) : undefined,
  }
}

function isPlannedNotWorse(direct: VirLoweringAttemptSummary, planned: VirLoweringAttemptSummary): boolean {
  if (direct.kind !== 'ok' || planned.kind !== 'ok') return false
  if (planned.instructionCount < direct.instructionCount) return true
  if (planned.instructionCount > direct.instructionCount) return false
  return planned.scoreCopyCount <= direct.scoreCopyCount
}

function chooseRejectCategory(
  direct: VirLoweringAttemptSummary,
  planned: VirLoweringAttemptSummary,
): VirLoweringRejectCategory | undefined {
  if (planned.kind === 'unsupported') {
    if (planned.allocationCheckFailureReason) {
      return 'allocation_check_failed'
    }
    return 'planned_unsupported'
  }

  if (direct.kind === 'unsupported') return 'direct_unsupported'
  return undefined
}

function formatDecisionReason(
  direct: VirLoweringAttemptSummary,
  planned: VirLoweringAttemptSummary,
): string | undefined {
  if (direct.kind === 'ok' && planned.kind === 'ok') {
    if (!isPlannedNotWorse(direct, planned)) {
      return `planned instruction estimate ${planned.instructionCount} > direct ${direct.instructionCount}`
    }
    return undefined
  }

  if (planned.kind === 'unsupported') return planned.unsupportedReason
  if (direct.kind === 'unsupported') return direct.unsupportedReason
  return 'decision reason unavailable'
}

function chooseFunctionDecision(
  functionName: string,
  direct: VirLoweringAttemptSummary,
  planned: VirLoweringAttemptSummary,
): VirFunctionLoweringDecision {
  if (direct.kind === 'ok' && planned.kind === 'ok') {
    if (isPlannedNotWorse(direct, planned)) {
      return {
        functionName,
        status: 'accepted',
        selectedMode: 'planned',
        direct,
        planned,
      }
    }

    return {
      functionName,
      status: 'rejected',
      selectedMode: 'direct',
      direct,
      planned,
      rejectionCategory: 'higher_cost',
      rejectionReason: formatDecisionReason(direct, planned),
    }
  }

  if (direct.kind === 'unsupported' && planned.kind === 'ok') {
    return {
      functionName,
      status: 'accepted',
      selectedMode: 'planned',
      direct,
      planned,
      rejectionCategory: 'direct_unsupported',
      rejectionReason: direct.unsupportedReason,
    }
  }

  if (direct.kind === 'ok' && planned.kind === 'unsupported') {
    return {
      functionName,
      status: 'rejected',
      selectedMode: 'direct',
      direct,
      planned,
      rejectionCategory: chooseRejectCategory(direct, planned),
      rejectionReason: planned.unsupportedReason,
    }
  }

  return {
    functionName,
    status: 'unsupported',
    selectedMode: 'direct',
    direct,
    planned,
    rejectionCategory: 'unsupported_both',
    rejectionReason: planned.unsupportedReason ?? direct.unsupportedReason ?? 'planned and direct were both unsupported',
  }
}

function emitFunctionInstruction(
  name: string,
  instruction: LIRInstr[],
): LIRFunction {
  return {
    name,
    instructions: instruction,
    isMacro: false,
    macroParams: [],
  }
}

function bumpCategory(
  category: VirLoweringRejectCategory | undefined,
  counts: Record<VirLoweringRejectCategory, number>,
): void {
  if (!category) return
  counts[category] += 1
}

export function chooseVirLoweringPlan(
  module: VIRModule,
  options: VirToLirOptions = {},
): VirToLirDecisionReport {
  const validation = verifyVIR(module)
  if (validation.length > 0) {
    return {
      kind: 'unsupported',
      selectedMode: 'direct',
      directCommandCount: 0,
      plannedCommandCount: 0,
      directScoreCopyCount: 0,
      plannedScoreCopyCount: 0,
      acceptedFunctionCount: 0,
      rejectedFunctionCount: 0,
      unsupportedFunctionCount: 0,
      rejectionCategoryCounts: makeZeroRejectionCounts(),
      decisions: [],
      unsupportedReason: `invalid VIR module: ${validation[0].message}`,
    }
  }

  const selectedFunctions: LIRFunction[] = []
  const decisions: VirFunctionLoweringDecision[] = []
  const rejectionCategoryCounts = makeZeroRejectionCounts()
  let selectedModes = new Set<string>()
  let unsupportedFunctionCount = 0
  let acceptedFunctionCount = 0
  let rejectedFunctionCount = 0
  let directCommandCount = 0
  let plannedCommandCount = 0
  let directScoreCopyCount = 0
  let plannedScoreCopyCount = 0
  const names = new Set<string>()

  for (const fn of module.functions) {
    if (names.has(fn.name)) {
      unsupportedFunctionCount += 1
      return {
        kind: 'unsupported',
        selectedMode: 'direct',
        directCommandCount,
        plannedCommandCount,
        directScoreCopyCount,
        plannedScoreCopyCount,
        acceptedFunctionCount,
        rejectedFunctionCount,
        unsupportedFunctionCount,
        rejectionCategoryCounts,
        decisions,
        unsupportedReason: `duplicate function name '${fn.name}'`,
      }
    }
    names.add(fn.name)

    const directResult: LoweredFunctionResult = lowerFunction(module, fn, {
      mode: 'direct',
      runAllocationCheck: options.runAllocationCheck,
    })
    const plannedResult: LoweredFunctionResult = lowerFunction(module, fn, {
      mode: 'planned',
      runAllocationCheck: options.runAllocationCheck,
    })

    const directSummary = summarizeLowerAttempt('direct', directResult)
    const plannedSummary = summarizeLowerAttempt('planned', plannedResult)

    if (directSummary.kind === 'ok') {
      directCommandCount += directSummary.instructionCount
      directScoreCopyCount += directSummary.scoreCopyCount
    }
    if (plannedSummary.kind === 'ok') {
      plannedCommandCount += plannedSummary.instructionCount
      plannedScoreCopyCount += plannedSummary.scoreCopyCount
    }

    const decision = chooseFunctionDecision(fn.name, directSummary, plannedSummary)
    decisions.push(decision)

    if (decision.status === 'accepted') {
      acceptedFunctionCount += 1
      selectedModes.add(decision.selectedMode)
    }
    if (decision.status === 'rejected') {
      rejectedFunctionCount += 1
      selectedModes.add(decision.selectedMode)
    }
    if (decision.status === 'unsupported') {
      unsupportedFunctionCount += 1
      rejectionCategoryCounts.unsupported_both += 1
      return {
        kind: 'unsupported',
        selectedMode: 'direct',
        directCommandCount,
        plannedCommandCount,
        directScoreCopyCount,
        plannedScoreCopyCount,
        acceptedFunctionCount,
        rejectedFunctionCount,
        unsupportedFunctionCount,
        rejectionCategoryCounts,
        decisions,
        unsupportedReason: decision.rejectionReason,
      }
    }

    bumpCategory(decision.rejectionCategory, rejectionCategoryCounts)

    if (decision.status === 'accepted') {
      if (decision.selectedMode === 'planned' && plannedResult.kind === 'ok') {
        selectedFunctions.push(emitFunctionInstruction(fn.name, plannedResult.functionInstructions))
      } else if (directResult.kind === 'ok') {
        selectedFunctions.push(emitFunctionInstruction(fn.name, directResult.functionInstructions))
      }
      continue
    }

    if (decision.selectedMode === 'direct') {
      if (directResult.kind === 'ok') {
        selectedFunctions.push(emitFunctionInstruction(fn.name, directResult.functionInstructions))
      } else {
        // impossible by construction, but guard anyway to avoid emitting incomplete modules
        return {
          kind: 'unsupported',
          selectedMode: 'direct',
          directCommandCount,
          plannedCommandCount,
          directScoreCopyCount,
          plannedScoreCopyCount,
          acceptedFunctionCount,
          rejectedFunctionCount,
          unsupportedFunctionCount,
          rejectionCategoryCounts,
          decisions,
          unsupportedReason: decision.rejectionReason,
        }
      }
    }
  }

  const selectedMode = decideSelectedMode(selectedModes)
  if (unsupportedFunctionCount > 0) {
    return {
      kind: 'unsupported',
      selectedMode,
      directCommandCount,
      plannedCommandCount,
      directScoreCopyCount,
      plannedScoreCopyCount,
      acceptedFunctionCount,
      rejectedFunctionCount,
      unsupportedFunctionCount,
      rejectionCategoryCounts,
      decisions,
      unsupportedReason: `unsupported lowering in ${unsupportedFunctionCount} function(s)`,
    }
  }

  return {
    kind: 'ok',
    selectedMode,
    directCommandCount,
    plannedCommandCount,
    directScoreCopyCount,
    plannedScoreCopyCount,
    acceptedFunctionCount,
    rejectedFunctionCount,
    unsupportedFunctionCount,
    rejectionCategoryCounts,
    decisions,
    selectedModule: {
      namespace: module.namespace,
      objective: module.objective,
      functions: selectedFunctions,
    },
  }
}

function decideSelectedMode(values: Set<string>): 'direct' | 'planned' | 'mixed' {
  if (values.has('planned') && !values.has('direct')) return 'planned'
  if (values.has('direct') && !values.has('planned')) return 'direct'
  return values.size === 0 ? 'direct' : 'mixed'
}

function slotForValue(module: VIRModule, valueId: ValueId | undefined): Slot | undefined {
  if (valueId === undefined) return undefined
  const value = module.values[asNumber(valueId)]
  if (!value || value.id !== valueId) return undefined
  return { player: `$v${asNumber(valueId)}`, obj: module.objective }
}

function valueInFunction(module: VIRModule, fn: VIRFunction, valueId: ValueId): boolean {
  const value = module.values[asNumber(valueId)]
  return Boolean(value && value.id === valueId && value.function === fn.id)
}

function emitArithmetic(
  op: VIROperation,
  module: VIRModule,
): { kind: 'ok'; instructions: LIRInstr[] } | VirToLirResultUnsupported {
  if (op.kind === 'cf.return') {
    return {
      kind: 'unsupported',
      reason: `operation '${asNumber(op.id)}' is a return and cannot be emitted as arithmetic`,
    }
  }

  const resultSlot = slotForValue(module, op.resultIds[0])
  if (!resultSlot) {
    return {
      kind: 'unsupported',
      reason: `operation '${asNumber(op.id)}' has invalid result`,
    }
  }

  if (op.kind === 'arith.constant') {
    return {
      kind: 'ok',
      instructions: [{
        kind: 'score_set',
        dst: resultSlot,
        value: op.value,
      }],
    }
  }

  if (op.kind === 'arith.identity') {
    const sourceSlot = slotForValue(module, op.operands[0])
    if (!sourceSlot) {
      return {
        kind: 'unsupported',
        reason: `operation '${asNumber(op.id)}' has missing source operand`,
      }
    }

    return {
      kind: 'ok',
      instructions: [{
        kind: 'score_copy',
        dst: resultSlot,
        src: sourceSlot,
      }],
    }
  }

  const lhsSlot = slotForValue(module, op.operands[0])
  const rhsSlot = slotForValue(module, op.operands[1])
  if (!lhsSlot || !rhsSlot) {
    return {
      kind: 'unsupported',
      reason: `operation '${asNumber(op.id)}' has missing binary operand`,
    }
  }

  const instructions: LIRInstr[] = [{ kind: 'score_copy', dst: resultSlot, src: lhsSlot }]

  if (op.kind === 'arith.add') {
    instructions.push({ kind: 'score_add', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.sub') {
    instructions.push({ kind: 'score_sub', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.mul') {
    instructions.push({ kind: 'score_mul', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.div') {
    instructions.push({ kind: 'score_div', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.mod') {
    instructions.push({ kind: 'score_mod', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.min') {
    instructions.push({ kind: 'score_min', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  instructions.push({ kind: 'score_max', dst: resultSlot, src: rhsSlot })
  return { kind: 'ok', instructions }
}

function verifyFunctionOps(module: VIRModule, fn: VIRFunction): VirToLirResultUnsupported | { kind: 'ok'; opSequence: VIROperation[] } {
  if (fn.blocks.length !== 1) {
    return {
      kind: 'unsupported',
      reason: `function '${fn.name}' has ${fn.blocks.length} blocks (expected 1)`,
    }
  }

  const blockId = fn.blocks[0]
  const block = module.blocks[asNumber(blockId)]
  if (!block || block.id !== blockId) {
    return {
      kind: 'unsupported',
      reason: `function '${fn.name}' has missing entry block ${asNumber(blockId)}`,
    }
  }

  const opSequence: VIROperation[] = []
  for (const opId of block.opIds) {
    const op = module.ops[asNumber(opId)]
    if (!op || op.id !== opId) {
      return {
        kind: 'unsupported',
        reason: `function '${fn.name}' has missing op ${asNumber(opId)}`,
      }
    }
    opSequence.push(op)
  }

  if (opSequence.length === 0) {
    return { kind: 'unsupported', reason: `function '${fn.name}' has no operations` }
  }

  const terminator = opSequence.at(-1)
  if (!terminator || terminator.kind !== 'cf.return') {
    return { kind: 'unsupported', reason: `function '${fn.name}' does not terminate with cf.return` }
  }

  return { kind: 'ok', opSequence }
}

function lowerFunctionDirect(module: VIRModule, fn: VIRFunction): VirToLirResultUnsupported | { kind: 'ok'; functionInstructions: LIRInstr[] } {
  const verified = verifyFunctionOps(module, fn)
  if (verified.kind === 'unsupported') return verified
  const opSequence = verified.opSequence

  const instructions: LIRInstr[] = []
  for (const op of opSequence) {
    if (op.kind === 'cf.return') {
      if (op.operands.length > 1) {
        return {
          kind: 'unsupported',
          reason: `function '${fn.name}' has multi-result return`,
        }
      }

      if (op.operands.length === 1) {
        const returnOperand = op.operands[0]
        const returnSlot = slotForValue(module, returnOperand)
        if (!returnSlot) {
          return {
            kind: 'unsupported',
            reason: `function '${fn.name}' return uses invalid operand`,
          }
        }
        instructions.push({ kind: 'return_value', slot: returnSlot })
      }

      continue
    }

    if (!isPureOp(op)) {
      return {
        kind: 'unsupported',
        reason: `unsupported non-pure VIR op '${op.kind}' in '${fn.name}'`,
      }
    }

    if (operationResults(op).length !== 1 && !op.kind.startsWith('arith.')) {
      return {
        kind: 'unsupported',
        reason: `op '${asNumber(op.id)}' in '${fn.name}' has unexpected result arity`,
      }
    }

    for (const operand of operationOperands(op)) {
      if (!valueInFunction(module, fn, operand)) {
        return {
          kind: 'unsupported',
          reason: `op '${asNumber(op.id)}' in '${fn.name}' uses invalid operand ${asNumber(operand)}`,
        }
      }
    }

    const emitted = emitArithmetic(op, module)
    if (emitted.kind === 'unsupported') return emitted
    instructions.push(...emitted.instructions)
  }

  return {
    kind: 'ok',
    functionInstructions: instructions,
  }
}

function lowerFunctionPlanned(module: VIRModule, fn: VIRFunction, options: VirToLirOptions): VirToLirResultUnsupported | { kind: 'ok'; functionInstructions: LIRInstr[] } {
  const planned = planSlotsForFunction(module, fn)
  if (planned.kind === 'unsupported') {
    return {
      kind: 'unsupported',
      reason: `planned slotting unsupported for '${fn.name}': ${planned.reason}`,
    }
  }

  const emitted = emitPlannedFunction(planned.plan)
  if (emitted.kind === 'unsupported') {
    return {
      kind: 'unsupported',
      reason: `planned emission failed for '${fn.name}': ${emitted.reason}`,
    }
  }

  if (options.runAllocationCheck !== false) {
    const allocationFailure = collectAllocationFailure(module, fn, planned.plan)
    if (allocationFailure) {
      return {
        kind: 'unsupported',
        reason: `planned allocation check failed for '${fn.name}': ${allocationFailure.reason}`,
      }
    }
  }

  return { kind: 'ok', functionInstructions: emitted.value }
}

function lowerFunction(module: VIRModule, fn: VIRFunction, options: VirToLirOptions): VirToLirResultUnsupported | { kind: 'ok'; functionInstructions: LIRInstr[] } {
  const mode = options.mode ?? 'direct'
  if (mode === 'planned') return lowerFunctionPlanned(module, fn, options)
  return lowerFunctionDirect(module, fn)
}

export function lowerVirToLir(module: VIRModule, options: VirToLirOptions = {}): VirToLirResult {
  const mode = options.mode ?? 'direct'
  if (mode === 'auto' || mode === 'compare') {
    const report = chooseVirLoweringPlan(module, options)
    if (report.kind === 'unsupported' || !report.selectedModule) {
      return {
        kind: 'unsupported',
        reason: report.unsupportedReason ?? 'VIR lowering decision rejected one or more functions',
      }
    }
    return { kind: 'ok', module: report.selectedModule }
  }

  const validation = verifyVIR(module)
  if (validation.length > 0) {
    return {
      kind: 'unsupported',
      reason: `invalid VIR module: ${validation[0].message}`,
    }
  }

  const functions: LIRFunction[] = []
  const names = new Set<string>()

  for (const fn of module.functions) {
    if (names.has(fn.name)) {
      return {
        kind: 'unsupported',
        reason: `duplicate function name '${fn.name}'`,
      }
    }
    names.add(fn.name)

    const lowered = lowerFunction(module, fn, { mode, runAllocationCheck: options.runAllocationCheck })
    if (lowered.kind === 'unsupported') return lowered

    functions.push({
      name: fn.name,
      instructions: lowered.functionInstructions,
      isMacro: false,
      macroParams: [],
    })
  }

  return {
    kind: 'ok',
    module: {
      namespace: module.namespace,
      objective: module.objective,
      functions,
    },
  }
}
