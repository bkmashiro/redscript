import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

const DECL_RE = /\b(fn|let|const|struct|enum)\s+(\w+)/g

interface DeclInfo {
  kind: string
  name: string
  range: vscode.Range
}

interface StructFieldInfo {
  structName: string
  fieldName: string
  fieldRange: vscode.Range
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

/** Find all struct definitions and their field positions. */
function findStructFields(doc: vscode.TextDocument): StructFieldInfo[] {
  const text = doc.getText()
  const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/gs
  const fields: StructFieldInfo[] = []
  let sm: RegExpExecArray | null

  while ((sm = structRe.exec(text)) !== null) {
    const structName = sm[1]
    const bodyStart = sm.index + sm[0].indexOf('{') + 1
    const body = sm[2]
    const fieldRe = /\b(\w+)\s*:/g
    let fm: RegExpExecArray | null
    while ((fm = fieldRe.exec(body)) !== null) {
      const fieldStart = bodyStart + fm.index
      const pos = doc.positionAt(fieldStart)
      const range = new vscode.Range(pos, doc.positionAt(fieldStart + fm[1].length))
      fields.push({ structName, fieldName: fm[1], fieldRange: range })
    }
  }

  return fields
}

/** Check if cursor is on a struct literal field key (left side of : in { key: value }). */
function isStructLiteralField(doc: vscode.TextDocument, position: vscode.Position, word: string): string | null {
  const line = doc.lineAt(position.line).text
  const wordEnd = position.character + word.length

  // Check if word is followed by ':' (struct literal field)
  const afterWord = line.slice(wordEnd).trimStart()
  if (!afterWord.startsWith(':')) return null

  // Find the struct type from context: let x: StructType = { ... }
  // Search backwards for "let <name>: <Type> = {"
  const textBefore = doc.getText(new vscode.Range(new vscode.Position(0, 0), position))
  // Match: let varname: TypeName = { ... (cursor is somewhere in the braces)
  const letMatch = textBefore.match(/let\s+\w+\s*:\s*(\w+)\s*=\s*\{[^}]*$/)
  if (letMatch) return letMatch[1]

  // Also check for: return { ... } after -> TypeName
  const fnMatch = textBefore.match(/->\s*(\w+)\s*\{[^}]*return\s*\{[^}]*$/)
  if (fnMatch) return fnMatch[1]

  return null
}

/**
 * Check if cursor is on a member access field: expr.field
 * Returns the struct type name if found, null otherwise
 */
function isMemberAccessField(doc: vscode.TextDocument, position: vscode.Position, word: string): string | null {
  const line = doc.lineAt(position.line).text
  const wordStart = position.character

  // Check if word is preceded by '.'
  const beforeWord = line.slice(0, wordStart)
  if (!beforeWord.endsWith('.')) return null

  // Find the variable before the dot
  const varMatch = beforeWord.match(/(\w+)\s*\.$/)
  if (!varMatch) return null
  const varName = varMatch[1]

  // Find the variable's type declaration
  const text = doc.getText()
  // Look for: let varName: TypeName or fn param varName: TypeName
  const typeRe = new RegExp(`\\b(?:let|const)\\s+${varName}\\s*:\\s*(\\w+)`, 'm')
  const typeMatch = text.match(typeRe)
  if (typeMatch) return typeMatch[1]

  // Also check function parameters: fn xxx(varName: TypeName)
  const paramRe = new RegExp(`\\((?:[^)]*,\\s*)?${varName}\\s*:\\s*(\\w+)`, 'm')
  const paramMatch = text.match(paramRe)
  if (paramMatch) return paramMatch[1]

  return null
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

// ---------------------------------------------------------------------------
// Builtin go-to-definition support
// ---------------------------------------------------------------------------

/** Cache of builtin name → line number in builtins.d.mcrs */
let builtinLineCache: Map<string, number> | null = null

function getBuiltinDtsPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, 'builtins.d.mcrs')
}

function loadBuiltinLines(dtsPath: string): Map<string, number> {
  if (builtinLineCache) return builtinLineCache
  const cache = new Map<string, number>()
  try {
    const content = fs.readFileSync(dtsPath, 'utf-8')
    const lines = content.split('\n')
    // Find "declare fn <name>(" lines
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^declare fn (\w+)\(/)
      if (m) {
        cache.set(m[1], i)
      }
    }
  } catch {
    // dts file not found — skip
  }
  builtinLineCache = cache
  return cache
}

/** Set of all builtin function names that have DTS entries */
const KNOWN_BUILTINS = new Set([
  'say', 'tell', 'tellraw', 'announce', 'title', 'subtitle', 'actionbar', 'title_times',
  'give', 'kill', 'effect', 'effect_clear', 'clear', 'kick', 'xp_add', 'xp_set',
  'tp', 'tp_to',
  'setblock', 'fill', 'clone', 'summon', 'particle', 'playsound',
  'weather', 'time_set', 'time_add', 'gamerule', 'difficulty',
  'tag_add', 'tag_remove',
  'scoreboard_get', 'score', 'scoreboard_set', 'scoreboard_display', 'scoreboard_hide',
  'scoreboard_add_objective', 'scoreboard_remove_objective',
  'random', 'random_native', 'random_sequence',
  'data_get', 'data_merge',
  'bossbar_add', 'bossbar_set_value', 'bossbar_set_max', 'bossbar_set_color',
  'bossbar_set_style', 'bossbar_set_visible', 'bossbar_set_players',
  'bossbar_remove', 'bossbar_get_value',
  'team_add', 'team_remove', 'team_join', 'team_leave', 'team_option',
  'set_new', 'set_add', 'set_contains', 'set_remove', 'set_clear',
  'setTimeout', 'setInterval', 'clearInterval',
])

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

        // ── Go-to-definition for builtin functions ──────────────
        // Only when used as a function call (followed by '(')
        const line = doc.lineAt(position.line).text
        const afterWord = line.slice(wordRange.end.character).trimStart()
        if (afterWord.startsWith('(') && KNOWN_BUILTINS.has(word)) {
          const dtsPath = getBuiltinDtsPath(context)
          const lines = loadBuiltinLines(dtsPath)
          const lineNum = lines.get(word)
          if (lineNum !== undefined) {
            const dtsUri = vscode.Uri.file(dtsPath)
            const pos = new vscode.Position(lineNum, 0)
            return new vscode.Location(dtsUri, pos)
          }
        }

        // Check if this is a struct literal field key: { fieldName: value }
        const structType = isStructLiteralField(doc, position, word)
        if (structType) {
          const structFields = findStructFields(doc)
          const field = structFields.find(f => f.structName === structType && f.fieldName === word)
          if (field) {
            return new vscode.Location(doc.uri, field.fieldRange)
          }
        }

        // Check if this is a member access: expr.field
        const memberAccess = isMemberAccessField(doc, position, word)
        if (memberAccess) {
          const structFields = findStructFields(doc)
          const field = structFields.find(f => f.structName === memberAccess && f.fieldName === word)
          if (field) {
            return new vscode.Location(doc.uri, field.fieldRange)
          }
        }

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

  context.subscriptions.push(
    vscode.languages.registerRenameProvider(selector, {
      provideRenameEdits(doc, position, newName) {
        const wordRange = doc.getWordRangeAtPosition(position)
        if (!wordRange) return null
        const oldName = doc.getText(wordRange)

        if (isMcName(doc, position)) return null

        const edits = new vscode.WorkspaceEdit()
        const text = doc.getText()
        const re = new RegExp(`\\b${escapeRegex(oldName)}\\b`, 'g')
        let match: RegExpExecArray | null
        while ((match = re.exec(text)) !== null) {
          if (match.index > 0 && text[match.index - 1] === '#') continue
          const start = doc.positionAt(match.index)
          const end = doc.positionAt(match.index + oldName.length)
          edits.replace(doc.uri, new vscode.Range(start, end), newName)
        }
        return edits
      },

      prepareRename(doc, position) {
        const wordRange = doc.getWordRangeAtPosition(position)
        if (!wordRange) throw new Error('Cannot rename this element')
        if (isMcName(doc, position)) {
          throw new Error('Cannot rename MC identifiers (#name)')
        }
        return wordRange
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
