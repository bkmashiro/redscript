import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node'

export const BUILTIN_RESOURCE_REGISTRY = {
  particles: ['minecraft:flame', 'minecraft:smoke', 'minecraft:dust'],
  effects: ['minecraft:speed', 'minecraft:strength', 'minecraft:regeneration', 'minecraft:slowness'],
  entities: ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper', 'minecraft:item'],
  items: ['minecraft:diamond', 'minecraft:apple', 'minecraft:stone', 'minecraft:stick'],
} as const

type BuiltinName = 'particle' | 'effect' | 'effect_clear' | 'give' | 'clear'

const STRING_COMPLETION_CONTEXTS: Record<BuiltinName, keyof typeof BUILTIN_RESOURCE_REGISTRY> = {
  particle: 'particles',
  effect: 'effects',
  effect_clear: 'effects',
  give: 'items',
  clear: 'items',
}

const STRING_ARG_INDEX: Record<BuiltinName, number> = {
  particle: 0,
  effect: 1,
  effect_clear: 1,
  give: 1,
  clear: 1,
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

function resourceItemsForCategory(category: keyof typeof BUILTIN_RESOURCE_REGISTRY): CompletionItem[] {
  return BUILTIN_RESOURCE_REGISTRY[category].map(resource => ({
    label: resource,
    kind: CompletionItemKind.Value,
    detail: 'minecraft resource',
  }))
}

/**
 * Returns resource completions for existing string-argument builtin call sites.
 */
export function getResourceCompletionsForStringContext(
  lineText: string,
  cursor: number,
): CompletionItem[] {
  if (!isInsideString(lineText, cursor)) return []

  const before = lineText.slice(0, cursor)
  const openParen = before.lastIndexOf('(')
  if (openParen < 0) return []

  const prefix = before.slice(0, openParen)
  const fnMatch = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(prefix)
  if (!fnMatch) return []

  const fnName = fnMatch[1] as BuiltinName
  const catalog = STRING_COMPLETION_CONTEXTS[fnName]
  if (!catalog) return []

  const argText = before.slice(openParen + 1)
  const argIdx = argumentIndex(argText)

  if (argIdx !== STRING_ARG_INDEX[fnName]) return []

  return resourceItemsForCategory(catalog)
}

/**
 * Returns entity resource completions for selector type filters such as @e[type=...].
 */
export function getResourceCompletionsForSelectorContext(
  lineText: string,
  cursor: number,
): CompletionItem[] {
  if (!isSelectorTypeContext(lineText, cursor)) return []
  return resourceItemsForCategory('entities')
}

export function getResourceCompletions(
  lineText: string,
  cursor: number,
): CompletionItem[] {
  return [
    ...getResourceCompletionsForStringContext(lineText, cursor),
    ...getResourceCompletionsForSelectorContext(lineText, cursor),
  ]
}
