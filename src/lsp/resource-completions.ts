import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node'
import {
  BUILTIN_RESOURCE_REGISTRY,
  RESOURCE_CATEGORY_NAME,
  type BuiltinResourceCategory,
  type ResourceCatalogExtension,
} from '../resources/catalog'
export { BUILTIN_RESOURCE_REGISTRY } from '../resources/catalog'
export type { ResourceCatalogExtension } from '../resources/catalog'

type BuiltinName = 'particle' | 'effect' | 'effect_clear' | 'give' | 'clear' | 'playsound' | 'setblock' | 'fill' | 'summon'

export interface ResourceDiagnosticHint {
  line: number
  startCol: number
  endCol: number
  category: BuiltinResourceCategory
  value: string
  message: string
}

const STRING_COMPLETION_CONTEXTS: Record<BuiltinName, { category: BuiltinResourceCategory; argIndex: number }> = {
  particle: { category: 'particles', argIndex: 0 },
  effect: { category: 'effects', argIndex: 1 },
  effect_clear: { category: 'effects', argIndex: 1 },
  give: { category: 'items', argIndex: 1 },
  clear: { category: 'items', argIndex: 1 },
  playsound: { category: 'sounds', argIndex: 0 },
  setblock: { category: 'blocks', argIndex: 1 },
  fill: { category: 'blocks', argIndex: 2 },
  summon: { category: 'entities', argIndex: 0 },
}

const RESOURCE_CATEGORY_META: Record<
  BuiltinResourceCategory,
  { detail: string; documentation: string }
> = {
  particles: {
    detail: 'Minecraft particle',
    documentation: 'Particle ID (namespaced): e.g. minecraft:flame',
  },
  effects: {
    detail: 'Minecraft effect',
    documentation: 'Effect ID (namespaced): e.g. minecraft:speed',
  },
  entities: {
    detail: 'Minecraft entity',
    documentation: 'Entity type ID (namespaced): e.g. minecraft:zombie',
  },
  items: {
    detail: 'Minecraft item',
    documentation: 'Item ID (namespaced): e.g. minecraft:diamond',
  },
  sounds: {
    detail: 'Minecraft sound',
    documentation: 'Sound event ID (namespaced): e.g. minecraft:entity.experience_orb.pickup',
  },
  blocks: {
    detail: 'Minecraft block',
    documentation: 'Block ID (namespaced): e.g. minecraft:stone',
  },
}

function isInsideString(line: string, cursor: number): boolean {
  let inString = false
  let escaped = false

  for (let i = 0; i < cursor; i++) {
    const ch = line[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\') {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
    }
  }

  return inString
}

function isSelectorTypeContext(lineText: string, cursor: number): boolean {
  if (isInsideString(lineText, cursor)) return false

  const before = lineText.slice(0, cursor)
  const selectorStart = before.lastIndexOf('@e[')
  if (selectorStart < 0) return false

  const selectorText = before.slice(selectorStart + '@e['.length)
  if (selectorText.includes(']')) return false

  return /(?:^|,)\s*type\s*=\s*[^,\]]*$/.test(selectorText)
}

function argumentIndex(argText: string): number {
  let depth = 0
  let inString = false
  let escaped = false
  let commas = 0

  for (const ch of argText) {
    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\') {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '(') depth++
    else if (ch === ')' && depth > 0) depth--
    else if (ch === ',' && depth === 0) commas++
  }

  return commas
}

function findCallOpenParen(beforeCursor: string, cursor: number): number {
  let depth = 0
  let inString = true
  let escaped = false

  for (let i = cursor - 1; i >= 0; i--) {
    const ch = beforeCursor[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (inString) {
      if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '(') {
      if (depth === 0) return i
      depth--
      continue
    }

    if (ch === ')') {
      depth++
      continue
    }
  }

  return -1
}

function resourcesForCategory(
  category: BuiltinResourceCategory,
  extension: ResourceCatalogExtension = {},
): string[] {
  return Array.from(new Set([
    ...BUILTIN_RESOURCE_REGISTRY[category],
    ...(extension[category] ?? []),
  ]))
}

function resourceItemsForCategory(
  category: BuiltinResourceCategory,
  extension: ResourceCatalogExtension = {},
): CompletionItem[] {
  const info = RESOURCE_CATEGORY_META[category]
  return resourcesForCategory(category, extension).map(resource => ({
    label: resource,
    kind: CompletionItemKind.Value,
    detail: info.detail,
    documentation: info.documentation,
  }))
}

/**
 * Returns resource completions for existing string-argument builtin call sites.
 */
export function getResourceCompletionsForStringContext(
  lineText: string,
  cursor: number,
  extension: ResourceCatalogExtension = {},
): CompletionItem[] {
  if (!isInsideString(lineText, cursor)) return []

  const before = lineText.slice(0, cursor)
  const openParen = findCallOpenParen(before, cursor)
  if (openParen < 0) return []

  const prefix = before.slice(0, openParen)
  const fnMatch = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(prefix)
  if (!fnMatch) return []

  const fnName = fnMatch[1]
  const context = STRING_COMPLETION_CONTEXTS[fnName as BuiltinName]
  if (!context) return []

  const argText = before.slice(openParen + 1)
  const argIdx = argumentIndex(argText)

  if (argIdx !== context.argIndex) return []

  return resourceItemsForCategory(context.category, extension)
}

/**
 * Returns entity resource completions for selector type filters such as @e[type=...].
 */
export function getResourceCompletionsForSelectorContext(
  lineText: string,
  cursor: number,
  extension: ResourceCatalogExtension = {},
): CompletionItem[] {
  if (!isSelectorTypeContext(lineText, cursor)) return []
  return resourceItemsForCategory('entities', extension)
}

export function getResourceCompletions(
  lineText: string,
  cursor: number,
  extension: ResourceCatalogExtension = {},
): CompletionItem[] {
  return [
    ...getResourceCompletionsForStringContext(lineText, cursor, extension),
    ...getResourceCompletionsForSelectorContext(lineText, cursor, extension),
  ]
}

function diagnosticFor(
  line: number,
  startCol: number,
  endCol: number,
  category: BuiltinResourceCategory,
  value: string,
): ResourceDiagnosticHint | null {
  if (!value || !value.includes(':')) return null
  if ((BUILTIN_RESOURCE_REGISTRY[category] as readonly string[]).includes(value)) return null

  const kind = RESOURCE_CATEGORY_NAME[category]
  return {
    line,
    startCol,
    endCol,
    category,
    value,
    message: `Unknown Minecraft ${kind} resource '${value}' in built-in catalog; this is advisory only and may be provided by a datapack, mod, or newer Minecraft version.`,
  }
}

function collectStringResourceHints(lineText: string, line: number): ResourceDiagnosticHint[] {
  const hints: ResourceDiagnosticHint[] = []
  const stringRe = /"([^"\\]*(?:\\.[^"\\]*)*)"/g
  let match: RegExpExecArray | null

  while ((match = stringRe.exec(lineText)) !== null) {
    const literalStart = match.index + 1
    const literalEnd = literalStart + match[1].length
    const completions = getResourceCompletionsForStringContext(lineText, literalStart)
    if (completions.length === 0) continue

    const category = (Object.keys(BUILTIN_RESOURCE_REGISTRY) as BuiltinResourceCategory[])
      .find(candidate => completions.some(item =>
        (BUILTIN_RESOURCE_REGISTRY[candidate] as readonly string[]).includes(item.label as string),
      ))
    if (!category) continue

    const hint = diagnosticFor(line, literalStart, literalEnd, category, match[1])
    if (hint) hints.push(hint)
  }

  return hints
}

function collectSelectorResourceHints(lineText: string, line: number): ResourceDiagnosticHint[] {
  const hints: ResourceDiagnosticHint[] = []
  const selectorRe = /@e\[[^\]]*\btype\s*=\s*([^,\]\s]+)[^\]]*\]/g
  let match: RegExpExecArray | null

  while ((match = selectorRe.exec(lineText)) !== null) {
    const value = match[1]
    const startCol = match.index + match[0].indexOf(value)
    const hint = diagnosticFor(line, startCol, startCol + value.length, 'entities', value)
    if (hint) hints.push(hint)
  }

  return hints
}

/**
 * Returns advisory LSP diagnostics for resource-looking strings that are not in
 * the built-in catalog. These are hints, not compiler errors: datapacks, mods,
 * plugins, or newer Minecraft versions may legitimately provide extra IDs.
 */
export function getResourceDiagnosticHints(source: string): ResourceDiagnosticHint[] {
  const hints: ResourceDiagnosticHint[] = []
  const lines = source.split('\n')

  lines.forEach((lineText, index) => {
    hints.push(...collectStringResourceHints(lineText, index))
    hints.push(...collectSelectorResourceHints(lineText, index))
  })

  return hints
}
