import * as vscode from 'vscode'

/**
 * Code action provider for RedScript.
 * Currently provides:
 *  - "Add minecraft: namespace" quick fix for unnamespaced entity types
 *    e.g. type=zombie → type=minecraft:zombie
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

class RedScriptCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = []

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
        actions.push(fix)
      }
    }

    // Also scan the current line for unnamespaced type= patterns
    // even without a diagnostic (as a proactive suggestion)
    const lineText = document.lineAt(range.start.line).text
    const lineTypeRe = /\btype=([a-z][a-z0-9_]*)(?!\s*[:a-z0-9_])/g
    let lm: RegExpExecArray | null
    while ((lm = lineTypeRe.exec(lineText)) !== null) {
      const typeName = lm[1]
      // Skip already-namespaced or already have a fix above
      if (typeName.includes(':')) continue
      if (actions.some(a => a.title.includes(typeName))) continue

      const fix = new vscode.CodeAction(
        `Add namespace: type=minecraft:${typeName}`,
        vscode.CodeActionKind.QuickFix
      )
      const col = lm.index + 'type='.length
      const start = new vscode.Position(range.start.line, col)
      const end = new vscode.Position(range.start.line, col + typeName.length)
      const edit = new vscode.WorkspaceEdit()
      edit.replace(document.uri, new vscode.Range(start, end), `minecraft:${typeName}`)
      fix.edit = edit
      actions.push(fix)
    }

    return actions
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
