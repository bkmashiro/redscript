import * as vscode from 'vscode'
import { registerHoverProvider } from './hover'
// The compiler is bundled directly into this extension by esbuild.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compile: _compile } = require('redscript') as {
  compile: (source: string, opts?: { filePath?: string }) => {
    files: { path: string; content: string }[]
    warnings: { message: string; code: string; line?: number; col?: number }[]
  }
}

function getCompile() {
  return _compile ?? null
}

const DEBOUNCE_MS = 600

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('redscript')
  context.subscriptions.push(diagnostics)

  // Debounce timer per document URI
  const timers = new Map<string, NodeJS.Timeout>()

  function scheduleValidation(doc: vscode.TextDocument) {
    if (doc.languageId !== 'redscript') return
    const key = doc.uri.toString()
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    timers.set(key, setTimeout(() => {
      validateDocument(doc, diagnostics)
      timers.delete(key)
    }, DEBOUNCE_MS))
  }

  // Validate on open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => scheduleValidation(doc))
  )

  // Validate on change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => scheduleValidation(e.document))
  )

  // Clear diagnostics on close
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnostics.delete(doc.uri)
      const key = doc.uri.toString()
      const t = timers.get(key)
      if (t) { clearTimeout(t); timers.delete(key) }
    })
  )

  // Validate all already-open .rs files
  vscode.workspace.textDocuments
    .filter(d => d.languageId === 'redscript')
    .forEach(d => scheduleValidation(d))

  // Register hover documentation
  registerHoverProvider(context)

  // Status bar item to show compilation state
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10)
  statusBar.text = '$(pass) RedScript'
  statusBar.tooltip = 'RedScript compiler'
  statusBar.show()
  context.subscriptions.push(statusBar)

  // Track the active editor's compile state
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.languageId === 'redscript') {
        statusBar.show()
      } else {
        statusBar.hide()
      }
    })
  )
}

function validateDocument(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  const compile = getCompile()
  if (!compile) {
    // Compiler not available — show a one-time info message
    collection.set(doc.uri, [{
      message: 'RedScript compiler not found. Run `npm install -g redscript` to enable diagnostics.',
      range: new vscode.Range(0, 0, 0, 0),
      severity: vscode.DiagnosticSeverity.Information,
      source: 'redscript'
    }])
    return
  }

  const source = doc.getText()
  const docDiagnostics: vscode.Diagnostic[] = []

  try {
    const result = compile(source, { filePath: doc.uri.fsPath })

    // Convert warnings to VS Code diagnostics
    for (const w of result.warnings ?? []) {
      // Use real line/col from AST span when available, fall back to text search
      const range = (w.line && w.col)
        ? new vscode.Range(w.line - 1, w.col - 1, w.line - 1, w.col - 1 + 20)
        : findWarningRange(w.message, w.code, source, doc)
      docDiagnostics.push({
        message: w.message,
        range,
        severity: vscode.DiagnosticSeverity.Warning,
        source: 'redscript',
        code: w.code
      })
    }
  } catch (err: unknown) {
    // Parse the error message for line/column info
    const msg = err instanceof Error ? err.message : String(err)
    const range = extractRange(msg, doc)
    docDiagnostics.push({
      message: msg,
      range,
      severity: vscode.DiagnosticSeverity.Error,
      source: 'redscript'
    })
  }

  collection.set(doc.uri, docDiagnostics)
}

/**
 * For warnings without position info, search the source for the relevant token
 * mentioned in the warning message.
 */
function findWarningRange(
  message: string,
  code: string | undefined,
  source: string,
  doc: vscode.TextDocument
): vscode.Range {
  // W_UNNAMESPACED_TYPE: message contains the unqualified type name in quotes
  // e.g. 'Unnamespaced entity type "zombie"'
  if (code === 'W_UNNAMESPACED_TYPE') {
    const m = message.match(/"([^"]+)"/)
    if (m) return searchToken(source, doc, `type=${m[1]}`) ?? searchToken(source, doc, m[1]) ?? topLine(doc)
  }

  // W_QUOTED_SELECTOR: message contains the quoted selector
  // e.g. 'Quoted selector "@a" is deprecated'
  if (code === 'W_QUOTED_SELECTOR') {
    const m = message.match(/"(@[^"]+)"/)
    if (m) return searchToken(source, doc, `"${m[1]}"`) ?? topLine(doc)
  }

  // W_DEPRECATED: usually about tp_to
  if (code === 'W_DEPRECATED') {
    const m = message.match(/^(\w+) is deprecated/)
    if (m) return searchToken(source, doc, m[1]) ?? topLine(doc)
  }

  return topLine(doc)
}

/** Search source for a literal string, return range of first match. */
function searchToken(
  source: string,
  doc: vscode.TextDocument,
  token: string
): vscode.Range | null {
  const idx = source.indexOf(token)
  if (idx < 0) return null
  const pos = doc.positionAt(idx)
  return new vscode.Range(pos, doc.positionAt(idx + token.length))
}

function topLine(doc: vscode.TextDocument): vscode.Range {
  return new vscode.Range(0, 0, 0, doc.lineAt(0).text.length)
}

/**
 * Try to extract line/column from common error formats:
 *   "Error at line 5, column 12: ..."
 *   "5:12: ..."
 *   "[line 5] ..."
 */
function extractRange(msg: string, doc: vscode.TextDocument): vscode.Range {
  // "line N, column M"
  let m = msg.match(/line[: ]+(\d+)[,\s]+col(?:umn)?[: ]+(\d+)/i)
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1)
    const c = Math.max(0, parseInt(m[2]) - 1)
    return new vscode.Range(l, c, l, c + 80)
  }
  // "N:M"
  m = msg.match(/^(\d+):(\d+)/)
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1)
    const c = Math.max(0, parseInt(m[2]) - 1)
    return new vscode.Range(l, c, l, c + 80)
  }
  // "[line N]"
  m = msg.match(/\[line (\d+)\]/i)
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1)
    return new vscode.Range(l, 0, l, 200)
  }
  // Fallback: highlight first line
  return new vscode.Range(0, 0, 0, doc.lineAt(0).text.length)
}

export function deactivate(): void {
  // nothing
}
