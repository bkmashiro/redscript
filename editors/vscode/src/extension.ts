import * as vscode from 'vscode'
// The compiler is bundled directly into this extension by esbuild.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compile: _compile } = require('redscript') as {
  compile: (source: string, opts?: { filePath?: string }) => {
    files: { path: string; content: string }[]
    warnings: { message: string; line?: number; column?: number }[]
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
      const line = Math.max(0, (w.line ?? 1) - 1)
      const col = Math.max(0, (w.column ?? 1) - 1)
      const range = new vscode.Range(line, col, line, col + 50)
      docDiagnostics.push({
        message: w.message,
        range,
        severity: vscode.DiagnosticSeverity.Warning,
        source: 'redscript'
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
