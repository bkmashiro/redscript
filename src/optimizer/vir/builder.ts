import type {
  FusedLoc,
  Location,
  LocationEntry,
  SourceLoc,
  VIRArithIdentityKind,
  VIRBinaryKind,
  VIRBlock,
  VIRConstantOp,
  VIRFunction,
  VIRIdentityOp,
  VIRModule,
  VIRRemovedBy,
  VIRTypeKind,
  VIROperation,
  VIRValue,
  VIRValueAttrs,
  VIRValueOpResult,
  VIRValueParam,
} from './types'
import { cloneVIRModule } from './types'
import type { BlockId, FuncId, LocId, ModuleId, OpId, TypeId, ValueId } from './ids'

type Branded = { readonly __brand: string }

interface AddFunctionOptions {
  source?: SourceLoc
}

function asNumber(id: Branded): number {
  return Number(id)
}

function sourceAsLocation(source: SourceLoc): Location {
  return {
    kind: 'source',
    file: source.file,
    start: {
      line: source.start.line,
      col: source.start.col,
    },
    end: {
      line: source.end.line,
      col: source.end.col,
    },
  }
}

function isEqualLocation(left: Location, right: Location): boolean {
  if (left.kind !== right.kind) return false

  if (left.kind === 'unknown') return true

  if (left.kind === 'source') {
    return right.kind === 'source'
      && left.file === right.file
      && left.start.line === right.start.line
      && left.start.col === right.start.col
      && left.end.line === right.end.line
      && left.end.col === right.end.col
  }

  if (left.kind === 'synthetic') {
    return right.kind === 'synthetic'
      && left.reason === right.reason
      && left.parent === right.parent
  }

  if (left.kind === 'fused') {
    if (right.kind !== 'fused') return false
    if ((left.pass ?? '') !== (right.pass ?? '')) return false
    if (left.locations.length !== right.locations.length) return false
    return left.locations.every((location, index) => location === right.locations[index])
  }

  return false
}

export class VIRModuleBuilder {
  private nextTypeId = 0
  private nextLocId = 0
  private nextFuncId = 0
  private nextBlockId = 0
  private nextValueId = 0
  private nextOpId = 0

  private readonly module: VIRModule

  constructor(namespace: string, objective: string) {
    this.module = {
      id: 0 as ModuleId,
      namespace,
      objective,
      types: [],
      locs: [],
      values: [],
      blocks: [],
      functions: [],
      ops: [],
    }
  }

  build(): VIRModule {
    return cloneVIRModule(this.module)
  }

  internType(kind: VIRTypeKind): TypeId {
    const existing = this.module.types.find(type => type.kind === kind)
    if (existing) {
      return existing.id
    }

    const id = this.nextTypeId as TypeId
    this.nextTypeId += 1
    this.module.types.push({ id, kind })
    return id
  }

  addSourceLoc(file: string, line: number, col: number): LocId {
    return this.addLoc({
      kind: 'source',
      file,
      start: { line, col },
      end: { line, col },
    })
  }

  addSourceLocation(location: SourceLoc): LocId {
    return this.addLoc(sourceAsLocation(location))
  }

  addSyntheticLoc(reason: string, parent: LocId): LocId {
    return this.addLoc({
      kind: 'synthetic',
      reason,
      parent,
    })
  }

  addFusedLoc(locations: LocId[], pass?: string): LocId {
    return this.addLoc({
      kind: 'fused',
      locations: [...locations],
      pass,
    })
  }

  addUnknownLoc(): LocId {
    return this.addLoc({ kind: 'unknown' })
  }

  addFunction(name: string, paramTypes: TypeId[], resultTypes: TypeId[], options: AddFunctionOptions = {}): {
    functionId: FuncId
    entryBlock: BlockId
  } {
    const functionId = this.nextFuncId as FuncId
    this.nextFuncId += 1

    const functionLoc = options.source
      ? this.addSourceLocation(options.source)
      : this.addUnknownLoc()

    const fn: VIRFunction = {
      id: functionId,
      name,
      signature: {
        params: [...paramTypes],
        results: [...resultTypes],
      },
      entryBlock: 0 as BlockId,
      blocks: [],
      paramValues: [],
      loc: functionLoc,
    }

    this.module.functions.push(fn)

    const entryBlock = this.addBlock(functionId, 'entry', functionLoc)

    fn.entryBlock = entryBlock

    return {
      functionId,
      entryBlock,
    }
  }

  addBlock(functionId: FuncId, name: string, loc?: LocId): BlockId {
    const blockLoc = loc ?? this.addUnknownLoc()
    const id = this.nextBlockId as BlockId
    this.nextBlockId += 1

    const block: VIRBlock = {
      id,
      function: functionId,
      name,
      opIds: [],
      loc: blockLoc,
    }

    this.module.blocks.push(block)

    const fn = this.requireFunction(functionId)
    fn.blocks.push(id)

    return id
  }

  addParam(functionId: FuncId, type: TypeId, name: string, attrs: VIRValueAttrs = {}, loc?: LocId): ValueId {
    const fn = this.requireFunction(functionId)

    const index = fn.paramValues.length
    if (index >= fn.signature.params.length) {
      throw new Error(`function '${fn.name}' already has ${fn.signature.params.length} params`)
    }

    if (type !== fn.signature.params[index]) {
      throw new Error(`function '${fn.name}' parameter ${index} has unexpected type`)
    }

    const valueId = this.nextValueId as ValueId
    this.nextValueId += 1

    const value: VIRValueParam = {
      kind: 'param',
      id: valueId,
      function: functionId,
      type,
      loc: loc ?? this.addUnknownLoc(),
      attrs: { ...attrs },
      name,
    }

    this.module.values.push(value)
    fn.paramValues.push(valueId)

    return valueId
  }

  addConst(functionId: FuncId, blockId: BlockId, value: number, type: TypeId, loc?: LocId): ValueId {
    this.requireFunction(functionId)
    this.requireBlock(functionId, blockId)

    const valueId = this.nextValueId as ValueId
    this.nextValueId += 1
    const opId = this.nextOpId as OpId
    this.nextOpId += 1

    const op: VIROperation = {
      kind: 'arith.constant',
      id: opId,
      block: blockId,
      loc: loc ?? this.addUnknownLoc(),
      resultIds: [valueId],
      type,
      value,
      operands: [],
    }

    const defined: VIRValueOpResult = {
      kind: 'op',
      id: valueId,
      function: functionId,
      type,
      loc: op.loc,
      attrs: {},
      definingOp: opId,
    }

    this.module.values.push(defined)
    this.module.ops.push(op)
    this.module.blocks[asNumber(blockId)].opIds.push(opId)

    return valueId
  }

  addBinary(
    functionId: FuncId,
    blockId: BlockId,
    kind: VIRBinaryKind,
    left: ValueId,
    right: ValueId,
    type: TypeId,
    loc?: LocId,
  ): ValueId {
    this.requireFunction(functionId)
    this.requireBlock(functionId, blockId)

    const valueId = this.nextValueId as ValueId
    this.nextValueId += 1
    const opId = this.nextOpId as OpId
    this.nextOpId += 1

    const op: VIROperation = {
      kind,
      id: opId,
      block: blockId,
      loc: loc ?? this.addUnknownLoc(),
      resultIds: [valueId],
      type,
      operands: [left, right],
    }

    const defined: VIRValueOpResult = {
      kind: 'op',
      id: valueId,
      function: functionId,
      type,
      loc: op.loc,
      attrs: {},
      definingOp: opId,
    }

    this.module.values.push(defined)
    this.module.ops.push(op)
    this.module.blocks[asNumber(blockId)].opIds.push(opId)

    return valueId
  }

  addIdentity(
    functionId: FuncId,
    blockId: BlockId,
    source: ValueId,
    type: TypeId,
    loc?: LocId,
    kind: VIRArithIdentityKind = 'arith.identity',
  ): ValueId {
    this.requireFunction(functionId)
    this.requireBlock(functionId, blockId)

    const valueId = this.nextValueId as ValueId
    this.nextValueId += 1
    const opId = this.nextOpId as OpId
    this.nextOpId += 1

    const op: VIROperation = {
      kind,
      id: opId,
      block: blockId,
      loc: loc ?? this.addUnknownLoc(),
      resultIds: [valueId],
      type,
      operands: [source],
    }

    const defined: VIRValueOpResult = {
      kind: 'op',
      id: valueId,
      function: functionId,
      type,
      loc: op.loc,
      attrs: {},
      definingOp: opId,
    }

    this.module.values.push(defined)
    this.module.ops.push(op)
    this.module.blocks[asNumber(blockId)].opIds.push(opId)

    return valueId
  }

  addReturn(functionId: FuncId, blockId: BlockId, operands: ValueId[], loc?: LocId): OpId {
    this.requireFunction(functionId)
    this.requireBlock(functionId, blockId)

    const opId = this.nextOpId as OpId
    this.nextOpId += 1

    const op: VIROperation = {
      kind: 'cf.return',
      id: opId,
      block: blockId,
      loc: loc ?? this.addUnknownLoc(),
      resultIds: [],
      operands: [...operands],
    }

    this.module.ops.push(op)
    this.module.blocks[asNumber(blockId)].opIds.push(opId)

    return opId
  }

  markValueRemoved(valueId: ValueId, removedBy: VIRRemovedBy, reason?: string): void {
    const index = asNumber(valueId)
    const value = this.module.values[index]
    if (!value || value.kind !== 'op') {
      return
    }

    this.module.values[index] = {
      kind: 'removed',
      id: value.id,
      function: value.function,
      type: value.type,
      loc: value.loc,
      attrs: { ...value.attrs },
      removedBy,
      reason,
    }
  }

  getFunction(functionId: FuncId): VIRFunction {
    return this.requireFunction(functionId)
  }

  getValue(valueId: ValueId): VIRValue {
    const value = this.module.values[asNumber(valueId)]
    if (!value || value.id !== valueId) {
      throw new Error(`unknown value '${asNumber(valueId)}'`)
    }

    return value
  }

  getLocationEntries(): LocationEntry[] {
    return [...this.module.locs]
  }

  private addLoc(location: Location): LocId {
    const existing = this.module.locs.find(entry => isEqualLocation(entry.loc, location))
    if (existing !== undefined) {
      return existing.id
    }

    const id = this.nextLocId as LocId
    this.nextLocId += 1
    this.module.locs.push({ id, loc: location })
    return id
  }

  private block(blockId: BlockId): VIRBlock {
    const block = this.module.blocks[asNumber(blockId)]
    if (!block || block.id !== blockId) {
      throw new Error(`unknown block '${asNumber(blockId)}'`)
    }
    return block
  }

  private requireFunction(functionId: FuncId): VIRFunction {
    const fn = this.module.functions[asNumber(functionId)]
    if (!fn || fn.id !== functionId) {
      throw new Error(`unknown function '${asNumber(functionId)}'`)
    }
    return fn
  }

  private requireBlock(functionId: FuncId, blockId: BlockId): void {
    const block = this.block(blockId)
    if (block.function !== functionId) {
      throw new Error(`block '${asNumber(blockId)}' does not belong to function '${asNumber(functionId)}'`)
    }
  }
}
