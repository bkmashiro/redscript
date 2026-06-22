import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node'

export const BUILTIN_RESOURCE_REGISTRY = {
  particles: ['minecraft:flame', 'minecraft:smoke', 'minecraft:dust'],
  effects: ['minecraft:speed', 'minecraft:strength', 'minecraft:regeneration', 'minecraft:slowness'],
  entities: ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper', 'minecraft:item'],
  items: ['minecraft:diamond', 'minecraft:apple', 'minecraft:stone', 'minecraft:stick'],
  sounds: ['minecraft:entity.experience_orb.pickup', 'minecraft:ui.toast.challenge_complete'],
  blocks: ['minecraft:stone', 'minecraft:air', 'minecraft:grass_block', 'minecraft:bedrock'],
} as const

type BuiltinName = 'particle' | 'effect' | 'effect_clear' | 'give' | 'clear' | 'playsound' | 'setblock' | 'fill' | 'summon'
type BuiltinResourceCategory = keyof typeof BUILTIN_RESOURCE_REGISTRY

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

function resourceItemsForCategory(category: BuiltinResourceCategory): CompletionItem[] {
  const info = RESOURCE_CATEGORY_META[category]
  return BUILTIN_RESOURCE_REGISTRY[category].map(resource => ({
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

  return resourceItemsForCategory(context.category)
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
