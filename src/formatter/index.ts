export function format(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const normalized: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '{' && normalized.length > 0) {
      let idx = normalized.length - 1
      while (idx >= 0 && normalized[idx] === '') idx--
      if (idx >= 0) {
        normalized[idx] = `${normalized[idx]} {`
        continue
      }
    }
    normalized.push(line)
  }

  let indent = 0
  const result: string[] = []
  let blankCount = 0

  for (const line of normalized) {
    if (!line) {
      if (result.length === 0) continue
      if (blankCount >= 2) continue
      result.push('')
      blankCount++
      continue
    }
    blankCount = 0

    // Decrease indent before }
    if (line.startsWith('}')) indent = Math.max(0, indent - 1)

    // Add indentation
    result.push('  '.repeat(indent) + line)

    // Increase indent after {
    if (line.endsWith('{')) indent++
  }

  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop()
  }

  // Ensure single newline at end
  if (result.length === 0) return '\n'
  return result.join('\n') + '\n'
}
