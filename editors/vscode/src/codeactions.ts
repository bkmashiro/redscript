import * as vscode from 'vscode'
import { getMigrationQuickFixesFromLine } from './codeaction-helpers'

/**
 * Code action provider for RedScript.
 * Currently provides:
 *  - "Add minecraft: namespace" quick fix for unnamespaced entity types
 *    e.g. type=zombie → type=minecraft:zombie
 *  - Scoreboard objective migration quick fixes
 *    e.g. score(@s, "health") → score(@s, #health)
 *  - Known resource migration quick fixes in clearly detected builtins
 */
export function registerCodeActions(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'redscript', scheme: 'file' },
      new RedScriptCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  )
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

class RedScriptCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = []
    const seen = new Set<string>()

    const addAction = (action: vscode.CodeAction, key: string): void => {
      if (seen.has(key)) return
      seen.add(key)
      actions.push(action)
    }

    for (const diag of context.diagnostics) {
      if (diag.source !== 'redscript') continue

      // W_UNNAMESPACED_TYPE: e.g. 'Unnamespaced entity type "zombie"'
      if (diag.code === 'W_UNNAMESPACED_TYPE') {
        const m = diag.message.match(/Unnamespaced entity type "([^"]+)"/)
        if (!m) continue
        const typeName = m[1]

        // Find and replace in the diagnostic range area
        const fix = new vscode.CodeAction(
          `Add namespace: type=minecraft:${typeName}`,
          vscode.CodeActionKind.QuickFix
        )
        fix.diagnostics = [diag]
        fix.isPreferred = true

        // Search the document for type=<typeName> (without namespace)
        const text = document.getText()
        const re = new RegExp(`\\btype=${escapeRe(typeName)}(?![a-zA-Z0-9_:.])`, 'g')
        const edit = new vscode.WorkspaceEdit()
        let match: RegExpExecArray | null
        while ((match = re.exec(text)) !== null) {
          const start = document.positionAt(match.index + 'type='.length)
          const end = document.positionAt(match.index + 'type='.length + typeName.length)
          edit.replace(document.uri, new vscode.Range(start, end), `minecraft:${typeName}`)
        }

        fix.edit = edit
        addAction(fix, `doc:${typeName}`)
      }
    }

    // Also scan the current line for unnamespaced type= patterns and migration contexts
    const lineText = document.lineAt(range.start.line).text
    const lineFixes = getMigrationQuickFixesFromLine(lineText)
    for (const lineFix of lineFixes) {
      const action = new vscode.CodeAction(lineFix.title, vscode.CodeActionKind.QuickFix)
      action.isPreferred = Boolean(lineFix.preferred)
      action.edit = new vscode.WorkspaceEdit()
      const start = new vscode.Position(range.start.line, lineFix.startColumn)
      const end = new vscode.Position(range.start.line, lineFix.endColumn)
      action.edit.replace(document.uri, new vscode.Range(start, end), lineFix.replacement)

      const key = `${range.start.line}:${lineFix.startColumn}-${lineFix.endColumn}:${lineFix.replacement}`
      addAction(action, key)
    }

    return actions
  }
}
