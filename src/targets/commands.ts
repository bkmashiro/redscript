import { DiagnosticError } from '../diagnostics'
import { emitInstr, isEmitterNoOp } from '../emit/command'
import { qualifiedFunctionRef } from '../emit/paths'
import type { LIRFunction, LIRInstr, LIRModule, SourceLoc } from '../lir/types'
import type { McVersion } from '../types/mc-version'
import { MCCommandValidator, type BrigadierFile } from '../mc-validator'
import commandTree from '../mc-validator/commands-1.21.4.json'
import {
  createCommandProgram,
  renderCommandProgramText,
  serializeCommandManifest,
  type CommandEffect,
  type CommandProgram,
  type CommandSource,
  type CommandStep,
} from './command-program'

export { renderCommandProgramText, serializeCommandManifest }
export type { CommandProgram } from './command-program'

export const DEFAULT_COMMAND_BUDGET = 1024
export const COMMAND_STATIC_VALIDATION_PROFILE = 'minecraft-1.21.4-baseline+selected-renderer'

export interface CommandLegalizationOptions {
  targetName: string
  namespace: string
  entryFunction: string
  manifestEntry?: string
  minecraftVersion: string
  mcVersion: McVersion
  maxCommands?: number
  sourceLabels?: ReadonlyMap<string, string>
}

interface Guard {
  player: string
  objective: string
  matches: '0' | '1'
}

interface FunctionRecord {
  id: string
  fn: LIRFunction
  module: LIRModule
}

interface ExpansionState {
  readonly functions: ReadonlyMap<string, FunctionRecord>
  readonly invoke: CommandStep[]
  readonly usedObjectives: Set<string>
  readonly allocatedGuards: Array<Omit<Guard, 'matches'>>
  readonly activeFunctions: string[]
  readonly options: Required<Pick<CommandLegalizationOptions, 'maxCommands'>> & CommandLegalizationOptions
  guardIndex: number
}

const BRANCH_RETURN_RE = /^(?:execute\s+(.+?)\s+run\s+)?return\s+run\s+function\s+([0-9A-Za-z_.-]+:[0-9A-Za-z_./-]+)$/
const STATIC_COMMAND_VALIDATOR = new MCCommandValidator(commandTree as unknown as BrigadierFile)

export function legalizeCommandProgram(
  modules: readonly LIRModule[],
  options: CommandLegalizationOptions,
): CommandProgram {
  const normalizedOptions = {
    ...options,
    maxCommands: options.maxCommands ?? DEFAULT_COMMAND_BUDGET,
  }
  if (!Number.isInteger(normalizedOptions.maxCommands) || normalizedOptions.maxCommands < 1) {
    throw commandDiagnostic('RST2102', `Command budget must be a positive integer, received ${normalizedOptions.maxCommands}`)
  }

  const functions = indexFunctions(modules)
  if (!functions.has(options.entryFunction)) {
    throw commandDiagnostic('RST2101', `Commands entry function '${options.entryFunction}' was not found`)
  }

  const state: ExpansionState = {
    functions,
    invoke: [],
    usedObjectives: new Set(),
    allocatedGuards: [],
    activeFunctions: [],
    options: normalizedOptions,
    guardIndex: 0,
  }
  expandFunction(options.entryFunction, [], [options.entryFunction], state)

  const setup = [...state.usedObjectives]
    .sort()
    .map<CommandStep>(objective => ({
      command: `scoreboard objectives add ${objective} dummy`,
      expansionTrace: [options.entryFunction],
      effect: 'state-write',
      generated: true,
    }))
  const cleanup = state.allocatedGuards.map<CommandStep>(guard => ({
    command: `scoreboard players reset ${guard.player} ${guard.objective}`,
    expansionTrace: [options.entryFunction],
    effect: 'state-write',
    generated: true,
  }))
  const phases = { setup, invoke: state.invoke, cleanup }
  ensureBudget(
    phases.setup.length + phases.invoke.length + phases.cleanup.length,
    [options.entryFunction],
    undefined,
    state,
  )
  verifyFinalCommands(phases)

  return createCommandProgram({
    name: options.targetName,
    kind: 'commands',
    namespace: options.namespace,
    entry: options.manifestEntry ?? options.entryFunction,
    minecraftVersion: options.minecraftVersion,
    commandBudget: normalizedOptions.maxCommands,
    validationProfile: COMMAND_STATIC_VALIDATION_PROFILE,
  }, phases)
}

function indexFunctions(modules: readonly LIRModule[]): ReadonlyMap<string, FunctionRecord> {
  const records = new Map<string, FunctionRecord>()
  for (const module of modules) {
    for (const fn of module.functions) {
      const id = qualifiedFunctionRef(fn.name, module.namespace)
      if (records.has(id)) {
        throw commandDiagnostic('RST2101', `Duplicate command-lowering function identity '${id}'`, fn.sourceLoc)
      }
      records.set(id, { id, fn, module })
    }
  }
  return records
}

function expandFunction(
  functionId: string,
  initialGuards: readonly Guard[],
  trace: readonly string[],
  state: ExpansionState,
): void {
  const record = state.functions.get(functionId)
  if (!record) {
    throw commandDiagnostic(
      'RST2101',
      `Residual function call '${functionId}' cannot be represented by a finite command sequence (expansion: ${trace.join(' -> ')})`,
    )
  }
  if (state.activeFunctions.includes(functionId)) {
    throw commandDiagnostic(
      'RST2101',
      `Recursive command expansion is not finite: ${[...state.activeFunctions, functionId].join(' -> ')}`,
      record.fn.sourceLoc,
    )
  }

  state.activeFunctions.push(functionId)
  state.usedObjectives.add(record.module.objective)
  let guards = [...initialGuards]
  try {
    for (const instr of record.fn.instructions) {
      if (instr.kind === 'call') {
        expandFunction(instr.fn, guards, [...trace, instr.fn], state)
        continue
      }
      if (instr.kind === 'call_macro' || instr.kind === 'call_context' || instr.kind === 'macro_line') {
        throw commandDiagnostic(
          'RST2101',
          `Residual ${instr.kind} operation in '${functionId}' requires a function artifact`,
          sourceLocation(instr.sourceLoc ?? record.fn.sourceLoc),
        )
      }
      if (
        instr.kind === 'call_if_matches'
        || instr.kind === 'call_unless_matches'
        || instr.kind === 'call_if_score'
        || instr.kind === 'call_unless_score'
      ) {
        expandConditionalCall(instr, record, guards, trace, state)
        continue
      }

      let command: string
      try {
        command = emitInstr(instr, state.options.namespace, record.module.objective, state.options.mcVersion)
      } catch (error) {
        throw commandDiagnostic(
          'RST2103',
          `Failed to render command for '${functionId}': ${(error as Error).message}`,
          sourceLocation(instr.sourceLoc ?? record.fn.sourceLoc),
        )
      }
      if (!command || isEmitterNoOp(instr)) continue

      if (instr.kind === 'raw') {
        const branch = command.match(BRANCH_RETURN_RE)
        if (branch) {
          const [, condition, target] = branch
          if (!condition) {
            expandFunction(target, guards, [...trace, target], state)
            return
          }
          const guard = allocateGuard(record.module.objective, instr, guards, trace, condition, state)
          expandFunction(target, [...guards, { ...guard, matches: '1' }], [...trace, target], state)
          guards = [...guards, { ...guard, matches: '0' }]
          continue
        }
      }

      appendStep(command, instr, record, guards, trace, false, state)
    }
  } finally {
    state.activeFunctions.pop()
  }
}

function expandConditionalCall(
  instr: Extract<LIRInstr, { kind: 'call_if_matches' | 'call_unless_matches' | 'call_if_score' | 'call_unless_score' }>,
  record: FunctionRecord,
  guards: readonly Guard[],
  trace: readonly string[],
  state: ExpansionState,
): void {
  const rendered = emitInstr(instr, state.options.namespace, record.module.objective, state.options.mcVersion)
  const suffix = ` run function ${instr.fn}`
  if (!rendered.startsWith('execute ') || !rendered.endsWith(suffix)) {
    throw commandDiagnostic('RST2101', `Cannot legalize conditional call '${rendered}'`, sourceLocation(instr.sourceLoc))
  }
  const condition = rendered.slice('execute '.length, -suffix.length)
  const guard = allocateGuard(record.module.objective, instr, guards, trace, condition, state)
  expandFunction(instr.fn, [...guards, { ...guard, matches: '1' }], [...trace, instr.fn], state)
}

function allocateGuard(
  objective: string,
  instr: LIRInstr,
  activeGuards: readonly Guard[],
  trace: readonly string[],
  condition: string,
  state: ExpansionState,
): Omit<Guard, 'matches'> {
  const player = `$__rs_cmd_guard_${state.guardIndex++}`
  appendGenerated(`scoreboard players set ${player} ${objective} 0`, instr, activeGuards, trace, 'state-write', state)
  appendGenerated(
    `execute ${condition} run scoreboard players set ${player} ${objective} 1`,
    instr,
    activeGuards,
    trace,
    'state-read-write',
    state,
  )
  const guard = { player, objective }
  state.allocatedGuards.push(guard)
  return guard
}

function appendGenerated(
  command: string,
  instr: LIRInstr,
  guards: readonly Guard[],
  trace: readonly string[],
  effect: CommandEffect,
  state: ExpansionState,
): void {
  const guarded = guardCommand(command, guards)
  const source = normalizeSource(instr.sourceLoc, state.options.sourceLabels)
  state.invoke.push({ command: guarded, source, expansionTrace: [...trace], effect, generated: true })
  ensureBudget(state.invoke.length + state.usedObjectives.size, trace, instr.sourceLoc, state)
}

function appendStep(
  command: string,
  instr: LIRInstr,
  record: FunctionRecord,
  guards: readonly Guard[],
  trace: readonly string[],
  generated: boolean,
  state: ExpansionState,
): void {
  const trimmed = command.trim()
  if (!trimmed || trimmed.includes('\n') || trimmed.includes('\r')) {
    throw commandDiagnostic('RST2103', 'Command sequence instructions must contain exactly one non-empty command', sourceLocation(instr.sourceLoc ?? record.fn.sourceLoc))
  }
  if (containsFunctionInvocation(trimmed)) {
    throw commandDiagnostic(
      'RST2101',
      `Residual function command is forbidden in commands artifacts: ${trimmed}`,
      sourceLocation(instr.sourceLoc ?? record.fn.sourceLoc),
    )
  }

  const finalCommand = guardCommand(trimmed, guards)
  state.invoke.push({
    command: finalCommand,
    source: normalizeSource(instr.sourceLoc ?? record.fn.sourceLoc, state.options.sourceLabels),
    expansionTrace: [...trace],
    effect: classifyEffect(instr),
    ...(generated ? { generated: true } : {}),
  })
  ensureBudget(state.invoke.length + state.usedObjectives.size, trace, instr.sourceLoc ?? record.fn.sourceLoc, state)
}

function guardCommand(command: string, guards: readonly Guard[]): string {
  if (guards.length === 0) return command
  const conditions = guards
    .map(guard => `if score ${guard.player} ${guard.objective} matches ${guard.matches}`)
    .join(' ')
  if (command.startsWith('execute ')) {
    return `execute ${conditions} ${command.slice('execute '.length)}`
  }
  return `execute ${conditions} run ${command}`
}

function classifyEffect(instr: LIRInstr): CommandEffect {
  switch (instr.kind) {
    case 'raw':
      return 'opaque'
    case 'score_set':
    case 'score_delta':
    case 'nbt_set_literal':
      return 'state-write'
    case 'score_copy':
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
    case 'score_swap':
    case 'store_cmd_to_score':
    case 'store_score_to_nbt':
    case 'store_nbt_to_score':
    case 'nbt_copy':
    case 'return_value':
      return 'state-read-write'
    default:
      return 'none'
  }
}

function containsFunctionInvocation(command: string): boolean {
  const trimmed = command.trim()
  if (/^function\s+/i.test(trimmed)) return true
  if (/^return\s+run\s+/i.test(trimmed)) {
    return containsFunctionInvocation(trimmed.replace(/^return\s+run\s+/i, ''))
  }
  if (!/^execute\s+/i.test(trimmed)) return false
  const nested = executeRunCommand(trimmed)
  return nested ? containsFunctionInvocation(nested) : false
}

function executeRunCommand(command: string): string | undefined {
  let quote: string | undefined
  let escaped = false
  let depth = 0
  let tokenStart = -1

  for (let index = 0; index <= command.length; index++) {
    const char = command[index] ?? ' '
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '{' || char === '[' || char === '(') depth++
    else if (char === '}' || char === ']' || char === ')') depth = Math.max(0, depth - 1)

    if (/\s/.test(char) && depth === 0) {
      if (tokenStart >= 0) {
        const token = command.slice(tokenStart, index)
        if (token === 'run') {
          const nestedStart = command.slice(index).search(/\S/)
          return nestedStart >= 0 ? command.slice(index + nestedStart) : undefined
        }
        tokenStart = -1
      }
    } else if (tokenStart < 0) {
      tokenStart = index
    }
  }
  return undefined
}

function verifyFinalCommands(phases: CommandProgram['phases']): void {
  for (const phase of ['setup', 'invoke', 'cleanup'] as const) {
    for (const step of phases[phase]) {
      if (!step.command.trim() || step.command.includes('\n') || step.command.includes('\r')) {
        throw commandDiagnostic('RST2103', `Invalid ${phase} command: each step must be a single non-empty line`, step.source)
      }
      if (containsFunctionInvocation(step.command)) {
        throw commandDiagnostic('RST2101', `Residual function command survived final verification: ${step.command}`, step.source)
      }
      const validation = STATIC_COMMAND_VALIDATOR.validate(step.command)
      if (!validation.valid) {
        throw commandDiagnostic(
          'RST2103',
          `Command failed static Minecraft validation (${validation.error ?? 'unknown syntax error'}): ${step.command}`,
          step.source,
        )
      }
    }
  }
}

function ensureBudget(
  count: number,
  trace: readonly string[],
  source: SourceLoc | undefined,
  state: ExpansionState,
): void {
  if (count <= state.options.maxCommands) return
  throw commandDiagnostic(
    'RST2102',
    `Command budget exceeded: ${count} > ${state.options.maxCommands} while expanding ${trace.join(' -> ')}`,
    sourceLocation(source),
  )
}

function normalizeSource(
  source: SourceLoc | undefined,
  labels: ReadonlyMap<string, string> | undefined,
): CommandSource | undefined {
  if (!source) return undefined
  const file = source.file ? (labels?.get(source.file) ?? source.file.replace(/\\/g, '/')) : undefined
  return { ...(file ? { file } : {}), line: source.line, col: source.col }
}

function sourceLocation(source?: SourceLoc | CommandSource) {
  return {
    ...(source?.file ? { file: source.file } : {}),
    line: source?.line ?? 1,
    col: source?.col ?? 1,
  }
}

function commandDiagnostic(
  code: 'RST2101' | 'RST2102' | 'RST2103',
  message: string,
  source?: SourceLoc | CommandSource,
): DiagnosticError {
  return new DiagnosticError('LoweringError', message, sourceLocation(source), undefined, code)
}
