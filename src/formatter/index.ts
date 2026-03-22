type LineInfo = {
  raw: string
  trimmed: string
  startsInString: boolean
  endsInString: boolean
  openCount: number
  closeCount: number
  leadingCloseCount: number
}

function analyzeLine(raw: string, startsInString: boolean): LineInfo {
  let inString = startsInString
  let escaped = false
  let openCount = 0
  let closeCount = 0
  let leadingCloseCount = 0
  let sawCode = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    const next = raw[i + 1]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
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
      break
    }

    if (ch === '"') {
      inString = true
      escaped = false
      sawCode = true
      continue
    }

    if (ch === '{') {
      openCount++
      sawCode = true
      continue
    }

    if (ch === '}') {
      closeCount++
      if (!sawCode) leadingCloseCount++
      sawCode = true
      continue
    }

    if (!/\s/.test(ch)) sawCode = true
  }

  return {
    raw,
    trimmed: raw.trim(),
    startsInString,
    endsInString: inString,
    openCount,
    closeCount,
    leadingCloseCount,
  }
}

function normalizeSpacing(line: string): string {
  return line
    .replace(/\)\s*\{/g, ') {')
    .replace(/\}\s*else\b/g, '} else')
    .replace(/\belse\s*\{/g, 'else {')
}

function splitTopLevelComma(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const next = input[i + 1]

    if (inString) {
      current += ch
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }

    if (ch === '/' && next === '/') {
      current += input.slice(i)
      break
    }

    if (ch === '"') {
      inString = true
      current += ch
      continue
    }

    if (ch === '(') depthParen++
    if (ch === ')') depthParen = Math.max(0, depthParen - 1)
    if (ch === '[') depthBracket++
    if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)
    if (ch === '{') depthBrace++
    if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)

    if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += ch
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function wrapLongLine(line: string): string[] {
  if (line.length <= 80) return [line]
  if (line.includes('//')) return [line]

  const prefixMatch = line.match(/^(\s*[^()]+?)\((.*)\)(.*)$/)
  if (!prefixMatch) return [line]

  const [, prefix, inner, suffix] = prefixMatch
  const parts = splitTopLevelComma(inner)
  if (parts.length < 2) return [line]

  const baseIndent = prefix.match(/^\s*/)?.[0] ?? ''
  const continuationIndent = `${baseIndent}  `

  return [
    `${prefix}(`,
    ...parts.map((part, index) => `${continuationIndent}${part}${index < parts.length - 1 ? ',' : ''}`),
    `${baseIndent})${suffix}`,
  ]
}

export function format(source: string): string {
  const rawLines = source.replace(/\r\n/g, '\n').split('\n')
  const lines: LineInfo[] = []
  let inString = false

  for (const rawLine of rawLines) {
    const info = analyzeLine(rawLine, inString)
    lines.push(info)
    inString = info.endsInString
  }

  let indent = 0
  let blankCount = 0
  const result: string[] = []

  for (const line of lines) {
    if (line.startsInString) {
      result.push(line.raw)
      blankCount = 0
      indent = Math.max(0, indent + line.openCount - line.closeCount)
      continue
    }

    if (!line.trimmed) {
      if (result.length === 0) continue
      if (blankCount >= 2) continue
      result.push('')
      blankCount++
      continue
    }

    blankCount = 0

    if (line.trimmed === '{' && result.length > 0) {
      let idx = result.length - 1
      while (idx >= 0 && result[idx] === '') idx--
      if (idx >= 0) {
        result[idx] = `${result[idx]} {`
        indent++
        continue
      }
    }

    const currentIndent = Math.max(0, indent - line.leadingCloseCount)
    const normalized = normalizeSpacing(line.trimmed)
    const rendered = `${'  '.repeat(currentIndent)}${normalized}`

    for (const wrappedLine of wrapLongLine(rendered)) {
      result.push(wrappedLine)
    }

    indent = Math.max(0, indent + line.openCount - line.closeCount)
  }

  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop()
  }

  if (result.length === 0) return '\n'
  return `${result.join('\n')}\n`
}
