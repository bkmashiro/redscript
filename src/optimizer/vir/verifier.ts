import type { LocId, ValueId } from './ids'
import type {
  Location,
  SourceLoc,
  LocationEntry,
  VIRFunction,
  VIRModule,
  VIRType,
  VIROperation,
  VIRValue,
  VIRValueOpResult,
  VIRValueParam,
} from './types'
import {
  isPureOp,
  isTerminator,
  operationExpectedOperandCount,
  operationExpectedResultCount,
  operationOperands,
  operationResults,
} from './types'

export interface VIRVerifyError {
  kind: 'error'
  message: string
}

type Branded = { readonly __brand: string }

type DefPoint = { blockIndex: number, opIndex: number }

const FORBIDDEN_SLOT_KEYS = new Set([
  'slot',
  'fakeSlot',
  'fake-slot',
  'fake_slot',
  'player',
  'fakePlayer',
  'fake_player',
  'objective',
  'obj',
  'fakeObjective',
  'fake_objective',
  'score',
  'scoreboard',
])

function asNumber(id: Branded): number {
  return Number(id)
}

function error(message: string): VIRVerifyError {
  return { kind: 'error', message }
}

function checkDenseTable<T extends Branded>(items: { id: T }[], label: string): VIRVerifyError[] {
  const seen = new Set<number>()
  const errors: VIRVerifyError[] = []

  for (const item of items) {
    const value = asNumber(item.id)
    if (seen.has(value)) {
      errors.push(error(`${label} table has duplicate id ${value}`))
    }
    seen.add(value)
  }

  for (let index = 0; index < items.length; index += 1) {
    if (!seen.has(index)) {
      errors.push(error(`${label} table has missing id ${index}`))
    }
  }

  return errors
}

function checkSourceLocation(location: Location): VIRVerifyError[] {
  const errors: VIRVerifyError[] = []

  if (location.kind === 'source') {
    if (location.file.length === 0) {
      errors.push(error('source location missing file'))
    }

    if (location.start.line < 1 || location.start.col < 1) {
      errors.push(error('source location start must be 1-based'))
    }

    if (location.end.line < 1 || location.end.col < 1) {
      errors.push(error('source location end must be 1-based'))
    }

    if (location.end.line < location.start.line) {
      errors.push(error(`source location end line ${location.end.line} before start ${location.start.line}`))
    }

    if (location.end.line === location.start.line && location.end.col < location.start.col) {
      errors.push(error('source location end column before start column'))
    }

    return errors
  }

  if (location.kind === 'synthetic') {
    if (location.reason.trim().length === 0) {
      errors.push(error('synthetic location missing reason'))
    }

    return errors
  }

  if (location.kind === 'fused') {
    if (location.locations.length === 0) {
      errors.push(error('fused location has no constituent locations'))
    }

    return errors
  }

  return errors
}

function hasLocId(locId: LocId, module: VIRModule): boolean {
  const entry = module.locs[asNumber(locId)]
  return Boolean(entry && entry.id === locId)
}

function checkLocations(module: VIRModule): VIRVerifyError[] {
  const errors: VIRVerifyError[] = [
    ...checkDenseTable(module.locs, 'location'),
  ]

  for (const entry of module.locs) {
    errors.push(
      ...checkSourceLocation(entry.loc),
      ...checkLocReferences(module, entry),
    )
  }

  return errors
}

function checkLocReferences(module: VIRModule, entry: LocationEntry): VIRVerifyError[] {
  const errors: VIRVerifyError[] = []
  if (entry.loc.kind === 'synthetic' && !hasLocId(entry.loc.parent, module)) {
    errors.push(error(`synthetic location ${asNumber(entry.id)} references missing parent ${asNumber(entry.loc.parent)}`))
  }

  if (entry.loc.kind === 'fused') {
    for (const nested of entry.loc.locations) {
      if (!hasLocId(nested, module)) {
        errors.push(error(`fused location ${asNumber(entry.id)} references missing location ${asNumber(nested)}`))
      }
    }
  }

  return errors
}

function checkTypes(module: VIRModule): VIRVerifyError[] {
  const errors: VIRVerifyError[] = []

  for (const type of module.types) {
    if (type.kind !== 'i32' && type.kind !== 'bool') {
      errors.push(error(`unknown type ${type.id}`))
    }
  }

  return errors
}

function checkValueAttrs(values: VIRValue[]): VIRVerifyError[] {
  const errors: VIRVerifyError[] = []

  for (const value of values) {
    for (const key of Object.keys(value.attrs)) {
      if (FORBIDDEN_SLOT_KEYS.has(key)) {
        errors.push(error(`value ${asNumber(value.id)} has forbidden physical slot attr '${key}'`))
        continue
      }

      if ((key.toLowerCase().includes('slot') || key.toLowerCase().includes('player') || key.toLowerCase().includes('objective'))
        && key.length >= 3) {
        errors.push(error(`value ${asNumber(value.id)} has forbidden location-like attr '${key}'`))
      }
    }
  }

  return errors
}

function indexDefs(module: VIRModule): Map<number, DefPoint> {
  const map = new Map<number, DefPoint>()

  for (const fn of module.functions) {
    for (const paramValueId of fn.paramValues) {
      if (map.has(asNumber(paramValueId))) {
        continue
      }

      map.set(asNumber(paramValueId), { blockIndex: -1, opIndex: -1 })
    }

    for (const blockId of fn.blocks) {
      const blockIndex = fn.blocks.findIndex(item => item === blockId)
      const block = module.blocks[asNumber(blockId)]
      if (!block || block.id !== blockId) {
        continue
      }

      for (let opIndex = 0; opIndex < block.opIds.length; opIndex += 1) {
        const op = module.ops[asNumber(block.opIds[opIndex])]
        if (!op || op.id !== block.opIds[opIndex]) {
          continue
        }

        for (const result of op.resultIds) {
          map.set(asNumber(result), { blockIndex, opIndex })
        }
      }
    }
  }

  return map
}

function checkFunction(module: VIRModule, fn: VIRFunction, defs: Map<number, DefPoint>): VIRVerifyError[] {
  const errors: VIRVerifyError[] = []

  if (fn.name.trim().length === 0) {
    errors.push(error(`function id ${asNumber(fn.id)} has empty name`))
  }

  if (fn.blocks.length === 0) {
    errors.push(error(`function '${fn.name}' has no blocks`))
    return errors
  }

  if (!fn.blocks.includes(fn.entryBlock)) {
    errors.push(error(`function '${fn.name}' entry block ${asNumber(fn.entryBlock)} missing`))
  }

  if (fn.paramValues.length !== fn.signature.params.length) {
    errors.push(error(`function '${fn.name}' param count ${fn.paramValues.length} != signature ${fn.signature.params.length}`))
  }

  if (!hasLocId(fn.loc, module)) {
    errors.push(error(`function '${fn.name}' has missing location id ${asNumber(fn.loc)}`))
  }

  const blockOrder = new Map<number, number>()
  fn.blocks.forEach((blockId, index) => {
    blockOrder.set(asNumber(blockId), index)
  })

  const seenBlockIds = new Set<number>()

  for (let index = 0; index < fn.paramValues.length; index += 1) {
    const valueId = fn.paramValues[index]
    const value = module.values[asNumber(valueId)]
    if (!value || value.id !== valueId) {
      errors.push(error(`function '${fn.name}' param ${index} references missing value ${asNumber(valueId)}`))
      continue
    }

    if (value.kind !== 'param') {
      errors.push(error(`function '${fn.name}' param ${index} is not a parameter value`))
      continue
    }

    if (value.function !== fn.id) {
      errors.push(error(`function '${fn.name}' param ${index} belongs to function ${asNumber(value.function)}`))
    }

    const param = value as VIRValueParam
    if (param.type !== fn.signature.params[index]) {
      errors.push(error(`function '${fn.name}' param ${index} type mismatch`))
    }
  }

  for (const blockId of fn.blocks) {
    const block = module.blocks[asNumber(blockId)]
    if (!block || block.id !== blockId) {
      errors.push(error(`function '${fn.name}' has missing block ${asNumber(blockId)}`))
      continue
    }

    if (block.function !== fn.id) {
      errors.push(error(`block ${asNumber(block.id)} belongs to function ${asNumber(block.function)} not ${asNumber(fn.id)}`))
    }

    if (!hasLocId(block.loc, module)) {
      errors.push(error(`block ${asNumber(block.id)} in '${fn.name}' has missing location ${asNumber(block.loc)}`))
    }

    if (seenBlockIds.has(asNumber(block.id))) {
      errors.push(error(`function '${fn.name}' has duplicate block ${asNumber(block.id)}`))
    }

    seenBlockIds.add(asNumber(block.id))

    if (block.opIds.length === 0) {
      errors.push(error(`block ${asNumber(block.id)} in '${fn.name}' has no operations`))
      continue
    }

    const blockIndex = blockOrder.get(asNumber(block.id))
    if (blockIndex === undefined) {
      continue
    }

    let terminatorCount = 0

    for (let opIndex = 0; opIndex < block.opIds.length; opIndex += 1) {
      const op = module.ops[asNumber(block.opIds[opIndex])]
      if (!op || op.id !== block.opIds[opIndex]) {
        errors.push(error(`block ${asNumber(block.id)} in '${fn.name}' references missing op ${asNumber(block.opIds[opIndex])}`))
        continue
      }

      if (op.block !== block.id) {
        errors.push(error(`op ${asNumber(op.id)} belongs to block ${asNumber(op.block)} but appears in ${asNumber(block.id)}`))
      }

      if (!hasLocId(op.loc, module)) {
        errors.push(error(`op ${asNumber(op.id)} has missing location ${asNumber(op.loc)}`))
      }

      const expectedOperands = operationExpectedOperandCount(op)
      const expectedResults = operationExpectedResultCount(op)
      const operands = operationOperands(op)
      const results = operationResults(op)

      if (expectedOperands !== -1 && operands.length !== expectedOperands) {
        errors.push(error(`op ${asNumber(op.id)} expects ${expectedOperands} operands but has ${operands.length}`))
      }

      if (results.length !== expectedResults) {
        errors.push(error(`op ${asNumber(op.id)} expects ${expectedResults} results but has ${results.length}`))
      }

      if (isTerminator(op)) {
        terminatorCount += 1
        if (opIndex !== block.opIds.length - 1) {
          errors.push(error(`terminator op ${asNumber(op.id)} in block ${asNumber(block.id)} is not last`))
        }

        if (op.operands.length !== fn.signature.results.length) {
          errors.push(error(`return op ${asNumber(op.id)} expects ${fn.signature.results.length} operands but has ${op.operands.length}`))
        }
      }

      for (const operand of operands) {
        const value = module.values[asNumber(operand)]
        if (!value || value.id !== operand) {
          errors.push(error(`op ${asNumber(op.id)} uses missing value ${asNumber(operand)}`))
          continue
        }

        if (value.function !== fn.id) {
          errors.push(error(`op ${asNumber(op.id)} uses value ${asNumber(operand)} from function ${asNumber(value.function)} not ${asNumber(fn.id)}`))
        }

        if (value.kind === 'removed') {
          errors.push(error(`op ${asNumber(op.id)} uses removed value ${asNumber(operand)}`))
        }

        const def = defs.get(asNumber(operand))
        if (!def) {
          errors.push(error(`op ${asNumber(op.id)} uses undefined value ${asNumber(operand)}`))
          continue
        }

        if (def.blockIndex > blockIndex) {
          errors.push(error(`op ${asNumber(op.id)} uses value ${asNumber(operand)} defined in a later block`))
        }

        if (def.blockIndex === blockIndex && def.opIndex >= opIndex) {
          errors.push(error(`op ${asNumber(op.id)} uses value ${asNumber(operand)} before its definition`))
        }
      }

      for (const result of results) {
        const value = module.values[asNumber(result)]
        if (!value || value.id !== result) {
          errors.push(error(`op ${asNumber(op.id)} defines missing value ${asNumber(result)}`))
          continue
        }

        if (value.kind === 'param') {
          errors.push(error(`op ${asNumber(op.id)} defines parameter value ${asNumber(result)} as result`))
          continue
        }

        if (value.kind === 'op') {
          const opValue = value as VIRValueOpResult
          if (opValue.definingOp !== op.id) {
            errors.push(error(`op ${asNumber(op.id)} does not define result ${asNumber(result)}`))
          }

          if (op.kind !== 'cf.return' && opValue.type !== op.type) {
            errors.push(error(`op ${asNumber(op.id)} result ${asNumber(result)} has type ${asNumber(opValue.type)} but op has ${asNumber(op.type)}`))
          }

          if (opValue.function !== fn.id) {
            errors.push(error(`op ${asNumber(op.id)} result ${asNumber(result)} belongs to function ${asNumber(opValue.function)} not ${asNumber(fn.id)}`))
          }
        }
      }

      if (isTerminator(op) && fn.signature.results.length > 0 && op.kind === 'cf.return') {
        for (let index = 0; index < op.operands.length; index += 1) {
          const operand = op.operands[index]
          const expected = fn.signature.results[index]
          const value = module.values[asNumber(operand)]
          if (value && value.kind !== 'removed' && value.type !== expected) {
            errors.push(error(`return op ${asNumber(op.id)} returns value ${asNumber(operand)} with mismatched type`))
          }
        }
      }
    }

    if (terminatorCount !== 1) {
      errors.push(error(`block ${asNumber(block.id)} in '${fn.name}' has ${terminatorCount} terminators`))
    }
  }

  for (const blockId of fn.blocks) {
    const block = module.blocks[asNumber(blockId)]
    if (!block) continue

    for (const opId of block.opIds) {
      const op = module.ops[asNumber(opId)]
      if (!op || op.id !== opId) continue
      if (!isPureOp(op) && !isTerminator(op)) {
        errors.push(error(`op ${asNumber(op.id)} is not pure and not terminator`))
      }
    }
  }

  if (!fn.blocks.some(blockId => {
    const block = module.blocks[asNumber(blockId)]
    return block?.opIds.some(opId => {
      const op = module.ops[asNumber(opId)]
      return Boolean(op && op.id === opId && isTerminator(op))
    })
  })) {
    errors.push(error(`function '${fn.name}' has no return operation`))
  }

  for (const valueId of fn.paramValues) {
    if (!defs.has(asNumber(valueId))) {
      errors.push(error(`param ${asNumber(valueId)} in function '${fn.name}' has no definition`))
    }
  }

  return errors
}

function checkUniqueDefs(module: VIRModule): VIRVerifyError[] {
  const errors: VIRVerifyError[] = []
  const seen = new Set<number>()

  for (const value of module.values) {
    const id = asNumber(value.id)
    if (seen.has(id)) {
      errors.push(error(`value ${id} defined multiple times`))
    }
    seen.add(id)

    if (value.kind === 'op') {
      const op = module.ops[asNumber(value.definingOp)]
      if (!op || op.id !== value.definingOp) {
        errors.push(error(`value ${id} has missing defining op ${asNumber(value.definingOp)}`))
      }
    }
  }

  return errors
}

export function verifyVIR(module: VIRModule): VIRVerifyError[] {
  const errors: VIRVerifyError[] = []

  if (module.namespace.trim().length === 0) {
    errors.push(error('module namespace is empty'))
  }

  if (module.objective.trim().length === 0) {
    errors.push(error('module objective is empty'))
  }

  errors.push(...checkDenseTable(module.types, 'type'))
  errors.push(...checkDenseTable(module.locs, 'location'))
  errors.push(...checkDenseTable(module.values, 'value'))
  errors.push(...checkDenseTable(module.blocks, 'block'))
  errors.push(...checkDenseTable(module.functions, 'function'))
  errors.push(...checkDenseTable(module.ops, 'operation'))

  errors.push(...checkTypes(module))
  errors.push(...checkLocations(module))
  errors.push(...checkValueAttrs(module.values))
  errors.push(...checkUniqueDefs(module))

  const defs = indexDefs(module)

  for (const fn of module.functions) {
    errors.push(...checkFunction(module, fn, defs))
  }

  return errors
}
