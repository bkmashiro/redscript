import { isInsideStringOrLineComment } from './objective-hover'
import { BUILTIN_RESOURCE_REGISTRY, RESOURCE_CATEGORY_NAME } from '../resources/catalog'
import type { ResourceHoverInfo } from './resource-completions'

export interface SelectorTokenHoverInfo {
  token: string
  markdown: string
}

const SELECTOR_DOCS: Record<string, string> = {
  '@a': 'all online players',
  '@p': 'nearest player to the command source',
  '@s': 'the entity currently executing the command (self)',
  '@e': 'all entities; use `type=...` and other filters inside brackets',
  '@r': 'random online player',
  '@n': 'nearest entity of any type',
}

const SELECTOR_DISCLAIMER =
  'Static/editor selector semantics: these are RedScript/Minecraft selector meanings for authoring, not live runtime/permission validation.'

export function getSelectorTokenHover(lineText: string, cursor: number): SelectorTokenHoverInfo | null {
  if (isInsideStringOrLineComment(lineText, cursor)) return null

  const selectorRe = /@([a-zA-Z]+)/g
  let match: RegExpExecArray | null
  while ((match = selectorRe.exec(lineText)) !== null) {
    const sel = match[0]
    const start = match.index
    const end = start + sel.length
    if (cursor < start || cursor > end) continue

    const description = SELECTOR_DOCS[sel]
    if (!description) continue

    return {
      token: sel,
      markdown: `**${sel}** — ${description}\n\n${SELECTOR_DISCLAIMER}`,
    }
  }

  return null
}

interface SelectorTypeContext {
  selectorStart: number
  valueStart: number
  selectorEnd: number
}

function selectorTypeContext(lineText: string, cursor: number): SelectorTypeContext | null {
  if (isInsideStringOrLineComment(lineText, cursor)) return null

  const selectorStart = lineText.lastIndexOf('@e[')
  if (selectorStart < 0 || selectorStart > cursor) return null

  const afterOpen = lineText.slice(selectorStart + 3, cursor)
  if (afterOpen.includes(']')) return null

  const closeAt = lineText.indexOf(']', selectorStart)
  const selectorEnd = closeAt < 0 ? Number.MAX_SAFE_INTEGER : closeAt

  const tail = lineText.slice(selectorStart + 3, selectorEnd)
  const typeMatch = /(?:^|[,\s])type\s*=\s*[^,\]]*$/.exec(tail)
  if (!typeMatch) return null

  const raw = typeMatch[0]
  const valueTextStart = selectorStart + 3 + raw.lastIndexOf('=') + 1

  const valueStart = Math.min(
    valueTextStart + raw.slice(raw.lastIndexOf('=') + 1).search(/\S/),
    selectorEnd,
  )

  if (!Number.isFinite(valueStart) || valueStart < 0) return null

  return { selectorStart, valueStart, selectorEnd }
}

export function getSelectorTypeResourceHover(
  lineText: string,
  cursor: number,
): ResourceHoverInfo | null {
  const context = selectorTypeContext(lineText, cursor)
  if (!context) return null

  const tokenRe = /(?:['\"])?([A-Za-z_][A-Za-z0-9_.-]*:[A-Za-z0-9_./-]*)(?:['\"])?/g
  let match: RegExpExecArray | null
  while ((match = tokenRe.exec(lineText)) !== null) {
    const value = match[1]
    const tokenStart = match.index + match[0].indexOf(value)
    const tokenEnd = tokenStart + value.length

    if (cursor < tokenStart || cursor > tokenEnd) continue
    if (tokenStart < context.valueStart || tokenStart > context.selectorEnd) continue

    const isInTypeContext = tokenStart >= context.valueStart
    if (!isInTypeContext) continue

    const known = (BUILTIN_RESOURCE_REGISTRY.entities as readonly string[]).includes(value)
    return {
      category: 'entities',
      value,
      known,
      markdown: [
        '```redscript',
        `${value}: resource<${RESOURCE_CATEGORY_NAME.entities}> (static/editor catalog)`,
        '```',
        known
          ? 'Known built-in resource literal from static/editor catalog metadata (static suggestion). '
            + 'This is not a live validation signal from a running server.'
          : 'Resource ID not present in the built-in static/editor catalog. Open registry support may exist in datapacks, mods, plugins, or newer Minecraft versions.',
        '',
        'Static/editor selector argument hover: this does not claim live runtime/permission behavior.',
      ].join('\n'),
    }
  }

  return null
}
