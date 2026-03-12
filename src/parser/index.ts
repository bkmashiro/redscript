/**
 * RedScript Parser
 *
 * Recursive descent parser that converts tokens into an AST.
 * Uses precedence climbing for expression parsing.
 */

import type { Token, TokenKind } from '../lexer'
import type {
  Block, Decorator, EntitySelector, Expr, FnDecl, Param,
  Program, RangeExpr, SelectorFilter, SelectorKind, Stmt, TypeNode, AssignOp,
  StructDecl, StructField, ExecuteSubcommand
} from '../ast/types'
import type { BinOp, CmpOp } from '../ir/types'
import { DiagnosticError } from '../diagnostics'

// ---------------------------------------------------------------------------
// Operator Precedence (higher = binds tighter)
// ---------------------------------------------------------------------------

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
}

const BINARY_OPS = new Set(['||', '&&', '==', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/', '%'])

// ---------------------------------------------------------------------------
// Parser Class
// ---------------------------------------------------------------------------

export class Parser {
  private tokens: Token[]
  private pos: number = 0
  private sourceLines: string[]
  private filePath?: string

  constructor(tokens: Token[], source?: string, filePath?: string) {
    this.tokens = tokens
    this.sourceLines = source?.split('\n') ?? []
    this.filePath = filePath
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private peek(offset = 0): Token {
    const idx = this.pos + offset
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1] // eof
    }
    return this.tokens[idx]
  }

  private advance(): Token {
    const token = this.tokens[this.pos]
    if (token.kind !== 'eof') this.pos++
    return token
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind
  }

  private match(...kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance()
        return true
      }
    }
    return false
  }

  private expect(kind: TokenKind): Token {
    const token = this.peek()
    if (token.kind !== kind) {
      throw new DiagnosticError(
        'ParseError',
        `Expected '${kind}' but got '${token.kind}'`,
        { file: this.filePath, line: token.line, col: token.col },
        this.sourceLines
      )
    }
    return this.advance()
  }

  private error(message: string): never {
    const token = this.peek()
    throw new DiagnosticError(
      'ParseError',
      message,
      { file: this.filePath, line: token.line, col: token.col },
      this.sourceLines
    )
  }

  // -------------------------------------------------------------------------
  // Program
  // -------------------------------------------------------------------------

  parse(defaultNamespace = 'redscript'): Program {
    let namespace = defaultNamespace
    const declarations: FnDecl[] = []
    const structs: StructDecl[] = []

    // Check for namespace declaration
    if (this.check('namespace')) {
      this.advance()
      const name = this.expect('ident')
      namespace = name.value
      this.expect(';')
    }

    // Parse struct and function declarations
    while (!this.check('eof')) {
      if (this.check('struct')) {
        structs.push(this.parseStructDecl())
      } else {
        declarations.push(this.parseFnDecl())
      }
    }

    return { namespace, declarations, structs }
  }

  // -------------------------------------------------------------------------
  // Struct Declaration
  // -------------------------------------------------------------------------

  private parseStructDecl(): StructDecl {
    this.expect('struct')
    const name = this.expect('ident').value
    this.expect('{')

    const fields: StructField[] = []
    while (!this.check('}') && !this.check('eof')) {
      const fieldName = this.expect('ident').value
      this.expect(':')
      const fieldType = this.parseType()
      fields.push({ name: fieldName, type: fieldType })

      // Allow optional comma or semicolon between fields
      this.match(',')
    }

    this.expect('}')
    return { name, fields }
  }

  // -------------------------------------------------------------------------
  // Function Declaration
  // -------------------------------------------------------------------------

  private parseFnDecl(): FnDecl {
    const decorators = this.parseDecorators()

    this.expect('fn')
    const name = this.expect('ident').value
    this.expect('(')
    const params = this.parseParams()
    this.expect(')')

    let returnType: TypeNode = { kind: 'named', name: 'void' }
    if (this.match('->')) {
      returnType = this.parseType()
    }

    const body = this.parseBlock()

    return { name, params, returnType, decorators, body }
  }

  private parseDecorators(): Decorator[] {
    const decorators: Decorator[] = []

    while (this.check('decorator')) {
      const token = this.advance()
      const decorator = this.parseDecoratorValue(token.value)
      decorators.push(decorator)
    }

    return decorators
  }

  private parseDecoratorValue(value: string): Decorator {
    // Parse @tick or @tick(rate=20) or @on_trigger("name")
    const match = value.match(/^@(\w+)(?:\(([^)]*)\))?$/)
    if (!match) {
      this.error(`Invalid decorator: ${value}`)
    }

    const name = match[1] as 'tick' | 'on_trigger'
    const argsStr = match[2]

    if (!argsStr) {
      return { name }
    }

    const args: Decorator['args'] = {}

    // Handle @on_trigger("name") format - just a string literal
    if (name === 'on_trigger') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) {
        args.trigger = strMatch[1]
        return { name, args }
      }
    }

    // Handle key=value format (e.g., rate=20)
    for (const part of argsStr.split(',')) {
      const [key, val] = part.split('=').map(s => s.trim())
      if (key === 'rate') {
        args.rate = parseInt(val, 10)
      } else if (key === 'trigger') {
        args.trigger = val
      }
    }

    return { name, args }
  }

  private parseParams(): Param[] {
    const params: Param[] = []

    if (!this.check(')')) {
      do {
        const name = this.expect('ident').value
        this.expect(':')
        const type = this.parseType()
        params.push({ name, type })
      } while (this.match(','))
    }

    return params
  }

  private parseType(): TypeNode {
    const token = this.peek()
    let type: TypeNode

    if (token.kind === 'int' || token.kind === 'bool' ||
        token.kind === 'float' || token.kind === 'string' || token.kind === 'void') {
      this.advance()
      type = { kind: 'named', name: token.kind }
    } else if (token.kind === 'ident') {
      this.advance()
      type = { kind: 'struct', name: token.value }
    } else {
      this.error(`Expected type, got '${token.kind}'`)
    }

    while (this.match('[')) {
      this.expect(']')
      type = { kind: 'array', elem: type }
    }

    return type
  }

  // -------------------------------------------------------------------------
  // Block & Statements
  // -------------------------------------------------------------------------

  private parseBlock(): Block {
    this.expect('{')
    const stmts: Stmt[] = []

    while (!this.check('}') && !this.check('eof')) {
      stmts.push(this.parseStmt())
    }

    this.expect('}')
    return stmts
  }

  private parseStmt(): Stmt {
    // Let statement
    if (this.check('let')) {
      return this.parseLetStmt()
    }

    // Return statement
    if (this.check('return')) {
      return this.parseReturnStmt()
    }

    // If statement
    if (this.check('if')) {
      return this.parseIfStmt()
    }

    // While statement
    if (this.check('while')) {
      return this.parseWhileStmt()
    }

    // For statement
    if (this.check('for')) {
      return this.parseForStmt()
    }

    // Foreach statement
    if (this.check('foreach')) {
      return this.parseForeachStmt()
    }

    // As block
    if (this.check('as')) {
      return this.parseAsStmt()
    }

    // At block
    if (this.check('at')) {
      return this.parseAtStmt()
    }

    // Execute statement: execute as/at/if/unless/in ... run { }
    if (this.check('execute')) {
      return this.parseExecuteStmt()
    }

    // Raw command
    if (this.check('raw_cmd')) {
      const cmd = this.advance().value
      this.match(';') // optional semicolon (raw consumes it)
      return { kind: 'raw', cmd }
    }

    // Expression statement
    return this.parseExprStmt()
  }

  private parseLetStmt(): Stmt {
    this.expect('let')
    const name = this.expect('ident').value

    let type: TypeNode | undefined
    if (this.match(':')) {
      type = this.parseType()
    }

    this.expect('=')
    const init = this.parseExpr()
    this.expect(';')

    return { kind: 'let', name, type, init }
  }

  private parseReturnStmt(): Stmt {
    this.expect('return')

    let value: Expr | undefined
    if (!this.check(';')) {
      value = this.parseExpr()
    }

    this.expect(';')
    return { kind: 'return', value }
  }

  private parseIfStmt(): Stmt {
    this.expect('if')
    this.expect('(')
    const cond = this.parseExpr()
    this.expect(')')
    const then = this.parseBlock()

    let else_: Block | undefined
    if (this.match('else')) {
      if (this.check('if')) {
        // else if
        else_ = [this.parseIfStmt()]
      } else {
        else_ = this.parseBlock()
      }
    }

    return { kind: 'if', cond, then, else_ }
  }

  private parseWhileStmt(): Stmt {
    this.expect('while')
    this.expect('(')
    const cond = this.parseExpr()
    this.expect(')')
    const body = this.parseBlock()

    return { kind: 'while', cond, body }
  }

  private parseForStmt(): Stmt {
    this.expect('for')
    this.expect('(')

    // Init: either let statement (without semicolon) or empty
    let init: Stmt | undefined
    if (this.check('let')) {
      // Parse let without consuming semicolon here (we handle it)
      this.expect('let')
      const name = this.expect('ident').value
      let type: TypeNode | undefined
      if (this.match(':')) {
        type = this.parseType()
      }
      this.expect('=')
      const initExpr = this.parseExpr()
      init = { kind: 'let', name, type, init: initExpr }
    }
    this.expect(';')

    // Condition
    const cond = this.parseExpr()
    this.expect(';')

    // Step expression
    const step = this.parseExpr()
    this.expect(')')

    const body = this.parseBlock()

    return { kind: 'for', init, cond, step, body }
  }

  private parseForeachStmt(): Stmt {
    this.expect('foreach')
    this.expect('(')
    const binding = this.expect('ident').value
    this.expect('in')
    const iterable = this.parseExpr()
    this.expect(')')
    const body = this.parseBlock()

    return { kind: 'foreach', binding, iterable, body }
  }

  private parseAsStmt(): Stmt {
    this.expect('as')
    const as_sel = this.parseSelector()

    // Check for combined as/at
    if (this.match('at')) {
      const at_sel = this.parseSelector()
      const body = this.parseBlock()
      return { kind: 'as_at', as_sel, at_sel, body }
    }

    const body = this.parseBlock()
    return { kind: 'as_block', selector: as_sel, body }
  }

  private parseAtStmt(): Stmt {
    this.expect('at')
    const selector = this.parseSelector()
    const body = this.parseBlock()
    return { kind: 'at_block', selector, body }
  }

  private parseExecuteStmt(): Stmt {
    this.expect('execute')
    const subcommands: ExecuteSubcommand[] = []

    // Parse subcommands until we hit 'run'
    while (!this.check('run') && !this.check('eof')) {
      if (this.match('as')) {
        const selector = this.parseSelector()
        subcommands.push({ kind: 'as', selector })
      } else if (this.match('at')) {
        const selector = this.parseSelector()
        subcommands.push({ kind: 'at', selector })
      } else if (this.match('if')) {
        // Expect 'entity' keyword (as ident) or just parse selector directly
        if (this.peek().kind === 'ident' && this.peek().value === 'entity') {
          this.advance() // consume 'entity'
        }
        const selector = this.parseSelector()
        subcommands.push({ kind: 'if_entity', selector })
      } else if (this.match('unless')) {
        // Expect 'entity' keyword (as ident) or just parse selector directly  
        if (this.peek().kind === 'ident' && this.peek().value === 'entity') {
          this.advance() // consume 'entity'
        }
        const selector = this.parseSelector()
        subcommands.push({ kind: 'unless_entity', selector })
      } else if (this.match('in')) {
        const dim = this.expect('ident').value
        subcommands.push({ kind: 'in', dimension: dim })
      } else {
        this.error(`Unexpected token in execute statement: ${this.peek().kind}`)
      }
    }

    this.expect('run')
    const body = this.parseBlock()

    return { kind: 'execute', subcommands, body }
  }

  private parseExprStmt(): Stmt {
    const expr = this.parseExpr()
    this.expect(';')
    return { kind: 'expr', expr }
  }

  // -------------------------------------------------------------------------
  // Expressions (Precedence Climbing)
  // -------------------------------------------------------------------------

  private parseExpr(): Expr {
    return this.parseAssignment()
  }

  private parseAssignment(): Expr {
    const left = this.parseBinaryExpr(1)

    // Check for assignment
    const token = this.peek()
    if (token.kind === '=' || token.kind === '+=' || token.kind === '-=' ||
        token.kind === '*=' || token.kind === '/=' || token.kind === '%=') {
      const op = this.advance().kind as AssignOp

      if (left.kind === 'ident') {
        const value = this.parseAssignment()
        return { kind: 'assign', target: left.name, op, value }
      }

      // Member assignment: p.x = 10, p.x += 5
      if (left.kind === 'member') {
        const value = this.parseAssignment()
        return { kind: 'member_assign', obj: left.obj, field: left.field, op, value }
      }
    }

    return left
  }

  private parseBinaryExpr(minPrec: number): Expr {
    let left = this.parseUnaryExpr()

    while (true) {
      const op = this.peek().kind
      if (!BINARY_OPS.has(op)) break

      const prec = PRECEDENCE[op]
      if (prec < minPrec) break

      this.advance()
      const right = this.parseBinaryExpr(prec + 1) // left associative
      left = { kind: 'binary', op: op as BinOp | CmpOp | '&&' | '||', left, right }
    }

    return left
  }

  private parseUnaryExpr(): Expr {
    if (this.match('!')) {
      const operand = this.parseUnaryExpr()
      return { kind: 'unary', op: '!', operand }
    }

    if (this.check('-') && !this.isSubtraction()) {
      this.advance()
      const operand = this.parseUnaryExpr()
      return { kind: 'unary', op: '-', operand }
    }

    return this.parsePostfixExpr()
  }

  private isSubtraction(): boolean {
    // Check if this minus is binary (subtraction) by looking at previous token
    // If previous was a value (literal, ident, ), ]) it's subtraction
    if (this.pos === 0) return false
    const prev = this.tokens[this.pos - 1]
    return ['int_lit', 'float_lit', 'ident', ')', ']'].includes(prev.kind)
  }

  private parsePostfixExpr(): Expr {
    let expr = this.parsePrimaryExpr()

    while (true) {
      // Function call
      if (this.match('(')) {
        if (expr.kind === 'ident') {
          const args = this.parseArgs()
          this.expect(')')
          expr = { kind: 'call', fn: expr.name, args }
          continue
        }
        // Member call: entity.tag("name") → __entity_tag(entity, "name")
        // Also handle arr.push(val) and arr.length
        if (expr.kind === 'member') {
          const methodMap: Record<string, string> = {
            'tag': '__entity_tag',
            'untag': '__entity_untag',
            'has_tag': '__entity_has_tag',
            'push': '__array_push',
            'pop': '__array_pop',
          }
          const internalFn = methodMap[expr.field]
          if (internalFn) {
            const args = this.parseArgs()
            this.expect(')')
            expr = { kind: 'call', fn: internalFn, args: [expr.obj, ...args] }
            continue
          }
          this.error(`Unknown method '${expr.field}'`)
        }
        this.error('Expected function name before (')
      }

      // Array index access: arr[0]
      if (this.match('[')) {
        const index = this.parseExpr()
        this.expect(']')
        expr = { kind: 'index', obj: expr, index }
        continue
      }

      // Member access
      if (this.match('.')) {
        const field = this.expect('ident').value
        expr = { kind: 'member', obj: expr, field }
        continue
      }

      break
    }

    return expr
  }

  private parseArgs(): Expr[] {
    const args: Expr[] = []

    if (!this.check(')')) {
      do {
        args.push(this.parseExpr())
      } while (this.match(','))
    }

    return args
  }

  private parsePrimaryExpr(): Expr {
    const token = this.peek()

    // Integer literal
    if (token.kind === 'int_lit') {
      this.advance()
      return { kind: 'int_lit', value: parseInt(token.value, 10) }
    }

    // Float literal
    if (token.kind === 'float_lit') {
      this.advance()
      return { kind: 'float_lit', value: parseFloat(token.value) }
    }

    // String literal
    if (token.kind === 'string_lit') {
      this.advance()
      return { kind: 'str_lit', value: token.value }
    }

    // Boolean literal
    if (token.kind === 'true') {
      this.advance()
      return { kind: 'bool_lit', value: true }
    }
    if (token.kind === 'false') {
      this.advance()
      return { kind: 'bool_lit', value: false }
    }

    // Range literal
    if (token.kind === 'range_lit') {
      this.advance()
      return { kind: 'range_lit', range: this.parseRangeValue(token.value) }
    }

    // Selector
    if (token.kind === 'selector') {
      this.advance()
      return { kind: 'selector', sel: this.parseSelectorValue(token.value) }
    }

    // Identifier
    if (token.kind === 'ident') {
      this.advance()
      return { kind: 'ident', name: token.value }
    }

    // Grouped expression
    if (token.kind === '(') {
      this.advance()
      const expr = this.parseExpr()
      this.expect(')')
      return expr
    }

    // Struct literal or block: { x: 10, y: 20 }
    if (token.kind === '{') {
      return this.parseStructLit()
    }

    // Array literal: [1, 2, 3] or []
    if (token.kind === '[') {
      return this.parseArrayLit()
    }

    this.error(`Unexpected token '${token.kind}'`)
  }

  private parseStructLit(): Expr {
    this.expect('{')
    const fields: { name: string; value: Expr }[] = []

    if (!this.check('}')) {
      do {
        const name = this.expect('ident').value
        this.expect(':')
        const value = this.parseExpr()
        fields.push({ name, value })
      } while (this.match(','))
    }

    this.expect('}')
    return { kind: 'struct_lit', fields }
  }

  private parseArrayLit(): Expr {
    this.expect('[')
    const elements: Expr[] = []

    if (!this.check(']')) {
      do {
        elements.push(this.parseExpr())
      } while (this.match(','))
    }

    this.expect(']')
    return { kind: 'array_lit', elements }
  }

  // -------------------------------------------------------------------------
  // Selector Parsing
  // -------------------------------------------------------------------------

  private parseSelector(): EntitySelector {
    const token = this.expect('selector')
    return this.parseSelectorValue(token.value)
  }

  private parseSelectorValue(value: string): EntitySelector {
    // Parse @e[type=zombie, distance=..5]
    const bracketIndex = value.indexOf('[')
    if (bracketIndex === -1) {
      return { kind: value as SelectorKind }
    }

    const kind = value.slice(0, bracketIndex) as SelectorKind
    const paramsStr = value.slice(bracketIndex + 1, -1) // Remove [ and ]
    const filters = this.parseSelectorFilters(paramsStr)

    return { kind, filters }
  }

  private parseSelectorFilters(paramsStr: string): SelectorFilter {
    const filters: SelectorFilter = {}
    const parts = this.splitSelectorParams(paramsStr)

    for (const part of parts) {
      const eqIndex = part.indexOf('=')
      if (eqIndex === -1) continue

      const key = part.slice(0, eqIndex).trim()
      const val = part.slice(eqIndex + 1).trim()

      switch (key) {
        case 'type':
          filters.type = val
          break
        case 'distance':
          filters.distance = this.parseRangeValue(val)
          break
        case 'tag':
          if (val.startsWith('!')) {
            filters.notTag = filters.notTag ?? []
            filters.notTag.push(val.slice(1))
          } else {
            filters.tag = filters.tag ?? []
            filters.tag.push(val)
          }
          break
        case 'limit':
          filters.limit = parseInt(val, 10)
          break
        case 'sort':
          filters.sort = val as SelectorFilter['sort']
          break
        case 'nbt':
          filters.nbt = val
          break
        case 'gamemode':
          filters.gamemode = val
          break
        case 'scores':
          filters.scores = this.parseScoresFilter(val)
          break
      }
    }

    return filters
  }

  private splitSelectorParams(str: string): string[] {
    const parts: string[] = []
    let current = ''
    let depth = 0

    for (const char of str) {
      if (char === '{' || char === '[') depth++
      else if (char === '}' || char === ']') depth--
      else if (char === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }
      current += char
    }

    if (current.trim()) {
      parts.push(current.trim())
    }

    return parts
  }

  private parseScoresFilter(val: string): Record<string, RangeExpr> {
    // Parse {kills=1.., deaths=..5}
    const scores: Record<string, RangeExpr> = {}
    const inner = val.slice(1, -1) // Remove { and }
    const parts = inner.split(',')

    for (const part of parts) {
      const [name, range] = part.split('=').map(s => s.trim())
      scores[name] = this.parseRangeValue(range)
    }

    return scores
  }

  private parseRangeValue(value: string): RangeExpr {
    // ..5 → { max: 5 }
    // 1.. → { min: 1 }
    // 1..10 → { min: 1, max: 10 }
    // 5 → { min: 5, max: 5 } (exact match)

    if (value.startsWith('..')) {
      const max = parseInt(value.slice(2), 10)
      return { max }
    }

    if (value.endsWith('..')) {
      const min = parseInt(value.slice(0, -2), 10)
      return { min }
    }

    const dotIndex = value.indexOf('..')
    if (dotIndex !== -1) {
      const min = parseInt(value.slice(0, dotIndex), 10)
      const max = parseInt(value.slice(dotIndex + 2), 10)
      return { min, max }
    }

    // Exact value
    const val = parseInt(value, 10)
    return { min: val, max: val }
  }
}
