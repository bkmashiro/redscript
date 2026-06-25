import type { BlockId, FuncId, LocId, ModuleId, OpId, TypeId, ValueId } from './ids'

export interface SourcePos {
  line: number
  col: number
}

export interface SourceLoc {
  kind: 'source'
  file: string
  start: SourcePos
  end: SourcePos
}

export interface SyntheticLoc {
  kind: 'synthetic'
  reason: string
  parent: LocId
}

export interface FusedLoc {
  kind: 'fused'
  locations: LocId[]
  pass?: string
}

export interface UnknownLoc {
  kind: 'unknown'
}

export type Location = SourceLoc | SyntheticLoc | FusedLoc | UnknownLoc

export interface LocationEntry {
  id: LocId
  loc: Location
}

export type VIRTypeKind = 'i32' | 'bool'

export interface VIRType {
  id: TypeId
  kind: VIRTypeKind
}

export interface VIRFunctionType {
  params: TypeId[]
  results: TypeId[]
}

export interface VIRFunction {
  id: FuncId
  name: string
  signature: VIRFunctionType
  entryBlock: BlockId
  blocks: BlockId[]
  paramValues: ValueId[]
  loc: LocId
}

export interface VIRBlock {
  id: BlockId
  function: FuncId
  name: string
  opIds: OpId[]
  loc: LocId
}

export type VIRValueAttr = string | number | boolean

export interface VIRValueAttrs {
  [key: string]: VIRValueAttr
}

export interface VIRValueBase {
  id: ValueId
  function: FuncId
  type: TypeId
  loc: LocId
  attrs: VIRValueAttrs
}

export interface VIRValueParam extends VIRValueBase {
  kind: 'param'
  name: string
}

export interface VIRValueOpResult extends VIRValueBase {
  kind: 'op'
  definingOp: OpId
}

export type VIRRemovedBy = 'dce' | 'cse' | 'canonicalize' | 'manual'

export interface VIRValueRemoved extends VIRValueBase {
  kind: 'removed'
  removedBy: VIRRemovedBy
  reason?: string
}

export type VIRValue = VIRValueParam | VIRValueOpResult | VIRValueRemoved

export type VIRBinaryKind =
  | 'arith.add'
  | 'arith.sub'
  | 'arith.mul'
  | 'arith.div'
  | 'arith.mod'
  | 'arith.min'
  | 'arith.max'

export type VIRArithIdentityKind = 'arith.identity'

interface VIRBinaryOpBase {
  id: OpId
  block: BlockId
  loc: LocId
  resultIds: [ValueId]
  type: TypeId
}

export interface VIRConstantOp {
  kind: 'arith.constant'
  value: number
  operands: []
}

export interface VIROperandOp extends VIRBinaryOpBase {
  kind: VIRBinaryKind
  operands: [ValueId, ValueId]
}

export interface VIRIdentityOp extends VIRBinaryOpBase {
  kind: VIRArithIdentityKind
  operands: [ValueId]
}

export interface VIRReturnOp {
  kind: 'cf.return'
  id: OpId
  block: BlockId
  loc: LocId
  resultIds: []
  operands: ValueId[]
}

export type VIROperation =
  | (VIROperandOp & { kind: VIRBinaryKind; operands: [ValueId, ValueId] })
  | (VIRConstantOp & VIRBinaryOpBase & { operands: [] })
  | (VIRIdentityOp & { kind: VIRArithIdentityKind; operands: [ValueId] })
  | VIRReturnOp

export interface VIRModule {
  id: ModuleId
  namespace: string
  objective: string
  types: VIRType[]
  locs: LocationEntry[]
  values: VIRValue[]
  blocks: VIRBlock[]
  functions: VIRFunction[]
  ops: VIROperation[]
}

export interface ModuleTables {
  type: VIRType[]
  loc: LocationEntry[]
  value: VIRValue[]
  block: VIRBlock[]
  function: VIRFunction[]
  op: VIROperation[]
}

export function isTerminator(op: VIROperation): op is VIRReturnOp {
  return op.kind === 'cf.return'
}

export function isPureOp(op: VIROperation): boolean {
  if (op.kind === 'cf.return') return false
  return op.kind === 'arith.constant' || op.kind.startsWith('arith.')
}

export function operationOperands(op: VIROperation): ValueId[] {
  if (op.kind === 'cf.return') return [...op.operands]
  if (op.kind === 'arith.constant') return [...op.operands]
  if (op.kind === 'arith.identity') return [...op.operands]
  return [...op.operands]
}

export function operationResults(op: VIROperation): ValueId[] {
  return [...op.resultIds]
}

export function operationExpectedOperandCount(op: VIROperation): number {
  if (op.kind === 'arith.constant') return 0
  if (op.kind === 'arith.identity') return 1
  if (op.kind === 'cf.return') return -1
  return 2
}

export function operationExpectedResultCount(op: VIROperation): number {
  if (op.kind === 'cf.return') return 0
  return 1
}

function cloneLocation(location: Location): Location {
  if (location.kind === 'source') {
    return {
      kind: 'source',
      file: location.file,
      start: {
        line: location.start.line,
        col: location.start.col,
      },
      end: {
        line: location.end.line,
        col: location.end.col,
      },
    }
  }

  if (location.kind === 'synthetic') {
    return {
      kind: 'synthetic',
      reason: location.reason,
      parent: location.parent,
    }
  }

  if (location.kind === 'fused') {
    return {
      kind: 'fused',
      locations: [...location.locations],
      pass: location.pass,
    }
  }

  return {
    kind: 'unknown',
  }
}

export function cloneVIRModule(module: VIRModule): VIRModule {
  return {
    id: module.id,
    namespace: module.namespace,
    objective: module.objective,
    types: module.types.map(type => ({
      id: type.id,
      kind: type.kind,
    })),
    locs: module.locs.map(entry => ({
      id: entry.id,
      loc: cloneLocation(entry.loc),
    })),
    values: module.values.map(value => {
      if (value.kind === 'param') {
        return {
          kind: 'param',
          id: value.id,
          function: value.function,
          type: value.type,
          loc: value.loc,
          attrs: { ...value.attrs },
          name: value.name,
        }
      }

      if (value.kind === 'op') {
        return {
          kind: 'op',
          id: value.id,
          function: value.function,
          type: value.type,
          loc: value.loc,
          attrs: { ...value.attrs },
          definingOp: value.definingOp,
        }
      }

      return {
        kind: 'removed',
        id: value.id,
        function: value.function,
        type: value.type,
        loc: value.loc,
        attrs: { ...value.attrs },
        removedBy: value.removedBy,
        reason: value.reason,
      }
    }),
    blocks: module.blocks.map(block => ({
      id: block.id,
      function: block.function,
      name: block.name,
      opIds: [...block.opIds],
      loc: block.loc,
    })),
    functions: module.functions.map(fn => ({
      id: fn.id,
      name: fn.name,
      signature: {
        params: [...fn.signature.params],
        results: [...fn.signature.results],
      },
      entryBlock: fn.entryBlock,
      blocks: [...fn.blocks],
      paramValues: [...fn.paramValues],
      loc: fn.loc,
    })),
    ops: module.ops.map(op => {
      if (op.kind === 'arith.constant') {
        return {
          kind: 'arith.constant',
          id: op.id,
          block: op.block,
          loc: op.loc,
          resultIds: [...op.resultIds],
          type: op.type,
          value: op.value,
          operands: [],
        }
      }

      if (op.kind === 'arith.identity') {
        return {
          kind: 'arith.identity',
          id: op.id,
          block: op.block,
          loc: op.loc,
          resultIds: [...op.resultIds],
          type: op.type,
          operands: [...op.operands],
        }
      }

      if (op.kind === 'cf.return') {
        return {
          kind: 'cf.return',
          id: op.id,
          block: op.block,
          loc: op.loc,
          resultIds: [],
          operands: [...op.operands],
        }
      }

      return {
        kind: op.kind,
        id: op.id,
        block: op.block,
        loc: op.loc,
        resultIds: [...op.resultIds],
        type: op.type,
        operands: [...op.operands],
      }
    }),
  }
}
