import type { BuiltinDef } from '../builtins/metadata'

export interface BuiltinHoverInfo {
  name: string
  markdown: string
}

function formatBuiltinSignature(def: BuiltinDef): string {
  const paramText = def.params
    .map(param => {
      const optional = param.required ? '' : '?'
      const defaultText = param.default !== undefined
        ? ` = ${param.default}`
        : ''
      return `${param.name}: ${param.type}${optional}${defaultText}`
    })
    .join(', ')

  return `fn ${def.name}(${paramText}): ${def.returns}`
}

function formatBuiltinParams(def: BuiltinDef): string[] {
  if (def.params.length === 0) return []

  const lines: string[] = []
  lines.push('')
  lines.push('**Parameters:**')

  for (const param of def.params) {
    const optional = param.required ? '' : ' (optional)'
    const defaultText = param.default !== undefined ? `, default: ${param.default}` : ''
    lines.push(`- \`${param.name}: ${param.type}\` — ${param.doc || 'No parameter docs.'}${optional}${defaultText}`)
  }

  return lines
}

function formatBuiltinExamples(def: BuiltinDef): string[] {
  if (def.examples.length === 0) return []

  const lines: string[] = []
  lines.push('')
  lines.push('**Examples:**')
  for (const ex of def.examples) {
    lines.push(`- \`${ex}\``)
  }
  return lines
}

const BUILTIN_HOVER_DISCLAIMER =
  'Static/editor builtin metadata: this text is derived from builtin declarations and does not validate runtime behavior against a live server.'

function formatBuiltinHover(def: BuiltinDef): string {
  return [
    '```redscript',
    formatBuiltinSignature(def),
    '```',
    '',
    def.doc,
    ...formatBuiltinParams(def),
    ...formatBuiltinExamples(def),
    '',
    BUILTIN_HOVER_DISCLAIMER,
  ].join('\n')
}

export function getBuiltinHover(
  name: string,
  builtins: Record<string, BuiltinDef>,
): BuiltinHoverInfo | null {
  const builtin = builtins[name]
  if (!builtin) return null

  return {
    name: builtin.name,
    markdown: formatBuiltinHover(builtin),
  }
}
