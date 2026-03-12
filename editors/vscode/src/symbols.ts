import * as vscode from 'vscode'

const DECL_RE = /\b(fn|let|const|struct|enum)\s+(\w+)/g

interface DeclInfo {
  kind: string
  name: string
  range: vscode.Range
}

function findDeclarations(doc: vscode.TextDocument): DeclInfo[] {
  const text = doc.getText()
  const decls: DeclInfo[] = []
  let match: RegExpExecArray | null

  DECL_RE.lastIndex = 0
  while ((match = DECL_RE.exec(text)) !== null) {
    const nameStart = match.index + match[0].length - match[2].length
    const pos = doc.positionAt(nameStart)
    const range = new vscode.Range(pos, doc.positionAt(nameStart + match[2].length))
    decls.push({ kind: match[1], name: match[2], range })
  }

  return decls
}

function findAllOccurrences(doc: vscode.TextDocument, word: string): vscode.Location[] {
  const text = doc.getText()
  const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g')
  const locations: vscode.Location[] = []
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const pos = doc.positionAt(match.index)
    const range = new vscode.Range(pos, doc.positionAt(match.index + word.length))
    locations.push(new vscode.Location(doc.uri, range))
  }

  return locations
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function registerSymbolProviders(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: 'redscript', scheme: 'file' }

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition(doc, position) {
        const wordRange = doc.getWordRangeAtPosition(position)
        if (!wordRange) return null
        const word = doc.getText(wordRange)

        const decls = findDeclarations(doc)
        const decl = decls.find(d => d.name === word)
        if (!decl) return null

        return new vscode.Location(doc.uri, decl.range)
      }
    })
  )

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(selector, {
      provideReferences(doc, position) {
        const wordRange = doc.getWordRangeAtPosition(position)
        if (!wordRange) return null
        const word = doc.getText(wordRange)

        return findAllOccurrences(doc, word)
      }
    })
  )
}
