import type { VIRFunction, VIRModule, VIRValue, VIROperation } from './types'

export interface VIRPrinterOptions {
  showRemovedValues?: boolean
}

function asNumber(id: { readonly __brand: string }): number {
  return Number(id)
}

function sortById<T extends { id: { readonly __brand: string } }>(items: T[]): T[] {
  return [...items].sort((left, right) => asNumber(left.id) - asNumber(right.id))
}

function printLocation(entries: VIRModule['locs'], locId: number): string {
  const entry = entries[locId]
  if (!entry) return `loc#${locId}`

  const loc = entry.loc
  if (loc.kind === 'unknown') return `loc#${locId}`
  if (loc.kind === 'source') {
    return `${loc.file}:${loc.start.line}:${loc.start.col}-${loc.end.line}:${loc.end.col}`
  }

  if (loc.kind === 'synthetic') {
    return `synthetic(${loc.reason}) -> ${printLocation(entries, asNumber(loc.parent))}`
  }

  return `fused${loc.pass ? `[${loc.pass}]` : ''}(${loc.locations.join(',')})`
}

function formatType(typeId: { readonly __brand: string }): string {
  return `t${asNumber(typeId)}`
}

function formatValue(value: VIRValue): string {
  if (value.kind === 'param') {
    return `%${asNumber(value.id)}:param ${value.name} : ${formatType(value.type)}`
  }

  if (value.kind === 'op') {
    return `%${asNumber(value.id)}:op = %${asNumber(value.definingOp)} : ${formatType(value.type)}`
  }

  return `%${asNumber(value.id)}:removed:${value.removedBy} : ${formatType(value.type)}${value.reason ? ` (${value.reason})` : ''}`
}

function formatOperation(operation: VIROperation): string {
  if (operation.kind === 'arith.constant') {
    return `%${asNumber(operation.resultIds[0])} = arith.constant ${operation.value} : ${formatType(operation.type)}`
  }

  if (operation.kind === 'arith.identity') {
    return `%${asNumber(operation.resultIds[0])} = arith.identity %${asNumber(operation.operands[0])} : ${formatType(operation.type)}`
  }

  if (operation.kind === 'cf.return') {
    if (operation.operands.length === 0) return 'cf.return'
    return `cf.return ${operation.operands.map(value => `%${asNumber(value)}`).join(', ')}`
  }

  return `%${asNumber(operation.resultIds[0])} = ${operation.kind} ${asNumber(operation.operands[0])} ${asNumber(operation.operands[1])} : ${formatType(operation.type)}`
}

function printBlock(module: VIRModule, blockId: { readonly __brand: string }): string[] {
  const block = module.blocks[asNumber(blockId)]
  if (!block || block.id !== blockId) {
    return [`  block #${asNumber(blockId)} <missing>`]
  }

  const lines = [`  block #${asNumber(block.id)} ${block.name} // ${printLocation(module.locs, asNumber(block.loc))}`]

  for (const opId of block.opIds) {
    const op = module.ops[asNumber(opId)]
    if (!op || op.id !== opId) {
      lines.push(`    op #${asNumber(opId)} <missing>`)
      continue
    }

    lines.push(`    ${formatOperation(op)} // ${printLocation(module.locs, asNumber(op.loc))}`)
  }

  return lines
}

function printFunction(module: VIRModule, fn: VIRFunction): string[] {
  const params = fn.signature.params.map((typeId, index) => `%${index}:t${asNumber(typeId)}`).join(', ')
  const results = fn.signature.results.map(typeId => `t${asNumber(typeId)}`).join(', ')
  const lines = [
    `fn #${asNumber(fn.id)} @${fn.name} (${params}) -> (${results}) // ${printLocation(module.locs, asNumber(fn.loc))}`,
  ]

  const orderedBlocks = [...fn.blocks].sort((left, right) => asNumber(left) - asNumber(right))
  for (const blockId of orderedBlocks) {
    lines.push(...printBlock(module, blockId))
  }

  return lines
}

export function printVIRModule(module: VIRModule, options: VIRPrinterOptions = {}): string {
  const lines: string[] = []

  lines.push(`module @${module.namespace} objective ${module.objective}`)

  lines.push('types:')
  if (module.types.length === 0) {
    lines.push('  <none>')
  } else {
    for (const type of sortById(module.types)) {
      lines.push(`  t${asNumber(type.id)} = ${type.kind}`)
    }
  }

  lines.push('locations:')
  if (module.locs.length === 0) {
    lines.push('  <none>')
  } else {
    for (const entry of sortById(module.locs)) {
      lines.push(`  loc #${asNumber(entry.id)} = ${printLocation(module.locs, asNumber(entry.id))}`)
    }
  }

  lines.push('functions:')
  if (module.functions.length === 0) {
    lines.push('  <none>')
  } else {
    for (const fn of sortById(module.functions)) {
      lines.push(...printFunction(module, fn))
    }
  }

  if (options.showRemovedValues) {
    lines.push('values:')
    for (const value of sortById(module.values)) {
      lines.push(`  ${formatValue(value)}`)
    }
  }

  return lines.join('\n')
}
