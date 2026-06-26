import type {
  MIRFunction,
  MIRInstr,
  MIRModule,
  Operand,
  SourceLoc as MIRSourceLoc,
  Temp,
} from '../../../mir/types'
import { VIRModuleBuilder } from '../builder'
import type { SourceLoc, VIRModule } from '../types'
import type { BlockId, FuncId, LocId, TypeId, ValueId } from '../ids'
import { VirUnsupportedReasonTag } from './unsupported-tags'

type MIRToVirResultUnsupported = {
  kind: 'unsupported'
  reason: string
  reasonTags?: VirUnsupportedReasonTag[]
  unsupportedMirOpKinds?: string[]
  unsupportedMirCallTargets?: Array<{
    fn: string
    argCount: number
    hasResult: boolean
  }>
}

export type MirToVirResult = MIRToVirResultUnsupported | {
  kind: 'ok'
  module: VIRModule
}

interface ExtendedArithmeticInstr {
  kind: 'min' | 'max'
  dst: Temp
  a: Operand
  b: Operand
}

type MIRConstInstr = MIRInstr & { kind: 'const'; dst: string; value: number }
type MIRBinaryInstr = (MIRInstr & {
  kind: 'add' | 'sub' | 'mul' | 'div' | 'mod'
  dst: string
  a: Operand
  b: Operand
}) | ExtendedArithmeticInstr

type ArithmeticBinaryKind = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'min' | 'max'
type ArithmeticInput = MIRConstInstr | MIRBinaryInstr
type ArithOpKind = 'arith.add' | 'arith.sub' | 'arith.mul' | 'arith.div' | 'arith.mod' | 'arith.min' | 'arith.max'

function mirSourceToVir(loc?: MIRSourceLoc): SourceLoc | undefined {
  if (!loc) return undefined
  return {
    kind: 'source',
    file: loc.file,
    start: {
      line: loc.line,
      col: loc.col,
    },
    end: {
      line: loc.line,
      col: loc.col,
    },
  }
}

function isSupportedArithmetic(instr: MIRInstr | ExtendedArithmeticInstr): instr is ArithmeticInput {
  return (
    instr.kind === 'const'
    || instr.kind === 'add'
    || instr.kind === 'sub'
    || instr.kind === 'mul'
    || instr.kind === 'div'
    || instr.kind === 'mod'
    || instr.kind === 'min'
    || instr.kind === 'max'
  )
}

function mapArithmeticKind(kind: ArithmeticBinaryKind): ArithOpKind {
  if (kind === 'add') return 'arith.add'
  if (kind === 'sub') return 'arith.sub'
  if (kind === 'mul') return 'arith.mul'
  if (kind === 'div') return 'arith.div'
  if (kind === 'mod') return 'arith.mod'
  if (kind === 'min') return 'arith.min'
  return 'arith.max'
}

interface MirFunctionValidationFailure {
  reason: string
  reasonTags: VirUnsupportedReasonTag[]
}

function validateFunction(fn: MIRFunction): MirFunctionValidationFailure | null {
  if (fn.isMacro) {
    return {
      reason: `unsupported macro function '${fn.name}'`,
      reasonTags: ['unsupported-call-boundary'],
    }
  }

  const entry = fn.blocks.find(block => block.id === fn.entry)
  if (!entry) {
    return {
      reason: `function '${fn.name}' missing entry block '${fn.entry}'`,
      reasonTags: ['unsupported-control-flow-shape'],
    }
  }
  if (entry.id !== fn.entry) {
    return {
      reason: `unsupported first block '${entry.id}' in '${fn.name}'`,
      reasonTags: ['unsupported-control-flow-shape'],
    }
  }
  if (entry.term.kind !== 'return') {
    return {
      reason: `unsupported non-return terminator in '${fn.name}'`,
      reasonTags: ['unsupported-control-flow-shape'],
    }
  }
  if (fn.blocks.length !== 1) {
    return {
      reason: `unsupported multi-block function '${fn.name}'`,
      reasonTags: ['unsupported-control-flow-shape'],
    }
  }

  return null
}

function resolveOperand(
  operand: Operand,
  builder: VIRModuleBuilder,
  fnId: FuncId,
  blockId: BlockId,
  intType: TypeId,
  valueEnv: Map<string, ValueId>,
  location: LocId,
): MIRToVirResultUnsupported | { kind: 'ok'; value: ValueId } {
  if (operand.kind === 'const') {
    const value = builder.addConst(fnId, blockId, operand.value, intType, location)
    return { kind: 'ok', value }
  }

  const existing = valueEnv.get(operand.name)
  if (existing === undefined) {
    return {
      kind: 'unsupported',
      reason: `unsupported use of undeclared MIR temp '${operand.name}'`,
      reasonTags: ['unsupported-operand-shape'],
    }
  }

  return { kind: 'ok', value: existing }
}

function lowerInstruction(
  instr: ArithmeticInput,
  fnId: FuncId,
  blockId: BlockId,
  builder: VIRModuleBuilder,
  intType: TypeId,
  valueEnv: Map<string, ValueId>,
  location: LocId,
): MIRToVirResultUnsupported | null {
  if (instr.kind === 'const') {
    const value = builder.addConst(fnId, blockId, instr.value, intType, location)
    valueEnv.set(instr.dst, value)
    return null
  }

  const opKind = mapArithmeticKind(instr.kind)
  const left = resolveOperand(instr.a, builder, fnId, blockId, intType, valueEnv, location)
  if (left.kind === 'unsupported') return left

  const right = resolveOperand(instr.b, builder, fnId, blockId, intType, valueEnv, location)
  if (right.kind === 'unsupported') return right

  const result = builder.addBinary(fnId, blockId, opKind, left.value, right.value, intType, location)
  valueEnv.set(instr.dst, result)

  return null
}

export function lowerMirToVir(mir: MIRModule): MirToVirResult {
  const builder = new VIRModuleBuilder(mir.namespace, mir.objective)
  const intType = builder.internType('i32')

  for (const fn of mir.functions) {
    const unsupported = validateFunction(fn)
    if (unsupported) {
      return {
        kind: 'unsupported',
        reason: unsupported.reason,
        reasonTags: unsupported.reasonTags,
      }
    }

    const sourceLoc = mirSourceToVir(fn.sourceLoc)
    const functionLoc = sourceLoc ? builder.addSourceLocation(sourceLoc) : builder.addUnknownLoc()
    const entry = fn.blocks.find(block => block.id === fn.entry)
    if (!entry) {
      return {
        kind: 'unsupported',
        reason: `function '${fn.name}' has missing entry block`,
        reasonTags: ['unsupported-control-flow-shape'],
      }
    }

    if (entry.term.kind !== 'return') {
      return {
        kind: 'unsupported',
        reason: `function '${fn.name}' has non-return terminator`,
        reasonTags: ['unsupported-control-flow-shape'],
      }
    }

    const term = entry.term
    const signatureResults = term.value === null ? [] : [intType]
    const fnEntry = builder.addFunction(
      fn.name,
      fn.params.map(() => intType),
      signatureResults,
      sourceLoc ? { source: sourceLoc } : {},
    )

    const valueEnv = new Map<string, ValueId>()
    const locForBody = builder.addSyntheticLoc(`mir-to-vir ${fn.name}`, functionLoc)

    for (const param of fn.params) {
      const paramValue = builder.addParam(
        fnEntry.functionId,
        intType,
        param.name,
        {},
        locForBody,
      )
      valueEnv.set(param.name, paramValue)
    }

    for (const rawInstr of entry.instrs) {
      if (!isSupportedArithmetic(rawInstr)) {
        const baseUnsupported: Pick<MIRToVirResultUnsupported, 'reason' | 'reasonTags' | 'unsupportedMirOpKinds'> = {
          reason: rawInstr.kind === 'call'
            ? `unsupported instruction 'call' in '${fn.name}': fn='${rawInstr.fn}' args=${rawInstr.args.length} hasResult=${rawInstr.dst !== null}`
            : `unsupported instruction '${rawInstr.kind}' in '${fn.name}'`,
          reasonTags: ['unsupported-mir-op-kind'],
          unsupportedMirOpKinds: [rawInstr.kind],
        }

        if (rawInstr.kind === 'call') {
          return {
            kind: 'unsupported',
            ...baseUnsupported,
            unsupportedMirCallTargets: [{
              fn: rawInstr.fn,
              argCount: rawInstr.args.length,
              hasResult: rawInstr.dst !== null,
            }],
          }
        }

        return {
          kind: 'unsupported',
          ...baseUnsupported,
        }
      }

      const lowered = lowerInstruction(
        rawInstr,
        fnEntry.functionId,
        fnEntry.entryBlock,
        builder,
        intType,
        valueEnv,
        locForBody,
      )
      if (lowered) return lowered
    }

    if (term.value === null) {
      builder.addReturn(fnEntry.functionId, fnEntry.entryBlock, [], locForBody)
      continue
    }

    const returnValue = resolveOperand(term.value, builder, fnEntry.functionId, fnEntry.entryBlock, intType, valueEnv, locForBody)
    if (returnValue.kind === 'unsupported') return returnValue

    builder.addReturn(fnEntry.functionId, fnEntry.entryBlock, [returnValue.value], locForBody)
  }

  return { kind: 'ok', module: builder.build() }
}
