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
        // If cursor is preceded by '#', it's a #mc_name — no definition to jump to
        if (isMcName(doc, position)) return null

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
        // For #mc_name, find all occurrences of the full #name token
        if (isMcName(doc, position)) {
          const mcRange = doc.getWordRangeAtPosition(position, /#[a-zA-Z_][a-zA-Z0-9_]*/)
          if (!mcRange) return null
          const mcWord = doc.getText(mcRange)
          return findAllOccurrences(doc, mcWord)
        }

        const wordRange = doc.getWordRangeAtPosition(position)
        if (!wordRange) return null
        const word = doc.getText(wordRange)

        // Exclude bare names that appear as #name elsewhere (they're different things)
        return findAllOccurrences(doc, word).filter(loc => {
          // Don't include occurrences that are actually #word
          const charBefore = loc.range.start.character > 0
            ? doc.getText(new vscode.Range(
                loc.range.start.translate(0, -1),
                loc.range.start
              ))
            : ''
          return charBefore !== '#'
        })
      }
    })
  )
}

/** Returns true if the cursor is on the identifier part of a #mc_name token. */
function isMcName(doc: vscode.TextDocument, position: vscode.Position): boolean {
  if (position.character === 0) return false
  const charBefore = doc.getText(new vscode.Range(
    position.translate(0, -1),
    position
  ))
  if (charBefore === '#') return true
  // Also check if we're in the middle of an #ident — look for # to the left
  const linePrefix = doc.lineAt(position.line).text.slice(0, position.character)
  const match = linePrefix.match(/#[a-zA-Z_][a-zA-Z0-9_]*$/)
  return match !== null
}
