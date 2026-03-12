/**
 * RedScript Diagnostics
 *
 * Error reporting with file path, line, column, and formatted error messages.
 */

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export type DiagnosticKind = 'LexError' | 'ParseError' | 'LoweringError' | 'TypeError'

export interface DiagnosticLocation {
  file?: string
  line: number
  col: number
}

function formatSourcePointer(sourceLines: string[], line: number, col: number): string[] {
  const lineIdx = line - 1
  if (lineIdx < 0 || lineIdx >= sourceLines.length) {
    return []
  }

  const sourceLine = sourceLines[lineIdx]
  const safeCol = Math.max(1, Math.min(col, sourceLine.length + 1))
  const pointer = `  ${' '.repeat(safeCol - 1)}^`
  return [`  ${sourceLine}`, pointer]
}

export class DiagnosticError extends Error {
  readonly kind: DiagnosticKind
  readonly location: DiagnosticLocation
  readonly sourceLines?: string[]

  constructor(
    kind: DiagnosticKind,
    message: string,
    location: DiagnosticLocation,
    sourceLines?: string[]
  ) {
    super(message)
    this.name = 'DiagnosticError'
    this.kind = kind
    this.location = location
    this.sourceLines = sourceLines
  }

  /**
   * Format the error for display:
   * ```
   * Error: [ParseError] line 5, col 12: Expected ';' after statement
   *   5 |   let x = 42
   *                   ^ expected ';'
   * ```
   */
  format(): string {
    const { kind, message, location, sourceLines } = this
    const filePart = location.file ? `${location.file}:` : ''
    const header = `Error: [${kind}] ${filePart}line ${location.line}, col ${location.col}: ${message}`

    if (!sourceLines || sourceLines.length === 0) {
      return header
    }

    const pointerLines = formatSourcePointer(sourceLines, location.line, location.col)
    if (pointerLines.length === 0) {
      return header
    }
    const lineNum = String(location.line).padStart(3)
    const prefix = `${lineNum} | `
    const sourceLine = sourceLines[location.line - 1]
    const safeCol = Math.max(1, Math.min(location.col, sourceLine.length + 1))
    const pointer = ' '.repeat(prefix.length + safeCol - 1) + '^'
    const hint = message.toLowerCase().includes('expected')
      ? message.split(':').pop()?.trim() || ''
      : ''

    return [
      header,
      `${prefix}${sourceLine}`,
      `${pointer}${hint ? ` ${hint}` : ''}`,
    ].join('\n')
  }

  toString(): string {
    return this.format()
  }
}

// ---------------------------------------------------------------------------
// Diagnostic Collection
// ---------------------------------------------------------------------------

export class DiagnosticCollector {
  private diagnostics: DiagnosticError[] = []
  private sourceLines: string[] = []
  private filePath?: string

  constructor(source?: string, filePath?: string) {
    if (source) {
      this.sourceLines = source.split('\n')
    }
    this.filePath = filePath
  }

  error(kind: DiagnosticKind, message: string, line: number, col: number): void {
    const diagnostic = new DiagnosticError(
      kind,
      message,
      { file: this.filePath, line, col },
      this.sourceLines
    )
    this.diagnostics.push(diagnostic)
  }

  hasErrors(): boolean {
    return this.diagnostics.length > 0
  }

  getErrors(): DiagnosticError[] {
    return this.diagnostics
  }

  formatAll(): string {
    return this.diagnostics.map(d => d.format()).join('\n\n')
  }

  throwFirst(): never {
    if (this.diagnostics.length > 0) {
      throw this.diagnostics[0]
    }
    throw new Error('No diagnostics to throw')
  }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Create a DiagnosticError from a raw error message that includes line/col info
 * e.g., "Expected ';' at line 5, col 12"
 */
export function parseErrorMessage(
  kind: DiagnosticKind,
  rawMessage: string,
  sourceLines?: string[],
  filePath?: string
): DiagnosticError {
  // Try to extract line and col from message
  const match = rawMessage.match(/at line (\d+), col (\d+)/)
  if (match) {
    const line = parseInt(match[1], 10)
    const col = parseInt(match[2], 10)
    const message = rawMessage.replace(/ at line \d+, col \d+$/, '').trim()
    return new DiagnosticError(kind, message, { file: filePath, line, col }, sourceLines)
  }

  // Fallback: line 1, col 1
  return new DiagnosticError(kind, rawMessage, { file: filePath, line: 1, col: 1 }, sourceLines)
}

export function formatError(error: Error | DiagnosticError, source?: string): string {
  if (error instanceof DiagnosticError) {
    const sourceLines = source?.split('\n') ?? error.sourceLines ?? []
    const { file, line, col } = error.location
    const locationPart = file
      ? ` in ${file} at line ${line}, col ${col}`
      : ` at line ${line}, col ${col}`
    const lines = [`Error${locationPart}:`]
    const pointerLines = formatSourcePointer(sourceLines, line, col)
    if (pointerLines.length > 0) {
      lines.push(...pointerLines)
    }
    lines.push(error.message)
    return lines.join('\n')
  }

  if (!source) {
    return error.message
  }

  const parsed = parseErrorMessage('ParseError', error.message, source.split('\n'))
  return formatError(parsed, source)
}
