import type { WorkspaceEdit, Position, Range } from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { Lexer, type Token } from '../lexer'
import type { Program, FnDecl, Block, Stmt, Expr, TypeNode, MatchPattern } from '../ast/types'

type SymbolKind = 'function' | 'local' | 'field'

interface RenameSymbol {
  kind: SymbolKind
  name: string
  structName?: string
  occurrences: Token[]
}

interface Scope {
  parent: Scope | null
  locals: Map<string, RenameSymbol>
  types: Map<string, TypeNode>
}

interface TokenCursor {
  tokens: Token[]
  byLineCol: Map<string, number>
}

function keyFor(line: number, col: number): string {
  return `${line}:${col}`
}

function buildTokenCursor(source: string): TokenCursor {
  const tokens = new Lexer(source).tokenize().filter(token => token.kind !== 'eof')
  const byLineCol = new Map<string, number>()
  tokens.forEach((token, index) => byLineCol.set(keyFor(token.line, token.col), index))
  return { tokens, byLineCol }
}

function tokenToRange(doc: TextDocument, token: Token): Range {
  const start = doc.positionAt(doc.offsetAt({ line: token.line - 1, character: token.col - 1 }))
  const end = doc.positionAt(doc.offsetAt({ line: token.line - 1, character: token.col - 1 }) + token.value.length)
  return { start, end }
}

function containsPosition(token: Token, position: Position): boolean {
  const line = token.line - 1
  const start = token.col - 1
  const end = start + token.value.length
  return position.line === line && position.character >= start && position.character <= end
}

function makeScope(parent: Scope | null): Scope {
  return {
    parent,
    locals: new Map(),
    types: new Map(),
  }
}

function resolveLocal(scope: Scope, name: string): RenameSymbol | null {
  let cur: Scope | null = scope
  while (cur) {
    const found = cur.locals.get(name)
    if (found) return found
    cur = cur.parent
  }
  return null
}

function resolveType(scope: Scope, name: string): TypeNode | null {
  let cur: Scope | null = scope
  while (cur) {
    const found = cur.types.get(name)
    if (found) return found
    cur = cur.parent
  }
  return null
}

function findTokenIndex(cursor: TokenCursor, line: number, col: number): number {
  return cursor.byLineCol.get(keyFor(line, col)) ?? -1
}

function findNextToken(
  cursor: TokenCursor,
  startIndex: number,
  predicate: (token: Token, index: number) => boolean,
): Token | null {
  for (let i = Math.max(0, startIndex); i < cursor.tokens.length; i++) {
    if (predicate(cursor.tokens[i], i)) return cursor.tokens[i]
  }
  return null
}

function findFunctionNameToken(cursor: TokenCursor, fn: FnDecl): Token | null {
  if (!fn.span) return null
  const fnIndex = findTokenIndex(cursor, fn.span.line, fn.span.col)
  if (fnIndex === -1) return null
  return findNextToken(cursor, fnIndex + 1, token => token.kind === 'ident' && token.value === fn.name)
}

function findBindingToken(cursor: TokenCursor, stmt: { span?: { line: number; col: number } }, bindingName: string): Token | null {
  if (!stmt.span) return null
  const startIndex = findTokenIndex(cursor, stmt.span.line, stmt.span.col)
  if (startIndex === -1) return null
  return findNextToken(
    cursor,
    startIndex + 1,
    token => token.kind === 'ident' && token.value === bindingName && token.line === stmt.span!.line,
  )
}

function findDeclarationNameToken(cursor: TokenCursor, stmt: Extract<Stmt, { kind: 'let' | 'const_decl' }>): Token | null {
  if (!stmt.span) return null
  const { span } = stmt
  const startIndex = findTokenIndex(cursor, span.line, span.col)
  if (startIndex === -1) return null
  return findNextToken(
    cursor,
    startIndex + 1,
    token => token.kind === 'ident' && token.value === stmt.name && token.line === span.line,
  )
}

function findFieldDeclarationTokens(cursor: TokenCursor, program: Program): Map<string, Token> {
  const result = new Map<string, Token>()
  for (const struct of program.structs ?? []) {
    if (!struct.span) continue
    const structIndex = findTokenIndex(cursor, struct.span.line, struct.span.col)
    if (structIndex === -1) continue
    let i = structIndex
    while (i < cursor.tokens.length && cursor.tokens[i].kind !== '{') i++
    if (i >= cursor.tokens.length) continue

    let fieldIndex = 0
    let depth = 1
    i++
    while (i < cursor.tokens.length && depth > 0 && fieldIndex < struct.fields.length) {
      const token = cursor.tokens[i]
      if (token.kind === '{') depth++
      else if (token.kind === '}') depth--
      else if (
        depth === 1 &&
        token.kind === 'ident' &&
        token.value === struct.fields[fieldIndex].name &&
        cursor.tokens[i + 1]?.kind === ':'
      ) {
        result.set(`${struct.name}.${token.value}`, token)
        fieldIndex++
      }
      i++
    }
  }
  return result
}

function findParamToken(cursor: TokenCursor, fn: FnDecl, paramName: string, fromIndex: number): Token | null {
  return findNextToken(
    cursor,
    fromIndex,
    token => token.kind === 'ident' && token.value === paramName && cursor.tokens[cursor.tokens.indexOf(token) + 1]?.kind === ':',
  )
}

function findFieldAccessToken(cursor: TokenCursor, expr: Extract<Expr, { kind: 'member' | 'member_assign' }>): Token | null {
  if (!expr.span) return null
  const { span } = expr
  const startIndex = findTokenIndex(cursor, span.line, span.col)
  if (startIndex === -1) return null
  return findNextToken(
    cursor,
    startIndex + 1,
    (token, index) => token.kind === 'ident' && token.value === expr.field && cursor.tokens[index - 1]?.kind === '.' && token.line === span.line,
  )
}

function findStructLiteralFieldToken(
  cursor: TokenCursor,
  expr: Extract<Expr, { kind: 'struct_lit' }>,
  fieldName: string,
  skipCount: number,
): Token | null {
  if (!expr.span) return null
  const startIndex = findTokenIndex(cursor, expr.span.line, expr.span.col)
  if (startIndex === -1) return null
  let depth = 0
  let skipped = 0
  for (let i = startIndex; i < cursor.tokens.length; i++) {
    const token = cursor.tokens[i]
    if (token.kind === '{') depth++
    else if (token.kind === '}') {
      depth--
      if (depth === 0) break
    } else if (
      depth === 1 &&
      token.kind === 'ident' &&
      token.value === fieldName &&
      cursor.tokens[i + 1]?.kind === ':'
    ) {
      if (skipped === skipCount) return token
      skipped++
    }
  }
  return null
}

function typeNameOf(type: TypeNode | null | undefined, program: Program): string | null {
  if (!type) return null
  if (type.kind === 'struct') return type.name
  if (type.kind === 'named' && program.structs?.some(struct => struct.name === type.name)) return type.name
  return null
}

function resolveExprStructName(expr: Expr, scope: Scope, program: Program, currentFn: FnDecl): string | null {
  switch (expr.kind) {
    case 'ident':
      return typeNameOf(resolveType(scope, expr.name), program)
    case 'member': {
      const objType = resolveExprStructName(expr.obj, scope, program, currentFn)
      if (!objType) return null
      const structDecl = program.structs?.find(struct => struct.name === objType)
      const fieldType = structDecl?.fields.find(field => field.name === expr.field)?.type
      return typeNameOf(fieldType, program)
    }
    case 'call': {
      const fn = program.declarations.find(candidate => candidate.name === expr.fn)
      return typeNameOf(fn?.returnType, program)
    }
    case 'type_cast':
      return typeNameOf(expr.targetType, program)
    case 'struct_lit':
      return typeNameOf(currentFn.returnType, program)
    default:
      return null
  }
}

function addOccurrence(symbol: RenameSymbol | null, token: Token | null): void {
  if (!symbol || !token) return
  if (symbol.occurrences.some(existing => existing.line === token.line && existing.col === token.col)) return
  symbol.occurrences.push(token)
}

function buildRenameIndex(source: string, program: Program): RenameSymbol[] {
  const cursor = buildTokenCursor(source)
  const symbols: RenameSymbol[] = []
  const functions = new Map<string, RenameSymbol>()
  const fieldSymbols = new Map<string, RenameSymbol>()
  const fieldDeclTokens = findFieldDeclarationTokens(cursor, program)

  for (const fn of program.declarations) {
    const symbol: RenameSymbol = { kind: 'function', name: fn.name, occurrences: [] }
    addOccurrence(symbol, findFunctionNameToken(cursor, fn))
    functions.set(fn.name, symbol)
    symbols.push(symbol)
  }

  for (const struct of program.structs ?? []) {
    for (const field of struct.fields) {
      const symbol: RenameSymbol = {
        kind: 'field',
        name: field.name,
        structName: struct.name,
        occurrences: [],
      }
      addOccurrence(symbol, fieldDeclTokens.get(`${struct.name}.${field.name}`) ?? null)
      fieldSymbols.set(`${struct.name}.${field.name}`, symbol)
      symbols.push(symbol)
    }
  }

  function walkBlock(block: Block, scope: Scope, currentFn: FnDecl): void {
    for (const stmt of block) walkStmt(stmt, scope, currentFn)
  }

  function bindLocal(name: string, type: TypeNode | undefined, token: Token | null, scope: Scope): RenameSymbol {
    const symbol: RenameSymbol = { kind: 'local', name, occurrences: [] }
    addOccurrence(symbol, token)
    scope.locals.set(name, symbol)
    if (type) scope.types.set(name, type)
    symbols.push(symbol)
    return symbol
  }

  function walkPattern(pattern: MatchPattern, scope: Scope, currentFn: FnDecl | null): void {
    if (pattern.kind === 'PatSome') {
      bindLocal(pattern.binding, undefined, null, scope)
    } else if (pattern.kind === 'PatEnum') {
      for (const binding of pattern.bindings) bindLocal(binding, undefined, null, scope)
    } else if (pattern.kind === 'PatExpr') {
      walkExpr(pattern.expr, scope, null, currentFn!)
    }
  }

  function walkStmt(stmt: Stmt, scope: Scope, currentFn: FnDecl): void {
    switch (stmt.kind) {
      case 'let': {
        walkExpr(stmt.init, scope, stmt.type ? typeNameOf(stmt.type, program) : null, currentFn)
        const inferredType = stmt.type ?? (() => {
          const inferredStruct = resolveExprStructName(stmt.init, scope, program, currentFn)
          return inferredStruct ? { kind: 'struct', name: inferredStruct } as TypeNode : undefined
        })()
        bindLocal(stmt.name, inferredType, findDeclarationNameToken(cursor, stmt), scope)
        return
      }
      case 'const_decl':
        walkExpr(stmt.value, scope, null, currentFn)
        bindLocal(stmt.name, stmt.type, findDeclarationNameToken(cursor, stmt), scope)
        return
      case 'let_destruct':
        walkExpr(stmt.init, scope, null, currentFn)
        for (const name of stmt.names) bindLocal(name, stmt.type, null, scope)
        return
      case 'expr':
        walkExpr(stmt.expr, scope, null, currentFn)
        return
      case 'return':
        if (stmt.value) walkExpr(stmt.value, scope, typeNameOf(currentFn.returnType, program), currentFn)
        return
      case 'if':
        walkExpr(stmt.cond, scope, null, currentFn)
        walkBlock(stmt.then, makeScope(scope), currentFn)
        if (stmt.else_) walkBlock(stmt.else_, makeScope(scope), currentFn)
        return
      case 'while':
      case 'do_while':
        walkExpr(stmt.cond, scope, null, currentFn)
        walkBlock(stmt.body, makeScope(scope), currentFn)
        return
      case 'repeat':
      case 'as_block':
      case 'at_block':
      case 'as_at':
      case 'execute':
        walkBlock(stmt.body, makeScope(scope), currentFn)
        return
      case 'for': {
        const forScope = makeScope(scope)
        if (stmt.init) walkStmt(stmt.init, forScope, currentFn)
        walkExpr(stmt.cond, forScope, null, currentFn)
        walkExpr(stmt.step, forScope, null, currentFn)
        walkBlock(stmt.body, forScope, currentFn)
        return
      }
      case 'foreach': {
        walkExpr(stmt.iterable, scope, null, currentFn)
        const foreachScope = makeScope(scope)
        bindLocal(stmt.binding, undefined, null, foreachScope)
        walkBlock(stmt.body, foreachScope, currentFn)
        return
      }
      case 'for_range': {
        walkExpr(stmt.start, scope, null, currentFn)
        walkExpr(stmt.end, scope, null, currentFn)
        const forScope = makeScope(scope)
        bindLocal(stmt.varName, { kind: 'named', name: 'int' }, findBindingToken(cursor, stmt, stmt.varName), forScope)
        walkBlock(stmt.body, forScope, currentFn)
        return
      }
      case 'for_each': {
        walkExpr(stmt.array, scope, null, currentFn)
        const forScope = makeScope(scope)
        bindLocal(stmt.binding, undefined, null, forScope)
        walkBlock(stmt.body, forScope, currentFn)
        return
      }
      case 'for_in_array': {
        const forScope = makeScope(scope)
        bindLocal(stmt.binding, undefined, null, forScope)
        walkExpr(stmt.lenExpr, forScope, null, currentFn)
        walkBlock(stmt.body, forScope, currentFn)
        return
      }
      case 'match':
        walkExpr(stmt.expr, scope, null, currentFn)
        for (const arm of stmt.arms) {
          const armScope = makeScope(scope)
          walkPattern(arm.pattern, armScope, currentFn)
          walkBlock(arm.body, armScope, currentFn)
        }
        return
      case 'if_let_some': {
        walkExpr(stmt.init, scope, null, currentFn)
        const thenScope = makeScope(scope)
        bindLocal(stmt.binding, undefined, null, thenScope)
        walkBlock(stmt.then, thenScope, currentFn)
        if (stmt.else_) walkBlock(stmt.else_, makeScope(scope), currentFn)
        return
      }
      case 'while_let_some': {
        walkExpr(stmt.init, scope, null, currentFn)
        const whileScope = makeScope(scope)
        bindLocal(stmt.binding, undefined, null, whileScope)
        walkBlock(stmt.body, whileScope, currentFn)
        return
      }
      case 'labeled_loop':
        walkStmt(stmt.body, makeScope(scope), currentFn)
        return
      default:
        return
    }
  }

  function walkExpr(expr: Expr, scope: Scope, expectedStructName: string | null, currentFn: FnDecl): void {
    switch (expr.kind) {
      case 'ident':
        addOccurrence(resolveLocal(scope, expr.name), expr.span ? cursor.tokens[findTokenIndex(cursor, expr.span.line, expr.span.col)] ?? null : null)
        return
      case 'assign':
        addOccurrence(resolveLocal(scope, expr.target), expr.span ? cursor.tokens[findTokenIndex(cursor, expr.span.line, expr.span.col)] ?? null : null)
        walkExpr(expr.value, scope, null, currentFn)
        return
      case 'call':
        addOccurrence(functions.get(expr.fn) ?? null, expr.span ? cursor.tokens[findTokenIndex(cursor, expr.span.line, expr.span.col)] ?? null : null)
        for (const arg of expr.args) walkExpr(arg, scope, null, currentFn)
        return
      case 'member': {
        walkExpr(expr.obj, scope, null, currentFn)
        const structName = resolveExprStructName(expr.obj, scope, program, currentFn)
        addOccurrence(structName ? fieldSymbols.get(`${structName}.${expr.field}`) ?? null : null, findFieldAccessToken(cursor, expr))
        return
      }
      case 'member_assign': {
        walkExpr(expr.obj, scope, null, currentFn)
        const structName = resolveExprStructName(expr.obj, scope, program, currentFn)
        addOccurrence(structName ? fieldSymbols.get(`${structName}.${expr.field}`) ?? null : null, findFieldAccessToken(cursor, expr))
        walkExpr(expr.value, scope, structName ? typeNameOf(program.structs?.find(struct => struct.name === structName)?.fields.find(field => field.name === expr.field)?.type, program) : null, currentFn)
        return
      }
      case 'struct_lit': {
        const structName = expectedStructName
        if (structName) {
          expr.fields.forEach((field, index) => {
            addOccurrence(fieldSymbols.get(`${structName}.${field.name}`) ?? null, findStructLiteralFieldToken(cursor, expr, field.name, index))
            const fieldType = program.structs?.find(struct => struct.name === structName)?.fields.find(candidate => candidate.name === field.name)?.type
            walkExpr(field.value, scope, typeNameOf(fieldType, program), currentFn)
          })
        } else {
          for (const field of expr.fields) walkExpr(field.value, scope, null, currentFn)
        }
        return
      }
      case 'binary':
        walkExpr(expr.left, scope, null, currentFn)
        walkExpr(expr.right, scope, null, currentFn)
        return
      case 'unary':
      case 'type_cast':
        walkExpr(expr.kind === 'unary' ? expr.operand : expr.expr, scope, null, currentFn)
        return
      case 'invoke':
        walkExpr(expr.callee, scope, null, currentFn)
        for (const arg of expr.args) walkExpr(arg, scope, null, currentFn)
        return
      case 'index':
        walkExpr(expr.obj, scope, null, currentFn)
        walkExpr(expr.index, scope, null, currentFn)
        return
      case 'index_assign':
        walkExpr(expr.obj, scope, null, currentFn)
        walkExpr(expr.index, scope, null, currentFn)
        walkExpr(expr.value, scope, null, currentFn)
        return
      case 'array_lit':
      case 'tuple_lit':
        for (const item of expr.elements) walkExpr(item, scope, null, currentFn)
        return
      case 'enum_construct':
        for (const arg of expr.args) walkExpr(arg.value, scope, null, currentFn)
        return
      case 'some_lit':
        walkExpr(expr.value, scope, null, currentFn)
        return
      case 'unwrap_or':
        walkExpr(expr.opt, scope, null, currentFn)
        walkExpr(expr.default_, scope, null, currentFn)
        return
      case 'str_interp':
        for (const part of expr.parts) {
          if (typeof part !== 'string') walkExpr(part, scope, null, currentFn)
        }
        return
      case 'f_string':
        for (const part of expr.parts) {
          if (part.kind === 'expr') walkExpr(part.expr, scope, null, currentFn)
        }
        return
      case 'lambda': {
        const lambdaScope = makeScope(scope)
        let fromIndex = expr.span ? findTokenIndex(cursor, expr.span.line, expr.span.col) : -1
        for (const param of expr.params) {
          const token = findParamToken(cursor, currentFn, param.name, fromIndex + 1)
          if (token) fromIndex = cursor.tokens.indexOf(token)
          bindLocal(param.name, param.type, token, lambdaScope)
        }
        if (Array.isArray(expr.body)) walkBlock(expr.body, lambdaScope, currentFn)
        else walkExpr(expr.body, lambdaScope, null, currentFn)
        return
      }
      default:
        return
    }
  }

  for (const fn of program.declarations) {
    const rootScope = makeScope(null)
    let fromIndex = (findFunctionNameToken(cursor, fn) && cursor.tokens.indexOf(findFunctionNameToken(cursor, fn)!)) || -1
    for (const param of fn.params) {
      const token = findParamToken(cursor, fn, param.name, fromIndex + 1)
      if (token) fromIndex = cursor.tokens.indexOf(token)
      bindLocal(param.name, param.type, token, rootScope)
    }
    walkBlock(fn.body, rootScope, fn)
  }

  return symbols
}

export function findRenameRanges(source: string, program: Program, position: Position): Range[] {
  const doc = TextDocument.create('file:///rename.mcrs', 'redscript', 1, source)
  const symbols = buildRenameIndex(source, program)
  const symbol = symbols.find(candidate => candidate.occurrences.some(token => containsPosition(token, position)))
  if (!symbol) return []
  return symbol.occurrences
    .slice()
    .sort((a, b) => (a.line - b.line) || (a.col - b.col))
    .map(token => tokenToRange(doc, token))
}

export function buildRenameWorkspaceEdit(
  doc: TextDocument,
  program: Program,
  position: Position,
  newName: string,
): WorkspaceEdit | null {
  const ranges = findRenameRanges(doc.getText(), program, position)
  if (ranges.length === 0) return null
  return {
    changes: {
      [doc.uri]: ranges.map(range => ({ range, newText: newName })),
    },
  }
}
