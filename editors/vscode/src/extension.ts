import * as vscode from 'vscode'
import * as path from 'path'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'
import { registerHoverProvider } from './hover'
import { registerCodeActions } from './codeactions'
import { registerCompletionProvider } from './completion'
import { registerSymbolProviders } from './symbols'

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

let lspClient: LanguageClient | undefined

/**
 * Try to resolve the redscript-lsp binary.
 * Returns the path if found (as installed alongside the redscript npm package),
 * or null if not available.
 */
function resolveLspServerPath(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs')
  try {
    // 1. Bundled LSP server (primary): out/lsp-server.js packed inside the vsix.
    //    __dirname is the extension's out/ directory when bundled by esbuild.
    const bundled = path.join(__dirname, 'lsp-server.js')
    fs.accessSync(bundled)
    return bundled
  } catch { /* fall through */ }
  try {
    // 2. Dev/symlink: node_modules/redscript/dist/src/lsp/main.js
    const candidate = path.join(__dirname, '..', 'node_modules', 'redscript', 'dist', 'src', 'lsp', 'main.js')
    fs.accessSync(candidate)
    return candidate
  } catch {
    return null
  }
}

export function activate(context: vscode.ExtensionContext): void {
  // -------------------------------------------------------------------------
  // LSP client (primary path)
  // -------------------------------------------------------------------------
  const serverModule = resolveLspServerPath()
  if (serverModule) {
    const serverOptions: ServerOptions = {
      run:   { module: serverModule, transport: TransportKind.stdio },
      debug: { module: serverModule, transport: TransportKind.stdio },
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'redscript' }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.mcrs'),
      },
      outputChannelName: 'RedScript LSP',
    }

    lspClient = new LanguageClient(
      'redscript-lsp',
      'RedScript Language Server',
      serverOptions,
      clientOptions,
    )

    lspClient.start()
    context.subscriptions.push({ dispose: () => lspClient?.stop() })
  } else {
    // -----------------------------------------------------------------------
    // Fallback: bundled compiler diagnostics (no redscript-lsp available)
    // -----------------------------------------------------------------------
    activateFallbackDiagnostics(context)
  }

  // -------------------------------------------------------------------------
  // Providers that always run regardless of LSP availability
  // -------------------------------------------------------------------------
  registerHoverProvider(context)
  registerCompletionProvider(context)
  registerCodeActions(context)
  registerSymbolProviders(context)

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10)
  statusBar.text = serverModule ? '$(pass) RedScript LSP' : '$(pass) RedScript'
  statusBar.tooltip = serverModule ? 'RedScript Language Server active' : 'RedScript compiler'
  statusBar.show()
  context.subscriptions.push(statusBar)

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

// ---------------------------------------------------------------------------
// Fallback: bundled-compiler diagnostics (used when redscript-lsp is absent)
// ---------------------------------------------------------------------------

function activateFallbackDiagnostics(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('redscript')
  context.subscriptions.push(diagnostics)

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

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => scheduleValidation(doc))
  )
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => scheduleValidation(e.document))
  )
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnostics.delete(doc.uri)
      const key = doc.uri.toString()
      const t = timers.get(key)
      if (t) { clearTimeout(t); timers.delete(key) }
    })
  )

  vscode.workspace.textDocuments
    .filter(d => d.languageId === 'redscript')
    .forEach(d => scheduleValidation(d))
}

function validateDocument(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  const compile = getCompile()
  if (!compile) {
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

    for (const w of result.warnings ?? []) {
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
    const msg = err instanceof Error ? err.message : String(err)

    let range: vscode.Range
    const loc = (err as { location?: { line?: number; col?: number } }).location
    if (loc?.line && loc?.col) {
      const l = Math.max(0, loc.line - 1)
      const c = Math.max(0, loc.col - 1)
      range = new vscode.Range(l, c, l, c + 20)
    } else {
      range = extractRange(msg, doc)
    }

    docDiagnostics.push({
      message: msg,
      range,
      severity: vscode.DiagnosticSeverity.Error,
      source: 'redscript'
    })
  }

  collection.set(doc.uri, docDiagnostics)
}

function findWarningRange(
  message: string,
  code: string | undefined,
  source: string,
  doc: vscode.TextDocument
): vscode.Range {
  if (code === 'W_UNNAMESPACED_TYPE') {
    const m = message.match(/"([^"]+)"/)
    if (m) return searchToken(source, doc, `type=${m[1]}`) ?? searchToken(source, doc, m[1]) ?? topLine(doc)
  }
  if (code === 'W_QUOTED_SELECTOR') {
    const m = message.match(/"(@[^"]+)"/)
    if (m) return searchToken(source, doc, `"${m[1]}"`) ?? topLine(doc)
  }
  if (code === 'W_DEPRECATED') {
    const m = message.match(/^(\w+) is deprecated/)
    if (m) return searchToken(source, doc, m[1]) ?? topLine(doc)
  }
  return topLine(doc)
}

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

function extractRange(msg: string, doc: vscode.TextDocument): vscode.Range {
  let m = msg.match(/line[: ]+(\d+)[,\s]+col(?:umn)?[: ]+(\d+)/i)
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1)
    const c = Math.max(0, parseInt(m[2]) - 1)
    return new vscode.Range(l, c, l, c + 80)
  }
  m = msg.match(/^(\d+):(\d+)/)
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1)
    const c = Math.max(0, parseInt(m[2]) - 1)
    return new vscode.Range(l, c, l, c + 80)
  }
  m = msg.match(/\[line (\d+)\]/i)
  if (m) {
    const l = Math.max(0, parseInt(m[1]) - 1)
    return new vscode.Range(l, 0, l, 200)
  }
  return new vscode.Range(0, 0, 0, doc.lineAt(0).text.length)
}

export function deactivate(): Promise<void> | undefined {
  return lspClient?.stop()
}
