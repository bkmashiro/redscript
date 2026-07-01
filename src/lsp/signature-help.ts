import { SignatureHelp, SignatureInformation, ParameterInformation, Position } from 'vscode-languageserver/node'
import type { Program, FnDecl, TypeNode } from '../ast/types'
import type { BuiltinDef } from '../builtins/metadata'

export interface SignatureHelpContext {
  source: string
  program: Program | null
  builtins: Record<string, BuiltinDef>
  offset?: number
  position?: Position
}

function typeToString(t: TypeNode): string {
  switch (t.kind) {
    case 'named': return t.name
    case 'array': return `${typeToString(t.elem)}[]`
    case 'struct': return t.name
    case 'enum': return t.name
    case 'entity': return t.entityType
    case 'selector': return t.entityType ? `selector<${t.entityType}>` : 'selector'
    case 'tuple': return `(${t.elements.map(typeToString).join(', ')})`
    case 'function_type':
      return `(${t.params.map(typeToString).join(', ')}) => ${typeToString(t.return)}`
    default:
      return 'unknown'
  }
}

function locateOffsetFromLineColumn(source: string, position: Position): number {
  const lines = source.split('\n')
  const lineText = lines.slice(0, position.line).join('\n')
  const linePrefix = lineText.length
  return linePrefix + (position.line > 0 ? 1 : 0) + position.character
}

const SIGNATURE_RESOURCE_PARAM_TYPES: Record<string, Record<number, string>> = {
  particle: {
    0: 'resource<particle>',
  },
  effect: {
    1: 'resource<effect>',
  },
  effect_clear: {
    1: 'resource<effect>',
  },
}

const SCOREBOARD_OBJECTIVE_PARAM_INDICES: Record<string, Set<number>> = {
  scoreboard_get: new Set([1]),
  score: new Set([1]),
  scoreboard_set: new Set([1]),
}

function formatFnSignature(fn: FnDecl): string {
  const generic = fn.typeParams?.length ? `<${fn.typeParams.join(', ')}>` : ''
  const params = fn.params
    .map(p => `${p.name}: ${typeToString(p.type)}`)
    .join(', ')
  const prefix = fn.isDeclareOnly ? `declare fn ${fn.name}${generic}` : `fn ${fn.name}${generic}`
  return `${prefix}(${params}): ${typeToString(fn.returnType)}`
}

function builtinParamTypeLabel(fnName: string, index: number, paramName: string, rawType: string): string {
  const resourceType = SIGNATURE_RESOURCE_PARAM_TYPES[fnName]?.[index]
  if (resourceType) return resourceType

  if (SCOREBOARD_OBJECTIVE_PARAM_INDICES[fnName]?.has(index) || paramName === 'objective') {
    return '#objective'
  }

  return rawType
}

function formatBuiltinSignature(fn: BuiltinDef): string {
  const params = (fn.params ?? []).map((p, idx) => `${p.name}: ${builtinParamTypeLabel(fn.name, idx, p.name, p.type)}`)
  return `${fn.name}(${params.join(', ')}): ${fn.returns ?? 'void'}`
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

function findActiveCallOpenParen(text: string, cursor: number): number {
  let inString = false
  let escaped = false
  let inLineComment = false
  const stack: number[] = []

  for (let i = 0; i < cursor; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }

    if (escaped) {
      escaped = false
      continue
    }

    if (inString) {
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '(') {
      stack.push(i)
      continue
    }

    if (ch === ')') {
      stack.pop()
    }
  }

  return stack[stack.length - 1] ?? -1
}

function scanActiveParameter(text: string, openParen: number, cursor: number): number {
  let inString = false
  let escaped = false
  let inLineComment = false
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0
  let argIndex = 0

  for (let i = openParen + 1; i < cursor; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }

    if (inString) {
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '(') {
      parenDepth++
      continue
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1)
      continue
    }
    if (ch === '[') {
      bracketDepth++
      continue
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      continue
    }
    if (ch === '{') {
      braceDepth++
      continue
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      continue
    }

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      argIndex++
    }
  }

  return argIndex
}

function extractFunctionName(text: string, openParen: number): string | null {
  let nameEnd = openParen - 1

  while (nameEnd >= 0 && /\s/.test(text[nameEnd])) {
    nameEnd--
  }

  if (nameEnd < 0 || !isWordChar(text[nameEnd])) return null

  let nameStart = nameEnd
  while (nameStart > 0 && isWordChar(text[nameStart - 1])) {
    nameStart--
  }

  const fnName = text.slice(nameStart, nameEnd + 1)
  if (!fnName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(fnName)) return null

  return fnName
}

function resolveUserFunction(program: Program | null, name: string): FnDecl | null {
  if (!program) return null

  const fn = program.declarations.find(item => item.name === name)
  if (fn) return fn

  return (program.declaredFunctions ?? []).find(item => item.name === name) ?? null
}

function safeActiveParameter(active: number, paramsCount: number): number {
  if (paramsCount === 0) return 0
  if (active < 0) return 0
  if (active >= paramsCount) return paramsCount - 1
  return active
}

function buildSignatureHelp(label: string, params: string[], activeParameter: number): SignatureHelp {
  const safeActive = safeActiveParameter(activeParameter, params.length)
  return {
    signatures: [
      {
        label,
        parameters: params.map(p => ({ label: p }) as ParameterInformation),
        activeParameter: safeActive,
      } as SignatureInformation,
    ],
    activeSignature: 0,
    activeParameter: safeActive,
  }
}

function getOffset(context: SignatureHelpContext): number | null {
  if (typeof context.offset === 'number') return context.offset
  if (!context.position) return null
  return locateOffsetFromLineColumn(context.source, context.position)
}

export function getSignatureHelp(context: SignatureHelpContext): SignatureHelp | null {
  const offset = getOffset(context)
  if (!context.program || typeof offset !== 'number') return null

  const text = context.source
  const openParen = findActiveCallOpenParen(text, offset)
  if (openParen < 0) return null

  const fnName = extractFunctionName(text, openParen)
  if (!fnName) return null

  const activeParameter = scanActiveParameter(text, openParen, offset)

  const userFn = resolveUserFunction(context.program, fnName)
  if (userFn) {
    const params = userFn.params.map(p => `${p.name}: ${typeToString(p.type)}`)
    return buildSignatureHelp(formatFnSignature(userFn), params, activeParameter)
  }

  const builtin = context.builtins[fnName]
  if (!builtin) return null

  const params = (builtin.params ?? []).map((p, idx) => `${p.name}: ${builtinParamTypeLabel(fnName, idx, p.name, p.type)}`)
  const label = formatBuiltinSignature(builtin)

  return buildSignatureHelp(label, params, activeParameter)
}

export type { SignatureHelp as SignatureHelpResult } from 'vscode-languageserver/node'
