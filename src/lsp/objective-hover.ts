export interface ObjectiveHoverInfo {
  token: string
  markdown: string
}

export function isInsideStringOrLineComment(lineText: string, cursor: number): boolean {
  let inString = false
  let escaped = false

  for (let i = 0; i < cursor && i < lineText.length; i++) {
    const ch = lineText[i]
    const next = lineText[i + 1]

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

    if (ch === '/' && next === '/') return true
    if (ch === '"') {
      inString = true
      continue
    }
  }

  return inString
}

export function objectiveHoverMarkdown(token: string): string {
  return [
    '```redscript',
    `${token}: objective`,
    '```',
    '',
    '`#name` denotes a scoreboard objective token in RedScript/Minecraft scoreboard contexts.',
    '**Static/editor documentation only**: this hover does not confirm objective existence or behavior against a live Paper/server.',
  ].join('\n')
}

/**
 * Find a scoreboard objective token like `#coins` at the cursor, skipping
 * strings and trailing `//` comments where hover text should stay quiet.
 */
export function getObjectiveHover(lineText: string, cursor: number): ObjectiveHoverInfo | null {
  if (isInsideStringOrLineComment(lineText, cursor)) return null

  const objectiveRe = /#[A-Za-z_][A-Za-z0-9_]*/g
  let match: RegExpExecArray | null
  while ((match = objectiveRe.exec(lineText)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (cursor >= start && cursor <= end) {
      const token = match[0]
      return { token, markdown: objectiveHoverMarkdown(token) }
    }
  }

  return null
}
