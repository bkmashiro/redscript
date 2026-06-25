import type { ValueId } from '../ids'
import type { VIROperation, VIRFunction, VIRModule } from '../types'
import { operationOperands } from '../types'

interface BrandedId {
  readonly __brand: string
}

function asNumber(id: BrandedId): number {
  return Number(id)
}

function nextAfter(indices: number[], after: number): number | null {
  for (const index of indices) {
    if (index > after) return index
  }
  return null
}

interface VIRFunctionOpPoint {
  index: number
  op: VIROperation
}

export interface VIRValueLivenessPoint {
  valueId: ValueId
  defIndex: number | null
  uses: number[]
  firstUse: number | null
  lastUse: number | null
}

export interface VIRFunctionLiveness {
  functionName: string
  blockId: number
  opPoints: VIRFunctionOpPoint[]
  valuePoints: VIRValueLivenessPoint[]
  opCount: number

  hasValue(valueId: ValueId): boolean
  defIndex(valueId: ValueId): number | null
  lastUse(valueId: ValueId): number | null
  firstUse(valueId: ValueId): number | null
  nextUseAfter(opIndex: number, valueId: ValueId): number | null
  nextWriteAfter(opIndex: number, valueId: ValueId): number | null
  isLiveAfter(opIndex: number, valueId: ValueId): boolean
  isDeadAfter(opIndex: number, valueId: ValueId): boolean
}

function createMapFromPoints(points: VIRValueLivenessPoint[]): Map<number, VIRValueLivenessPoint> {
  const map = new Map<number, VIRValueLivenessPoint>()
  for (const point of points) {
    map.set(asNumber(point.valueId), point)
  }
  return map
}

export function collectFunctionOperations(module: VIRModule, fn: VIRFunction): VIROperation[] {
  if (fn.blocks.length !== 1) {
    throw new Error(`function '${fn.name}' has ${fn.blocks.length} blocks (expected 1)`)
  }

  const blockId = fn.blocks[0]
  const block = module.blocks[asNumber(blockId)]
  if (!block || block.id !== blockId) {
    throw new Error(`function '${fn.name}' has missing entry block ${asNumber(blockId)}`)
  }

  return block.opIds.map(opId => {
    const op = module.ops[asNumber(opId)]
    if (!op || op.id !== opId) {
      throw new Error(`function '${fn.name}' has missing operation ${asNumber(opId)} in block ${asNumber(blockId)}`)
    }
    return op
  })
}

export function collectFunctionValues(module: VIRModule, fn: VIRFunction, operations: VIROperation[]): ValueId[] {
  const values = new Map<number, ValueId>()

  for (const paramId of fn.paramValues) {
    const value = module.values[asNumber(paramId)]
    if (!value || value.id !== paramId) {
      throw new Error(`function '${fn.name}' has invalid param value ${asNumber(paramId)}`)
    }
    values.set(asNumber(paramId), paramId)
  }

  for (const op of operations) {
    for (const resultId of op.resultIds) {
      const value = module.values[asNumber(resultId)]
      if (!value || value.id !== resultId) {
        throw new Error(`function '${fn.name}' has invalid result value ${asNumber(resultId)}`)
      }
      values.set(asNumber(resultId), resultId)
    }

    for (const operand of operationOperands(op)) {
      const value = module.values[asNumber(operand)]
      if (!value || value.id !== operand) {
        throw new Error(`function '${fn.name}' has invalid operand value ${asNumber(operand)}`)
      }
      values.set(asNumber(operand), operand)
    }
  }

  return Array.from(values.values())
}

export function analyzeFunctionLiveness(module: VIRModule, fn: VIRFunction): VIRFunctionLiveness {
  const operations = collectFunctionOperations(module, fn)
  if (operations.length === 0) {
    throw new Error(`function '${fn.name}' has no operations`)
  }

  const blockId = asNumber(fn.blocks[0])
  const opPoints: VIRFunctionOpPoint[] = operations.map((op, index) => ({ index, op }))
  const points = new Map<number, VIRValueLivenessPoint>()

  for (const valueId of fn.paramValues) {
    const id = asNumber(valueId)
    if (points.has(id)) continue
    points.set(id, {
      valueId,
      defIndex: -1,
      uses: [],
      firstUse: null,
      lastUse: null,
    })
  }

  for (const { index: opIndex, op } of opPoints) {
    for (const resultId of op.resultIds) {
      const id = asNumber(resultId)
      const existing = points.get(id)
      if (!existing) {
        points.set(id, {
          valueId: resultId,
          defIndex: opIndex,
          uses: [],
          firstUse: null,
          lastUse: null,
        })
        continue
      }

      if (existing.defIndex !== null && existing.defIndex >= 0) {
        throw new Error(`value ${id} is defined multiple times in '${fn.name}'`)
      }

      existing.defIndex = opIndex
    }

    for (const operand of operationOperands(op)) {
      const operandPoint = points.get(asNumber(operand))
      if (!operandPoint) {
        throw new Error(`operation '${op.kind}' in '${fn.name}' uses unknown value ${asNumber(operand)}`)
      }
      operandPoint.uses.push(opIndex)
    }
  }

  const livenessPoints: VIRValueLivenessPoint[] = []

  for (const point of points.values()) {
    point.uses.sort((left, right) => left - right)
    point.firstUse = point.uses.length === 0 ? null : point.uses[0]
    point.lastUse = point.uses.length === 0 ? null : point.uses[point.uses.length - 1]
    livenessPoints.push(point)
  }

  const valuesById = createMapFromPoints(livenessPoints)

  function valuePoint(valueId: ValueId): VIRValueLivenessPoint {
    const point = valuesById.get(asNumber(valueId))
    if (!point) {
      throw new Error(`function '${fn.name}' does not track value ${asNumber(valueId)}`)
    }
    return point
  }

  function firstUse(valueId: ValueId): number | null {
    return valuePoint(valueId).firstUse
  }

  function lastUse(valueId: ValueId): number | null {
    return valuePoint(valueId).lastUse
  }

  function defIndex(valueId: ValueId): number | null {
    return valuePoint(valueId).defIndex
  }

  function nextWriteAfter(opIndex: number, valueId: ValueId): number | null {
    const point = valuePoint(valueId)
    const index = point.defIndex
    if (index === null || index === -1) return null
    return index > opIndex ? index : null
  }

  function nextUseAfter(opIndex: number, valueId: ValueId): number | null {
    return nextAfter(valuePoint(valueId).uses, opIndex)
  }

  function isLiveAfter(opIndex: number, valueId: ValueId): boolean {
    const point = valuePoint(valueId)

    if (point.defIndex !== null && point.defIndex > opIndex) return false
    const end = lastUse(valueId)
    if (end === null) return false
    return end > opIndex
  }

  return {
    functionName: fn.name,
    blockId,
    opPoints,
    valuePoints: livenessPoints,
    opCount: opPoints.length,
    hasValue(valueId: ValueId): boolean {
      return valuesById.has(asNumber(valueId))
    },
    defIndex,
    lastUse,
    firstUse,
    nextUseAfter,
    nextWriteAfter,
    isLiveAfter,
    isDeadAfter(opIndex: number, valueId: ValueId): boolean {
      return !isLiveAfter(opIndex, valueId)
    },
  }
}
