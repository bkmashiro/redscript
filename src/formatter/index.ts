export function format(source: string): string {
  const lines = source.split("\n")
  let indent = 0
  const result: string[] = []

  for (let line of lines) {
    line = line.trim()
    if (!line) { result.push(""); continue }

    // Decrease indent before }
    if (line.startsWith("}")) indent = Math.max(0, indent - 1)

    // Add indentation
    result.push("    ".repeat(indent) + line)

    // Increase indent after {
    if (line.endsWith("{")) indent++
  }

  // Ensure single newline at end
  return result.join("\n").trimEnd() + "\n"
}
