import { builtinCategoriesForResourceId, type BuiltinResourceCategory } from '../../../src/resources/catalog'

export interface MigrationQuickFix {
  startColumn: number
  endColumn: number
  replacement: string
  title: string
  preferred?: boolean
}

interface ParsedArg {
  index: number
  start: number
  end: number
}

interface ParsedCall {
  name: string
  args: ParsedArg[]
}

interface ResourceArgSpec {
  argIndex: number
  category: BuiltinResourceCategory
}

const SCOREBOARD_OBJECTIVE_ARGS: Record<string, Set<number>> = {
  scoreboard_get: new Set([1]),
  score: new Set([1]),
  scoreboard_set: new Set([1]),
  scoreboard_display: new Set([1]),
}

const RESOURCE_ARG_INDEX: Record<string, ResourceArgSpec[]> = {
  particle: [{ argIndex: 0, category: 'particles' }],
  effect: [{ argIndex: 1, category: 'effects' }],
  effect_clear: [{ argIndex: 1, category: 'effects' }],
  give: [{ argIndex: 1, category: 'items' }],
  clear: [{ argIndex: 1, category: 'items' }],
  playsound: [{ argIndex: 0, category: 'sounds' }],
  setblock: [{ argIndex: 1, category: 'blocks' }],
  fill: [{ argIndex: 2, category: 'blocks' }],
  summon: [{ argIndex: 0, category: 'entities' }],
}

/**
 * Parse a single line of RedScript source and return migration quick-fix candidates.
 */
export function getMigrationQuickFixesFromLine(lineText: string): MigrationQuickFix[] {
  const fixes: MigrationQuickFix[] = []

  // Existing type migration quick-fix behavior: unnamespaced `type=...`
  const lineTypeRe = /\btype=([a-z][a-z0-9_]*)(?!\s*[:a-z0-9_])/g
  let lm: RegExpExecArray | null
  while ((lm = lineTypeRe.exec(lineText)) !== null) {
    const typeName = lm[1]
    const typeStart = lm.index + 'type='.length
    const typeEnd = typeStart + typeName.length
    fixes.push({
      startColumn: typeStart,
      endColumn: typeEnd,
      replacement: `minecraft:${typeName}`,
      title: `Add namespace: type=minecraft:${typeName}`,
      preferred: true,
    })
  }

  const calls = parseBuiltinCalls(lineText)
  for (const call of calls) {
    collectObjectiveFixes(call, lineText, fixes)
    collectResourceFixes(call, lineText, fixes)
  }
  collectDeprecatedFloatFixes(lineText, fixes)
  collectLegacyInterpolationFixes(lineText, fixes)

  return dedupeQuickFixes(fixes)
}

function collectObjectiveFixes(call: ParsedCall, lineText: string, out: MigrationQuickFix[]): void {
  const objectiveIndexes = SCOREBOARD_OBJECTIVE_ARGS[call.name]
  if (!objectiveIndexes) return

  for (const arg of call.args) {
    if (!objectiveIndexes.has(arg.index)) continue
    const lit = parseQuotedString(lineText, arg)
    if (!lit) continue

    const value = lit.value
    if (!value || value.startsWith('#')) continue
    if (!/^[a-zA-Z0-9_.:-]+$/.test(value)) continue

    out.push({
      startColumn: lit.start,
      endColumn: lit.end,
      replacement: `#${value}`,
      title: `Convert objective string to #objective: #${value}`,
    })
  }
}

function collectResourceFixes(call: ParsedCall, lineText: string, out: MigrationQuickFix[]): void {
  const resourceSpecs = RESOURCE_ARG_INDEX[call.name]
  if (!resourceSpecs) return

  for (const spec of resourceSpecs) {
    const arg = call.args.find(item => item.index === spec.argIndex)
    if (!arg) continue
    const lit = parseQuotedString(lineText, arg)
    if (!lit) continue

    const value = lit.value
    if (!looksLikeMinecraftResourceId(value)) continue
    if (!isKnownResourceInCategory(value, spec.category)) continue

    out.push({
      startColumn: lit.start,
      endColumn: lit.end,
      replacement: value,
      title: `Unquote resource: ${value}`,
    })
  }
}

function collectDeprecatedFloatFixes(lineText: string, out: MigrationQuickFix[]): void {
  for (const span of codeSpansOutsideStrings(lineText)) {
    const text = span.text
    const re = /(^|[:>]|\bas\s+)\s*(float)\b/g
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const prefix = match[1]
      const floatStart = span.start + match.index + match[0].lastIndexOf('float')
      if (!isTypeContextForFloat(prefix)) continue
      out.push({
        startColumn: floatStart,
        endColumn: floatStart + 'float'.length,
        replacement: 'fixed',
        title: `Replace deprecated float type with fixed`,
      })
    }
  }
}

function collectLegacyInterpolationFixes(lineText: string, out: MigrationQuickFix[]): void {
  for (const lit of quotedStringLiterals(lineText)) {
    if (lit.quoteStart > 0 && isIdentChar(lineText[lit.quoteStart - 1])) continue
    if (!/\$\{[A-Za-z_][A-Za-z0-9_.]*(?:\s*[+\-*/]\s*[A-Za-z0-9_.]+)*\}/.test(lit.rawValue)) continue

    const migrated = lit.rawValue.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_.]*(?:\s*[+\-*/]\s*[A-Za-z0-9_.]+)*)\}/g,
      '{$1}'
    )
    if (migrated === lit.rawValue) continue

    out.push({
      startColumn: lit.quoteStart,
      endColumn: lit.quoteEnd,
      replacement: `f"${migrated}"`,
      title: 'Convert legacy ${...} interpolation to f-string',
    })
  }
}

function isTypeContextForFloat(prefix: string): boolean {
  return prefix.includes(':') || prefix.includes('>') || /\bas\s+$/.test(prefix)
}

function codeSpansOutsideStrings(lineText: string): Array<{ start: number; text: string }> {
  const spans: Array<{ start: number; text: string }> = []
  let start = 0
  let i = 0
  while (i < lineText.length) {
    const ch = lineText[i]
    if (ch === '/' && lineText[i + 1] === '/') break
    if (ch !== '"') {
      i += 1
      continue
    }
    if (start < i) spans.push({ start, text: lineText.slice(start, i) })
    i = skipString(lineText, i)
    start = i
  }
  if (start < lineText.length) spans.push({ start, text: lineText.slice(start) })
  return spans
}

function quotedStringLiterals(lineText: string): Array<{ quoteStart: number; quoteEnd: number; rawValue: string }> {
  const literals: Array<{ quoteStart: number; quoteEnd: number; rawValue: string }> = []
  let i = 0
  while (i < lineText.length) {
    const ch = lineText[i]
    if (ch === '/' && lineText[i + 1] === '/') break
    if (ch !== '"') {
      i += 1
      continue
    }
    const end = skipString(lineText, i)
    if (end <= i + 1 || lineText[end - 1] !== '"') {
      i = end
      continue
    }
    literals.push({ quoteStart: i, quoteEnd: end, rawValue: lineText.slice(i + 1, end - 1) })
    i = end
  }
  return literals
}

function parseQuotedString(lineText: string, arg: ParsedArg): { start: number; end: number; value: string } | null {
  const raw = lineText.slice(arg.start, arg.end).trim()
  const m = /^"([^"\\]*(?:\\.[^"\\]*)*)"$/.exec(raw)
  if (!m) return null
  const value = m[1]
  if (!value) return null

  const start = arg.start + raw.indexOf('"')
  const end = start + m[0].length
  return { start, end, value }
}

function parseBuiltinCalls(lineText: string): ParsedCall[] {
  const calls: ParsedCall[] = []
  let i = 0

  while (i < lineText.length) {
    const ch = lineText[i]

    if (ch === '"') {
      i = skipString(lineText, i)
      continue
    }

    if (ch === '/' && lineText[i + 1] === '/') {
      break
    }

    if (!isIdentStart(ch) || (i > 0 && isIdentChar(lineText[i - 1]))) {
      i += 1
      continue
    }

    let end = i + 1
    while (end < lineText.length && isIdentChar(lineText[end])) end += 1

    const name = lineText.slice(i, end)
    if (!SCOREBOARD_OBJECTIVE_ARGS[name] && !RESOURCE_ARG_INDEX[name]) {
      i = end
      continue
    }

    let j = end
    while (j < lineText.length && isWhitespace(lineText[j])) j += 1
    if (lineText[j] !== '(') {
      i = end
      continue
    }

    const result = parseCallArgs(lineText, j)
    if (!result) {
      i = end
      continue
    }

    calls.push({ name, args: result.args })
    i = result.end + 1
  }

  return calls
}

function parseCallArgs(lineText: string, openParen: number): { args: ParsedArg[]; end: number } | null {
  const args: ParsedArg[] = []
  let i = openParen + 1
  let argIndex = 0
  let argStart = i

  let inString = false
  let escaped = false
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0

  while (i < lineText.length) {
    const ch = lineText[i]
    const next = lineText[i + 1]

    if (ch === '/' && next === '/') {
      break
    }

    if (inString) {
      if (escaped) {
        escaped = false
        i += 1
        continue
      }
      if (ch === '\\') {
        escaped = true
        i += 1
        continue
      }
      if (ch === '"') {
        inString = false
      }
      i += 1
      continue
    }

    if (ch === '"') {
      inString = true
      i += 1
      continue
    }

    if (ch === '(') {
      parenDepth += 1
      i += 1
      continue
    }

    if (ch === ')') {
      if (parenDepth === 0) {
        args.push({ index: argIndex, start: argStart, end: i })
        return { args, end: i }
      }
      parenDepth -= 1
      i += 1
      continue
    }

    if (ch === '[') {
      bracketDepth += 1
      i += 1
      continue
    }

    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      i += 1
      continue
    }

    if (ch === '{') {
      braceDepth += 1
      i += 1
      continue
    }

    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      i += 1
      continue
    }

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      args.push({ index: argIndex, start: argStart, end: i })
      argIndex += 1
      argStart = i + 1
      i += 1
      continue
    }

    i += 1
  }

  return null
}

function skipString(lineText: string, start: number): number {
  let i = start + 1
  let escaped = false

  while (i < lineText.length) {
    const ch = lineText[i]

    if (escaped) {
      escaped = false
      i += 1
      continue
    }

    if (ch === '\\') {
      escaped = true
      i += 1
      continue
    }

    if (ch === '"') {
      return i + 1
    }

    i += 1
  }

  return i
}

function dedupeQuickFixes(fixes: MigrationQuickFix[]): MigrationQuickFix[] {
  const seen = new Set<string>()
  const out: MigrationQuickFix[] = []

  for (const fix of fixes) {
    const key = `${fix.startColumn}|${fix.endColumn}|${fix.replacement}|${fix.title}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(fix)
  }

  return out
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch)
}

function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t'
}

function looksLikeMinecraftResourceId(value: string): boolean {
  return value.startsWith('minecraft:')
}

function isKnownResourceInCategory(value: string, category: BuiltinResourceCategory): boolean {
  return builtinCategoriesForResourceId(value).includes(category)
}

