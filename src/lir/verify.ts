/**
 * LIR Verifier — validates structural invariants of LIR modules.
 *
 * Checks:
 * 1. Compiler-owned fake-player Slots use the module's objective
 * 2. No undefined function references (call/call_if_* targets exist)
 * 3. macro_line only appears in isMacro functions
 */

import { SCORE_INT_MAX, SCORE_INT_MIN, isScoreInt, type LIRModule, type LIRFunction, type LIRInstr, type Slot } from './types'

export interface LIRVerifyError {
  fn: string
  message: string
}

export interface LIRVerifyOptions {
  /** Fully-qualified function refs that are intentionally not emitted by this module. */
  allowedFunctionRefs?: Iterable<string>
  /** When true, verifier leaves undefined-function diagnostics to earlier pipeline stages. */
  allowUnknownFunctionRefs?: boolean
  /** Functions whose unresolved refs are intentionally external to this module (e.g. standalone library files). */
  allowedExternalRefFunctions?: Iterable<string>
}

export function verifyLIR(module: LIRModule, options: LIRVerifyOptions = {}): LIRVerifyError[] {
  const errors: LIRVerifyError[] = []
  const normalizedFunctionRefs = new Set<string>()
  const normalizedFunctionPaths = new Map<string, string>()

  for (const ref of options.allowedFunctionRefs ?? []) {
    normalizedFunctionRefs.add(normalizeFunctionRef(ref, module.namespace))
  }

  for (const fn of module.functions) {
    const normalizedPath = normalizeFunctionPathPart(fn.name)
    const previous = normalizedFunctionPaths.get(normalizedPath)
    if (previous !== undefined && previous !== fn.name) {
      errors.push({
        fn: fn.name,
        message: `function path collision: '${previous}' and '${fn.name}' both emit as '${module.namespace}:${normalizedPath}'`,
      })
    }
    normalizedFunctionPaths.set(normalizedPath, fn.name)
    normalizedFunctionRefs.add(normalizeFunctionRef(fn.name, module.namespace))
  }

  for (const fn of module.functions) {
    errors.push(...verifyFunction(fn, module, normalizedFunctionRefs, options))
  }

  return errors
}

function verifyFunction(
  fn: LIRFunction,
  module: LIRModule,
  normalizedFunctionRefs: Set<string>,
  options: LIRVerifyOptions,
): LIRVerifyError[] {
  const errors: LIRVerifyError[] = []
  const allowsExternalRefs = new Set(
    [...(options.allowedExternalRefFunctions ?? [])].map(fnName => normalizeFunctionPathPart(fnName)),
  ).has(normalizeFunctionPathPart(fn.name))

  for (const instr of fn.instructions) {
    // Check compiler-owned objective consistency. Vanilla scoreboard interop
    // slots may intentionally target external players/objectives such as
    // `#p obj`; compiler temps/return/param slots are fake players prefixed
    // with `$` and must stay on the module objective.
    for (const slot of getSlotsFromInstr(instr)) {
      if (slot.player.startsWith('$') && slot.obj !== module.objective && !slot.obj.startsWith('__rs_')) {
        errors.push({
          fn: fn.name,
          message: `slot '${slot.player}' uses objective '${slot.obj}' but module objective is '${module.objective}'`,
        })
      }
    }

    // Check function references
    for (const ref of getFnRefsFromInstr(instr)) {
      // Skip empty refs (used in store_cmd_to_score with cmp pattern)
      if (ref === '' || ref === `${module.namespace}:`) continue
      const normalizedRef = normalizeFunctionRef(ref, module.namespace)
      const refersToLocalFn = normalizedFunctionRefs.has(normalizedRef)
      if (!refersToLocalFn && !options.allowUnknownFunctionRefs && !allowsExternalRefs) {
        errors.push({
          fn: fn.name,
          message: `references undefined function '${ref}'`,
        })
      }
    }

    // Check macro_line only in macro functions
    if (instr.kind === 'macro_line' && !fn.isMacro) {
      errors.push({
        fn: fn.name,
        message: `macro_line instruction in non-macro function`,
      })
    }

    for (const candidate of getInstrsFromInstr(instr)) {
      if (candidate.kind !== 'score_delta' || (isScoreInt(candidate.value) && candidate.value !== SCORE_INT_MIN)) continue
      const reason = !Number.isFinite(candidate.value)
        ? 'non-finite value'
        : !Number.isInteger(candidate.value)
          ? 'non-integer value'
          : candidate.value === SCORE_INT_MIN
            ? 'not emit-safe as a single remove immediate'
            : `out of range [${SCORE_INT_MIN}, ${SCORE_INT_MAX}]`
      errors.push({
        fn: fn.name,
        message: `score_delta immediate '${candidate.value}' is invalid: ${reason}`,
      })
    }
  }

  return errors
}

function normalizeFunctionPathPart(name: string): string {
  return name.replace(/::/g, '/').toLowerCase()
}

function normalizeFunctionRef(ref: string, namespace: string): string {
  const colon = ref.indexOf(':')
  if (colon >= 0 && ref[colon + 1] !== ':') {
    return `${ref.slice(0, colon)}:${normalizeFunctionPathPart(ref.slice(colon + 1))}`
  }
  return `${namespace}:${normalizeFunctionPathPart(ref)}`
}

function getInstrsFromInstr(instr: LIRInstr): LIRInstr[] {
  if (instr.kind === 'store_cmd_to_score') return [instr, ...getInstrsFromInstr(instr.cmd)]
  return [instr]
}

function getSlotsFromInstr(instr: LIRInstr): Slot[] {
  switch (instr.kind) {
    case 'score_set':
    case 'score_delta':
      return [instr.dst]
    case 'score_copy':
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
      return [instr.dst, instr.src]
    case 'score_swap':
      return [instr.a, instr.b]
    case 'store_cmd_to_score':
      return [instr.dst, ...getSlotsFromInstr(instr.cmd)]
    case 'store_score_to_nbt':
      return [instr.src]
    case 'store_nbt_to_score':
      return [instr.dst]
    case 'call_if_matches':
    case 'call_unless_matches':
      return [instr.slot]
    case 'call_if_score':
    case 'call_unless_score':
      return [instr.a, instr.b]
    case 'return_value':
      return [instr.slot]
    case 'call':
    case 'call_macro':
    case 'call_context':
    case 'nbt_set_literal':
    case 'nbt_copy':
    case 'macro_line':
    case 'raw':
      return []
  }
}

function getFnRefsFromInstr(instr: LIRInstr): string[] {
  switch (instr.kind) {
    case 'call':
      return [instr.fn]
    case 'call_macro':
      return [instr.fn]
    case 'call_if_matches':
    case 'call_unless_matches':
      return [instr.fn]
    case 'call_if_score':
    case 'call_unless_score':
      return [instr.fn]
    case 'call_context':
      return [instr.fn]
    case 'store_cmd_to_score':
      return getFnRefsFromInstr(instr.cmd)
    default:
      return []
  }
}
