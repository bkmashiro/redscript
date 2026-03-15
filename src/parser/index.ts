/**
 * RedScript Parser
 *
 * Recursive descent parser that converts tokens into an AST.
 * Uses precedence climbing for expression parsing.
 */

import { Lexer, type Token, type TokenKind } from '../lexer'
import type {
  Block, ConstDecl, Decorator, EntitySelector, Expr, FnDecl, GlobalDecl, LiteralExpr, Param,
  Program, RangeExpr, SelectorFilter, SelectorKind, Span, Stmt, TypeNode, AssignOp,
  StructDecl, StructField, ExecuteSubcommand, EnumDecl, EnumVariant, BlockPosExpr, ImplBlock,
  CoordComponent, LambdaParam, EntityTypeName
} from '../ast/types'
import type { BinOp, CmpOp } from '../ast/types'
import { DiagnosticError } from '../diagnostics'

// ---------------------------------------------------------------------------
// Operator Precedence (higher = binds tighter)
// ---------------------------------------------------------------------------

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4, 'is': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
}

const BINARY_OPS = new Set(['||', '&&', '==', '!=', '<', '<=', '>', '>=', 'is', '+', '-', '*', '/', '%'])

const ENTITY_TYPE_NAMES = new Set<EntityTypeName>([
  'entity',
  'Player',
  'Mob',
  'HostileMob',
  'PassiveMob',
  'Zombie',
  'Skeleton',
  'Creeper',
  'Spider',
  'Enderman',
  'Blaze',
  'Witch',
  'Slime',
  'ZombieVillager',
  'Husk',
  'Drowned',
  'Stray',
  'WitherSkeleton',
  'CaveSpider',
  'Pig',
  'Cow',
  'Sheep',
  'Chicken',
  'Villager',
  'WanderingTrader',
  'ArmorStand',
  'Item',
  'Arrow',
])

function computeIsSingle(raw: string): boolean {
  if (/^@[spr](\[|$)/.test(raw)) return true
  if (/[\[,\s]limit=1[,\]\s]/.test(raw)) return true
  return false
}

// ---------------------------------------------------------------------------
// Parser Class
// ---------------------------------------------------------------------------

export class Parser {
  private tokens: Token[]
  private pos: number = 0
  private sourceLines: string[]
  private filePath?: string
  /** Set to true once `module library;` is seen — all subsequent fn declarations
   *  will be marked isLibraryFn=true.  When library sources are parsed via the
   *  `librarySources` compile option, each source is parsed by its own fresh
   *  Parser instance, so this flag never bleeds into user code. */
  private inLibraryMode: boolean = false

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

  private withLoc<T extends object>(node: T, token: Token): T {
    const span: Span = { line: token.line, col: token.col }
    Object.defineProperty(node, 'span', {
      value: span,
      enumerable: false,
      configurable: true,
      writable: true,
    })
    return node
  }

  private getLocToken(node: object): Token | null {
    const span = (node as { span?: Span }).span
    if (!span) {
      return null
    }
    return { kind: 'eof', value: '', line: span.line, col: span.col }
  }

  // -------------------------------------------------------------------------
  // Program
  // -------------------------------------------------------------------------

  parse(defaultNamespace = 'redscript'): Program {
    let namespace = defaultNamespace
    const globals: GlobalDecl[] = []
    const declarations: FnDecl[] = []
    const structs: StructDecl[] = []
    const implBlocks: ImplBlock[] = []
    const enums: EnumDecl[] = []
    const consts: ConstDecl[] = []
    let isLibrary = false

    // Check for namespace declaration
    if (this.check('namespace')) {
      this.advance()
      const name = this.expect('ident')
      namespace = name.value
      this.expect(';')
    }

    // Check for module declaration: `module library;`
    // Library-mode: all functions parsed from this point are marked isLibraryFn=true.
    // When using the `librarySources` compile option, each library source is parsed
    // by its own fresh Parser — so this flag never bleeds into user code.
    if (this.check('module')) {
      this.advance()
      const modKind = this.expect('ident')
      if (modKind.value === 'library') {
        isLibrary = true
        this.inLibraryMode = true
      }
      this.expect(';')
    }

    // Parse struct and function declarations
    while (!this.check('eof')) {
      if (this.check('let')) {
        globals.push(this.parseGlobalDecl(true))
      } else if (this.check('struct')) {
        structs.push(this.parseStructDecl())
      } else if (this.check('impl')) {
        implBlocks.push(this.parseImplBlock())
      } else if (this.check('enum')) {
        enums.push(this.parseEnumDecl())
      } else if (this.check('const')) {
        consts.push(this.parseConstDecl())
      } else if (this.check('declare')) {
        // Declaration-only stub (e.g. from builtins.d.mcrs) — parse and discard
        this.advance() // consume 'declare'
        this.parseDeclareStub()
      } else if (this.check('export')) {
        declarations.push(this.parseExportedFnDecl())
      } else {
        declarations.push(this.parseFnDecl())
      }
    }

    return { namespace, globals, declarations, structs, implBlocks, enums, consts, isLibrary }
  }

  // -------------------------------------------------------------------------
  // Struct Declaration
  // -------------------------------------------------------------------------

  private parseStructDecl(): StructDecl {
    const structToken = this.expect('struct')
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
    return this.withLoc({ name, fields }, structToken)
  }

  private parseEnumDecl(): EnumDecl {
    const enumToken = this.expect('enum')
    const name = this.expect('ident').value
    this.expect('{')

    const variants: EnumVariant[] = []
    let nextValue = 0

    while (!this.check('}') && !this.check('eof')) {
      const variantToken = this.expect('ident')
      const variant: EnumVariant = { name: variantToken.value }

      if (this.match('=')) {
        const valueToken = this.expect('int_lit')
        variant.value = parseInt(valueToken.value, 10)
        nextValue = variant.value + 1
      } else {
        variant.value = nextValue++
      }

      variants.push(variant)

      if (!this.match(',')) {
        break
      }
    }

    this.expect('}')
    return this.withLoc({ name, variants }, enumToken)
  }

  private parseImplBlock(): ImplBlock {
    const implToken = this.expect('impl')
    const typeName = this.expect('ident').value
    this.expect('{')

    const methods: FnDecl[] = []
    while (!this.check('}') && !this.check('eof')) {
      methods.push(this.parseFnDecl(typeName))
    }

    this.expect('}')
    return this.withLoc({ kind: 'impl_block', typeName, methods }, implToken)
  }

  private parseConstDecl(): ConstDecl {
    const constToken = this.expect('const')
    const name = this.expect('ident').value
    let type: TypeNode | undefined
    if (this.match(':')) {
      type = this.parseType()
    }
    this.expect('=')
    const value = this.parseLiteralExpr()
    this.match(';')
    // Infer type from value if not provided
    const inferredType: TypeNode = type ?? (
      value.kind === 'str_lit' ? { kind: 'named', name: 'string' } :
      value.kind === 'bool_lit' ? { kind: 'named', name: 'bool' } :
      value.kind === 'float_lit' ? { kind: 'named', name: 'float' } :
      { kind: 'named', name: 'int' }
    )
    return this.withLoc({ name, type: inferredType, value }, constToken)
  }

  private parseGlobalDecl(mutable: boolean): GlobalDecl {
    const token = this.advance() // consume 'let'
    const name = this.expect('ident').value
    this.expect(':')
    const type = this.parseType()
    this.expect('=')
    const init = this.parseExpr()
    this.expect(';')
    return this.withLoc({ kind: 'global', name, type, init, mutable }, token)
  }

  // -------------------------------------------------------------------------
  // Function Declaration
  // -------------------------------------------------------------------------

  /** Parse `export fn name(...)` — marks the function as exported (survives DCE). */
  private parseExportedFnDecl(): FnDecl {
    this.expect('export')
    const fn = this.parseFnDecl()
    fn.isExported = true
    return fn
  }

  private parseFnDecl(implTypeName?: string): FnDecl {
    const decorators = this.parseDecorators()

    // Map @keep decorator to isExported flag (backward compat)
    let isExported: boolean | undefined
    const filteredDecorators = decorators.filter(d => {
      if (d.name === 'keep') {
        isExported = true
        return false
      }
      return true
    })

    const fnToken = this.expect('fn')
    const name = this.expect('ident').value
    this.expect('(')
    const params = this.parseParams(implTypeName)
    this.expect(')')

    let returnType: TypeNode = { kind: 'named', name: 'void' }
    if (this.match('->') || this.match(':')) {
      returnType = this.parseType()
    }

    const body = this.parseBlock()

    const fn: import('../ast/types').FnDecl = this.withLoc(
      { name, params, returnType, decorators: filteredDecorators, body,
        isLibraryFn: this.inLibraryMode || undefined, isExported },
      fnToken,
    )
    return fn
  }

  /** Parse a `declare fn name(params): returnType;` stub — no body, just discard. */
  private parseDeclareStub(): void {
    this.expect('fn')
    this.expect('ident') // name
    this.expect('(')
    // consume params until ')'
    let depth = 1
    while (!this.check('eof') && depth > 0) {
      const t = this.advance()
      if (t.kind === '(') depth++
      else if (t.kind === ')') depth--
    }
    // optional return type annotation `: type` or `-> type`
    if (this.match(':') || this.match('->')) {
      this.parseType()
    }
    this.match(';') // consume trailing semicolon
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
    // Parse @tick, @on(PlayerDeath), or @on_trigger("name")
    const match = value.match(/^@(\w+)(?:\(([^)]*)\))?$/)
    if (!match) {
      this.error(`Invalid decorator: ${value}`)
    }

    const name = match[1] as Decorator['name']
    const argsStr = match[2]

    if (!argsStr) {
      return { name }
    }

    const args: Decorator['args'] = {}

    if (name === 'on') {
      const eventTypeMatch = argsStr.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)
      if (eventTypeMatch) {
        args.eventType = eventTypeMatch[1]
        return { name, args }
      }
    }

    // Handle @on_trigger("name"), @on_advancement("id"), @on_craft("item"), @on_join_team("team")
    if (name === 'on_trigger' || name === 'on_advancement' || name === 'on_craft' || name === 'on_join_team') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) {
        if (name === 'on_trigger') {
          args.trigger = strMatch[1]
        } else if (name === 'on_advancement') {
          args.advancement = strMatch[1]
        } else if (name === 'on_craft') {
          args.item = strMatch[1]
        } else if (name === 'on_join_team') {
          args.team = strMatch[1]
        }
        return { name, args }
      }
    }

    // @require_on_load(fn_name) — when this fn is used, fn_name is called from __load.
    // Accepts bare identifiers (with optional leading _) or quoted strings.
    if (name === 'require_on_load') {
      const rawArgs: NonNullable<Decorator['rawArgs']> = []
      for (const part of argsStr.split(',')) {
        const trimmed = part.trim()
        // Bare identifier: @require_on_load(_math_init)
        const identMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)
        if (identMatch) {
          rawArgs.push({ kind: 'string', value: identMatch[1] })
        } else {
          // Quoted string fallback: @require_on_load("_math_init")
          const strMatch = trimmed.match(/^"([^"]*)"$/)
          if (strMatch) {
            rawArgs.push({ kind: 'string', value: strMatch[1] })
          }
        }
      }
      return { name, rawArgs }
    }

    // Handle key=value format (e.g., rate=20)
    for (const part of argsStr.split(',')) {
      const [key, val] = part.split('=').map(s => s.trim())
      if (key === 'rate') {
        args.rate = parseInt(val, 10)
      } else if (key === 'trigger') {
        args.trigger = val
      } else if (key === 'advancement') {
        args.advancement = val
      } else if (key === 'item') {
        args.item = val
      } else if (key === 'team') {
        args.team = val
      }
    }

    return { name, args }
  }

  private parseParams(implTypeName?: string): Param[] {
    const params: Param[] = []

    if (!this.check(')')) {
      do {
        const paramToken = this.expect('ident')
        const name = paramToken.value
        let type: TypeNode
        if (implTypeName && params.length === 0 && name === 'self' && !this.check(':')) {
          type = { kind: 'struct', name: implTypeName }
        } else {
          this.expect(':')
          type = this.parseType()
        }
        let defaultValue: Expr | undefined
        if (this.match('=')) {
          defaultValue = this.parseExpr()
        }
        params.push(this.withLoc({ name, type, default: defaultValue }, paramToken))
      } while (this.match(','))
    }

    return params
  }

  private parseType(): TypeNode {
    const token = this.peek()
    let type: TypeNode

    if (token.kind === '(') {
      return this.parseFunctionType()
    }

    if (token.kind === 'int' || token.kind === 'bool' ||
        token.kind === 'float' || token.kind === 'string' || token.kind === 'void' ||
        token.kind === 'BlockPos') {
      this.advance()
      type = { kind: 'named', name: token.kind }
    } else if (token.kind === 'ident') {
      this.advance()
      if (token.value === 'selector' && this.check('<')) {
        this.advance() // consume <
        const entityType = this.expect('ident').value
        this.expect('>')
        type = { kind: 'selector', entityType }
      } else if (token.value === 'selector') {
        type = { kind: 'selector' }
      } else {
        type = { kind: 'struct', name: token.value }
      }
    } else {
      this.error(`Expected type, got '${token.kind}'`)
    }

    while (this.match('[')) {
      this.expect(']')
      type = { kind: 'array', elem: type }
    }

    return type
  }

  private parseFunctionType(): TypeNode {
    this.expect('(')
    const params: TypeNode[] = []

    if (!this.check(')')) {
      do {
        params.push(this.parseType())
      } while (this.match(','))
    }

    this.expect(')')
    this.expect('->')
    const returnType = this.parseType()
    return { kind: 'function_type', params, return: returnType }
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

    // Break statement
    if (this.check('break')) {
      const token = this.advance()
      this.match(';')
      return this.withLoc({ kind: 'break' }, token)
    }

    // Continue statement
    if (this.check('continue')) {
      const token = this.advance()
      this.match(';')
      return this.withLoc({ kind: 'continue' }, token)
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

    if (this.check('match')) {
      return this.parseMatchStmt()
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
      const token = this.advance()
      const cmd = token.value
      this.match(';') // optional semicolon (raw consumes it)
      return this.withLoc({ kind: 'raw', cmd }, token)
    }

    // Expression statement
    return this.parseExprStmt()
  }

  private parseLetStmt(): Stmt {
    const letToken = this.expect('let')
    const name = this.expect('ident').value

    let type: TypeNode | undefined
    if (this.match(':')) {
      type = this.parseType()
    }

    this.expect('=')
    const init = this.parseExpr()
    this.expect(';')

    return this.withLoc({ kind: 'let', name, type, init }, letToken)
  }

  private parseReturnStmt(): Stmt {
    const returnToken = this.expect('return')

    let value: Expr | undefined
    if (!this.check(';')) {
      value = this.parseExpr()
    }

    this.expect(';')
    return this.withLoc({ kind: 'return', value }, returnToken)
  }

  private parseIfStmt(): Stmt {
    const ifToken = this.expect('if')
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

    return this.withLoc({ kind: 'if', cond, then, else_ }, ifToken)
  }

  private parseWhileStmt(): Stmt {
    const whileToken = this.expect('while')
    this.expect('(')
    const cond = this.parseExpr()
    this.expect(')')
    const body = this.parseBlock()

    return this.withLoc({ kind: 'while', cond, body }, whileToken)
  }

  private parseForStmt(): Stmt {
    const forToken = this.expect('for')

    // Check for for-range syntax: for <ident> in <range_lit> { ... }
    if (this.check('ident') && this.peek(1).kind === 'in') {
      return this.parseForRangeStmt(forToken)
    }

    this.expect('(')

    // Init: either let statement (without semicolon) or empty
    let init: Stmt | undefined
    if (this.check('let')) {
      // Parse let without consuming semicolon here (we handle it)
      const letToken = this.expect('let')
      const name = this.expect('ident').value
      let type: TypeNode | undefined
      if (this.match(':')) {
        type = this.parseType()
      }
      this.expect('=')
      const initExpr = this.parseExpr()
      const initStmt: Stmt = { kind: 'let', name, type, init: initExpr }
      init = this.withLoc(initStmt, letToken)
    }
    this.expect(';')

    // Condition
    const cond = this.parseExpr()
    this.expect(';')

    // Step expression
    const step = this.parseExpr()
    this.expect(')')

    const body = this.parseBlock()

    return this.withLoc({ kind: 'for', init, cond, step, body }, forToken)
  }

  private parseForRangeStmt(forToken: Token): Stmt {
    const varName = this.expect('ident').value
    this.expect('in')

    let start: Expr
    let end: Expr

    if (this.check('range_lit')) {
      // Literal range: 0..10, 0..count, 0..=9
      const rangeToken = this.advance()
      const range = this.parseRangeValue(rangeToken.value)
      start = this.withLoc({ kind: 'int_lit', value: range.min ?? 0 }, rangeToken)
      if (range.max !== null && range.max !== undefined) {
        // Fully numeric: 0..10
        end = this.withLoc({ kind: 'int_lit', value: range.max }, rangeToken)
      } else {
        // Open-ended: "0.." — parse the end expression from next tokens
        end = this.parseUnaryExpr()
      }
    } else {
      // Dynamic range: expr..expr (e.g. start..end) — not yet supported
      // Fall back to: parse as int_lit 0..0 (safe default)
      start = this.withLoc({ kind: 'int_lit', value: 0 }, this.peek())
      end   = this.withLoc({ kind: 'int_lit', value: 0 }, this.peek())
      this.error('Dynamic range start requires a literal integer (e.g. 0..count)')
    }

    const body = this.parseBlock()
    return this.withLoc({ kind: 'for_range', varName, start, end, body }, forToken)
  }

  private parseForeachStmt(): Stmt {
    const foreachToken = this.expect('foreach')
    this.expect('(')
    const binding = this.expect('ident').value
    this.expect('in')
    const iterable = this.parseExpr()
    this.expect(')')

    // Parse optional execute context modifiers (as, at, positioned, rotated, facing, etc.)
    let executeContext: string | undefined
    // Check for execute subcommand keywords
    const execIdentKeywords = ['positioned', 'rotated', 'facing', 'anchored', 'align', 'on', 'summon']
    if (this.check('as') || this.check('at') || this.check('in') || (this.check('ident') && execIdentKeywords.includes(this.peek().value))) {
      // Collect everything until we hit '{'
      let context = ''
      while (!this.check('{') && !this.check('eof')) {
        context += this.advance().value + ' '
      }
      executeContext = context.trim()
    }

    const body = this.parseBlock()

    return this.withLoc({ kind: 'foreach', binding, iterable, body, executeContext }, foreachToken)
  }

  private parseMatchStmt(): Stmt {
    const matchToken = this.expect('match')
    this.expect('(')
    const expr = this.parseExpr()
    this.expect(')')
    this.expect('{')

    const arms: Array<{ pattern: Expr | null; body: Block }> = []
    while (!this.check('}') && !this.check('eof')) {
      let pattern: Expr | null
      if (this.check('ident') && this.peek().value === '_') {
        this.advance()
        pattern = null
      } else {
        pattern = this.parseExpr()
      }

      this.expect('=>')
      const body = this.parseBlock()
      arms.push({ pattern, body })
    }

    this.expect('}')
    return this.withLoc({ kind: 'match', expr, arms }, matchToken)
  }

  private parseAsStmt(): Stmt {
    const asToken = this.expect('as')
    const as_sel = this.parseSelector()

    // Check for combined as/at
    if (this.match('at')) {
      const at_sel = this.parseSelector()
      const body = this.parseBlock()
      return this.withLoc({ kind: 'as_at', as_sel, at_sel, body }, asToken)
    }

    const body = this.parseBlock()
    return this.withLoc({ kind: 'as_block', selector: as_sel, body }, asToken)
  }

  private parseAtStmt(): Stmt {
    const atToken = this.expect('at')
    const selector = this.parseSelector()
    const body = this.parseBlock()
    return this.withLoc({ kind: 'at_block', selector, body }, atToken)
  }

  private parseExecuteStmt(): Stmt {
    const executeToken = this.expect('execute')
    const subcommands: ExecuteSubcommand[] = []

    // Parse subcommands until we hit 'run'
    while (!this.check('run') && !this.check('eof')) {
      if (this.match('as')) {
        const selector = this.parseSelector()
        subcommands.push({ kind: 'as', selector })
      } else if (this.match('at')) {
        const selector = this.parseSelector()
        subcommands.push({ kind: 'at', selector })
      } else if (this.checkIdent('positioned')) {
        this.advance()
        if (this.match('as')) {
          const selector = this.parseSelector()
          subcommands.push({ kind: 'positioned_as', selector })
        } else {
          const x = this.parseCoordToken()
          const y = this.parseCoordToken()
          const z = this.parseCoordToken()
          subcommands.push({ kind: 'positioned', x, y, z })
        }
      } else if (this.checkIdent('rotated')) {
        this.advance()
        if (this.match('as')) {
          const selector = this.parseSelector()
          subcommands.push({ kind: 'rotated_as', selector })
        } else {
          const yaw = this.parseCoordToken()
          const pitch = this.parseCoordToken()
          subcommands.push({ kind: 'rotated', yaw, pitch })
        }
      } else if (this.checkIdent('facing')) {
        this.advance()
        if (this.checkIdent('entity')) {
          this.advance()
          const selector = this.parseSelector()
          const anchor = this.checkIdent('eyes') || this.checkIdent('feet') ? this.advance().value as 'eyes' | 'feet' : 'feet'
          subcommands.push({ kind: 'facing_entity', selector, anchor })
        } else {
          const x = this.parseCoordToken()
          const y = this.parseCoordToken()
          const z = this.parseCoordToken()
          subcommands.push({ kind: 'facing', x, y, z })
        }
      } else if (this.checkIdent('anchored')) {
        this.advance()
        const anchor = this.advance().value as 'eyes' | 'feet'
        subcommands.push({ kind: 'anchored', anchor })
      } else if (this.checkIdent('align')) {
        this.advance()
        const axes = this.advance().value
        subcommands.push({ kind: 'align', axes })
      } else if (this.checkIdent('on')) {
        this.advance()
        const relation = this.advance().value
        subcommands.push({ kind: 'on', relation })
      } else if (this.checkIdent('summon')) {
        this.advance()
        const entity = this.advance().value
        subcommands.push({ kind: 'summon', entity })
      } else if (this.checkIdent('store')) {
        this.advance()
        const storeType = this.advance().value // 'result' or 'success'
        if (this.checkIdent('score')) {
          this.advance()
          const target = this.advance().value
          const targetObj = this.advance().value
          if (storeType === 'result') {
            subcommands.push({ kind: 'store_result', target, targetObj })
          } else {
            subcommands.push({ kind: 'store_success', target, targetObj })
          }
        } else {
          this.error('store currently only supports score target')
        }
      } else if (this.match('if')) {
        this.parseExecuteCondition(subcommands, 'if')
      } else if (this.match('unless')) {
        this.parseExecuteCondition(subcommands, 'unless')
      } else if (this.match('in')) {
        // Dimension can be namespaced: minecraft:the_nether
        let dim = this.advance().value
        if (this.match(':')) {
          dim += ':' + this.advance().value
        }
        subcommands.push({ kind: 'in', dimension: dim })
      } else {
        this.error(`Unexpected token in execute statement: ${this.peek().kind} (${this.peek().value})`)
      }
    }

    this.expect('run')
    const body = this.parseBlock()

    return this.withLoc({ kind: 'execute', subcommands, body }, executeToken)
  }

  private parseExecuteCondition(subcommands: ExecuteSubcommand[], type: 'if' | 'unless'): void {
    if (this.checkIdent('entity') || this.check('selector')) {
      if (this.checkIdent('entity')) this.advance()
      const selectorOrVar = this.parseSelectorOrVarSelector()
      subcommands.push({ kind: type === 'if' ? 'if_entity' : 'unless_entity', ...selectorOrVar })
    } else if (this.checkIdent('block')) {
      this.advance()
      const x = this.parseCoordToken()
      const y = this.parseCoordToken()
      const z = this.parseCoordToken()
      const block = this.parseBlockId()
      subcommands.push({ kind: type === 'if' ? 'if_block' : 'unless_block', pos: [x, y, z], block })
    } else if (this.checkIdent('score')) {
      this.advance()
      const target = this.advance().value
      const targetObj = this.advance().value
      // Check for range or comparison
      if (this.checkIdent('matches')) {
        this.advance()
        const range = this.advance().value
        subcommands.push({ kind: type === 'if' ? 'if_score_range' : 'unless_score_range', target, targetObj, range })
      } else {
        const op = this.advance().value  // <, <=, =, >=, >
        const source = this.advance().value
        const sourceObj = this.advance().value
        subcommands.push({ 
          kind: type === 'if' ? 'if_score' : 'unless_score', 
          target, targetObj, op, source, sourceObj 
        })
      }
    } else {
      this.error(`Unknown condition type after ${type}`)
    }
  }

  private parseCoordToken(): string {
    // Handle ~, ^, numbers, relative coords like ~5, ^-3
    const token = this.peek()
    if (token.kind === 'rel_coord' || token.kind === 'local_coord' || 
        token.kind === 'int_lit' || token.kind === 'float_lit' ||
        token.kind === '-' || token.kind === 'ident') {
      return this.advance().value
    }
    this.error(`Expected coordinate, got ${token.kind}`)
    return '~'
  }

  private parseBlockId(): string {
    // Parse block ID like minecraft:stone or stone
    let id = this.advance().value
    if (this.match(':')) {
      id += ':' + this.advance().value
    }
    // Handle block states [facing=north]
    if (this.check('[')) {
      id += this.advance().value // [
      while (!this.check(']') && !this.check('eof')) {
        id += this.advance().value
      }
      id += this.advance().value // ]
    }
    return id
  }

  private checkIdent(value: string): boolean {
    return this.check('ident') && this.peek().value === value
  }

  private parseExprStmt(): Stmt {
    const expr = this.parseExpr()
    this.expect(';')
    const exprToken = this.getLocToken(expr) ?? this.peek()
    return this.withLoc({ kind: 'expr', expr }, exprToken)
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
        return this.withLoc({ kind: 'assign', target: left.name, op, value }, this.getLocToken(left) ?? token)
      }

      // Member assignment: p.x = 10, p.x += 5
      if (left.kind === 'member') {
        const value = this.parseAssignment()
        return this.withLoc(
          { kind: 'member_assign', obj: left.obj, field: left.field, op, value },
          this.getLocToken(left) ?? token
        )
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

      const opToken = this.advance()
      if (op === 'is') {
        const entityType = this.parseEntityTypeName()
        left = this.withLoc(
          { kind: 'is_check', expr: left, entityType },
          this.getLocToken(left) ?? opToken
        )
        continue
      }

      const right = this.parseBinaryExpr(prec + 1) // left associative
      left = this.withLoc(
        { kind: 'binary', op: op as BinOp | CmpOp | '&&' | '||', left, right },
        this.getLocToken(left) ?? opToken
      )
    }

    return left
  }

  private parseUnaryExpr(): Expr {
    if (this.match('!')) {
      const bangToken = this.tokens[this.pos - 1]
      const operand = this.parseUnaryExpr()
      return this.withLoc({ kind: 'unary', op: '!', operand }, bangToken)
    }

    if (this.check('-') && !this.isSubtraction()) {
      const minusToken = this.advance()
      const operand = this.parseUnaryExpr()
      return this.withLoc({ kind: 'unary', op: '-', operand }, minusToken)
    }

    return this.parsePostfixExpr()
  }

  private parseEntityTypeName(): EntityTypeName {
    const token = this.expect('ident')
    if (ENTITY_TYPE_NAMES.has(token.value as EntityTypeName)) {
      return token.value as EntityTypeName
    }
    this.error(`Unknown entity type '${token.value}'`)
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
        const openParenToken = this.tokens[this.pos - 1]
        if (expr.kind === 'ident') {
          const args = this.parseArgs()
          this.expect(')')
          expr = this.withLoc({ kind: 'call', fn: expr.name, args }, this.getLocToken(expr) ?? openParenToken)
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
            'add': 'set_add',
            'contains': 'set_contains',
            'remove': 'set_remove',
            'clear': 'set_clear',
          }
          const internalFn = methodMap[expr.field]
          if (internalFn) {
            const args = this.parseArgs()
            this.expect(')')
            expr = this.withLoc(
              { kind: 'call', fn: internalFn, args: [expr.obj, ...args] },
              this.getLocToken(expr) ?? openParenToken
            )
            continue
          }
          // Generic method sugar: obj.method(args) → method(obj, args)
          const args = this.parseArgs()
          this.expect(')')
          expr = this.withLoc(
            { kind: 'call', fn: expr.field, args: [expr.obj, ...args] },
            this.getLocToken(expr) ?? openParenToken
          )
          continue
        }
        const args = this.parseArgs()
        this.expect(')')
        expr = this.withLoc(
          { kind: 'invoke', callee: expr, args },
          this.getLocToken(expr) ?? openParenToken
        )
        continue
      }

      // Array index access: arr[0]
      if (this.match('[')) {
        const index = this.parseExpr()
        this.expect(']')
        expr = this.withLoc(
          { kind: 'index', obj: expr, index },
          this.getLocToken(expr) ?? this.tokens[this.pos - 1]
        )
        continue
      }

      // Member access
      if (this.match('.')) {
        const field = this.expect('ident').value
        expr = this.withLoc(
          { kind: 'member', obj: expr, field },
          this.getLocToken(expr) ?? this.tokens[this.pos - 1]
        )
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

    if (token.kind === 'ident' && this.peek(1).kind === '::') {
      const typeToken = this.advance()
      this.expect('::')
      const methodToken = this.expect('ident')
      this.expect('(')
      const args = this.parseArgs()
      this.expect(')')
      return this.withLoc({ kind: 'static_call', type: typeToken.value, method: methodToken.value, args }, typeToken)
    }

    if (token.kind === 'ident' && this.peek(1).kind === '=>') {
      return this.parseSingleParamLambda()
    }

    // Integer literal
    if (token.kind === 'int_lit') {
      this.advance()
      return this.withLoc({ kind: 'int_lit', value: parseInt(token.value, 10) }, token)
    }

    // Float literal
    if (token.kind === 'float_lit') {
      this.advance()
      return this.withLoc({ kind: 'float_lit', value: parseFloat(token.value) }, token)
    }

    // Relative coordinate: ~  ~5  ~-3  ~0.5
    if (token.kind === 'rel_coord') {
      this.advance()
      return this.withLoc({ kind: 'rel_coord', value: token.value }, token)
    }

    // Local coordinate: ^  ^5  ^-3  ^0.5
    if (token.kind === 'local_coord') {
      this.advance()
      return this.withLoc({ kind: 'local_coord', value: token.value }, token)
    }

    // NBT suffix literals
    if (token.kind === 'byte_lit') {
      this.advance()
      return this.withLoc({ kind: 'byte_lit', value: parseInt(token.value.slice(0, -1), 10) }, token)
    }
    if (token.kind === 'short_lit') {
      this.advance()
      return this.withLoc({ kind: 'short_lit', value: parseInt(token.value.slice(0, -1), 10) }, token)
    }
    if (token.kind === 'long_lit') {
      this.advance()
      return this.withLoc({ kind: 'long_lit', value: parseInt(token.value.slice(0, -1), 10) }, token)
    }
    if (token.kind === 'double_lit') {
      this.advance()
      return this.withLoc({ kind: 'double_lit', value: parseFloat(token.value.slice(0, -1)) }, token)
    }

    // String literal
    if (token.kind === 'string_lit') {
      this.advance()
      return this.parseStringExpr(token)
    }

    if (token.kind === 'f_string') {
      this.advance()
      return this.parseFStringExpr(token)
    }

    // MC name literal: #health → mc_name node (value = "health", without #)
    if (token.kind === 'mc_name') {
      this.advance()
      return this.withLoc({ kind: 'mc_name', value: token.value.slice(1) }, token)
    }

    // Boolean literal
    if (token.kind === 'true') {
      this.advance()
      return this.withLoc({ kind: 'bool_lit', value: true }, token)
    }
    if (token.kind === 'false') {
      this.advance()
      return this.withLoc({ kind: 'bool_lit', value: false }, token)
    }

    // Range literal
    if (token.kind === 'range_lit') {
      this.advance()
      return this.withLoc({ kind: 'range_lit', range: this.parseRangeValue(token.value) }, token)
    }

    // Selector
    if (token.kind === 'selector') {
      this.advance()
      return this.withLoc({
        kind: 'selector',
        raw: token.value,
        isSingle: computeIsSingle(token.value),
        sel: this.parseSelectorValue(token.value),
      }, token)
    }

    // Identifier
    if (token.kind === 'ident') {
      this.advance()
      return this.withLoc({ kind: 'ident', name: token.value }, token)
    }

    // Grouped expression
    if (token.kind === '(') {
      if (this.isBlockPosLiteral()) {
        return this.parseBlockPos()
      }
      if (this.isLambdaStart()) {
        return this.parseLambdaExpr()
      }
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

  private parseLiteralExpr(): LiteralExpr {
    // Support negative literals: -5, -3.14
    if (this.check('-')) {
      this.advance()
      const token = this.peek()
      if (token.kind === 'int_lit') {
        this.advance()
        return this.withLoc({ kind: 'int_lit', value: -Number(token.value) }, token)
      }
      if (token.kind === 'float_lit') {
        this.advance()
        return this.withLoc({ kind: 'float_lit', value: -Number(token.value) }, token)
      }
      this.error('Expected number after unary -')
    }
    const expr = this.parsePrimaryExpr()
    if (
      expr.kind === 'int_lit' ||
      expr.kind === 'float_lit' ||
      expr.kind === 'bool_lit' ||
      expr.kind === 'str_lit'
    ) {
      return expr
    }
    this.error('Const value must be a literal')
  }

  private parseSingleParamLambda(): Expr {
    const paramToken = this.expect('ident')
    const params: LambdaParam[] = [{ name: paramToken.value }]
    this.expect('=>')
    return this.finishLambdaExpr(params, paramToken)
  }

  private parseLambdaExpr(): Expr {
    const openParenToken = this.expect('(')
    const params: LambdaParam[] = []

    if (!this.check(')')) {
      do {
        const name = this.expect('ident').value
        let type: TypeNode | undefined
        if (this.match(':')) {
          type = this.parseType()
        }
        params.push({ name, type })
      } while (this.match(','))
    }

    this.expect(')')
    let returnType: TypeNode | undefined
    if (this.match('->')) {
      returnType = this.parseType()
    }
    this.expect('=>')
    return this.finishLambdaExpr(params, openParenToken, returnType)
  }

  private finishLambdaExpr(params: LambdaParam[], token: Token, returnType?: TypeNode): Expr {
    const body = this.check('{') ? this.parseBlock() : this.parseExpr()
    return this.withLoc({ kind: 'lambda', params, returnType, body }, token)
  }

  private parseStringExpr(token: Token): Expr {
    if (!token.value.includes('${')) {
      return this.withLoc({ kind: 'str_lit', value: token.value }, token)
    }

    const parts: Array<string | Expr> = []
    let current = ''
    let index = 0

    while (index < token.value.length) {
      if (token.value[index] === '$' && token.value[index + 1] === '{') {
        if (current) {
          parts.push(current)
          current = ''
        }

        index += 2
        let depth = 1
        let exprSource = ''
        let inString = false

        while (index < token.value.length && depth > 0) {
          const char = token.value[index]

          if (char === '"' && token.value[index - 1] !== '\\') {
            inString = !inString
          }

          if (!inString) {
            if (char === '{') {
              depth++
            } else if (char === '}') {
              depth--
              if (depth === 0) {
                index++
                break
              }
            }
          }

          if (depth > 0) {
            exprSource += char
          }
          index++
        }

        if (depth !== 0) {
          this.error('Unterminated string interpolation')
        }

        parts.push(this.parseEmbeddedExpr(exprSource))
        continue
      }

      current += token.value[index]
      index++
    }

    if (current) {
      parts.push(current)
    }

    return this.withLoc({ kind: 'str_interp', parts }, token)
  }

  private parseFStringExpr(token: Token): Expr {
    const parts: Array<{ kind: 'text'; value: string } | { kind: 'expr'; expr: Expr }> = []
    let current = ''
    let index = 0

    while (index < token.value.length) {
      if (token.value[index] === '{') {
        if (current) {
          parts.push({ kind: 'text', value: current })
          current = ''
        }

        index++
        let depth = 1
        let exprSource = ''
        let inString = false

        while (index < token.value.length && depth > 0) {
          const char = token.value[index]

          if (char === '"' && token.value[index - 1] !== '\\') {
            inString = !inString
          }

          if (!inString) {
            if (char === '{') {
              depth++
            } else if (char === '}') {
              depth--
              if (depth === 0) {
                index++
                break
              }
            }
          }

          if (depth > 0) {
            exprSource += char
          }
          index++
        }

        if (depth !== 0) {
          this.error('Unterminated f-string interpolation')
        }

        parts.push({ kind: 'expr', expr: this.parseEmbeddedExpr(exprSource) })
        continue
      }

      current += token.value[index]
      index++
    }

    if (current) {
      parts.push({ kind: 'text', value: current })
    }

    return this.withLoc({ kind: 'f_string', parts }, token)
  }

  private parseEmbeddedExpr(source: string): Expr {
    const tokens = new Lexer(source, this.filePath).tokenize()
    const parser = new Parser(tokens, source, this.filePath)
    const expr = parser.parseExpr()

    if (!parser.check('eof')) {
      parser.error(`Unexpected token '${parser.peek().kind}' in string interpolation`)
    }

    return expr
  }

  private parseStructLit(): Expr {
    const braceToken = this.expect('{')
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
    return this.withLoc({ kind: 'struct_lit', fields }, braceToken)
  }

  private parseArrayLit(): Expr {
    const bracketToken = this.expect('[')
    const elements: Expr[] = []

    if (!this.check(']')) {
      do {
        elements.push(this.parseExpr())
      } while (this.match(','))
    }

    this.expect(']')
    return this.withLoc({ kind: 'array_lit', elements }, bracketToken)
  }

  private isLambdaStart(): boolean {
    if (!this.check('(')) return false

    let offset = 1
    if (this.peek(offset).kind !== ')') {
      while (true) {
        if (this.peek(offset).kind !== 'ident') {
          return false
        }
        offset += 1

        if (this.peek(offset).kind === ':') {
          offset += 1
          const consumed = this.typeTokenLength(offset)
          if (consumed === 0) {
            return false
          }
          offset += consumed
        }

        if (this.peek(offset).kind === ',') {
          offset += 1
          continue
        }
        break
      }
    }

    if (this.peek(offset).kind !== ')') {
      return false
    }
    offset += 1

    if (this.peek(offset).kind === '=>') {
      return true
    }

    if (this.peek(offset).kind === '->') {
      offset += 1
      const consumed = this.typeTokenLength(offset)
      if (consumed === 0) {
        return false
      }
      offset += consumed
      return this.peek(offset).kind === '=>'
    }

    return false
  }

  private typeTokenLength(offset: number): number {
    const token = this.peek(offset)

    if (token.kind === '(') {
      let inner = offset + 1
      if (this.peek(inner).kind !== ')') {
        while (true) {
          const consumed = this.typeTokenLength(inner)
          if (consumed === 0) {
            return 0
          }
          inner += consumed
          if (this.peek(inner).kind === ',') {
            inner += 1
            continue
          }
          break
        }
      }

      if (this.peek(inner).kind !== ')') {
        return 0
      }
      inner += 1

      if (this.peek(inner).kind !== '->') {
        return 0
      }
      inner += 1
      const returnLen = this.typeTokenLength(inner)
      return returnLen === 0 ? 0 : inner + returnLen - offset
    }

    const isNamedType =
      token.kind === 'int' ||
      token.kind === 'bool' ||
      token.kind === 'float' ||
      token.kind === 'string' ||
      token.kind === 'void' ||
      token.kind === 'BlockPos' ||
      token.kind === 'ident'
    if (!isNamedType) {
      return 0
    }

    let length = 1
    while (this.peek(offset + length).kind === '[' && this.peek(offset + length + 1).kind === ']') {
      length += 2
    }
    return length
  }

  private isBlockPosLiteral(): boolean {
    if (!this.check('(')) return false

    let offset = 1
    for (let i = 0; i < 3; i++) {
      const consumed = this.coordComponentTokenLength(offset)
      if (consumed === 0) return false
      offset += consumed

      if (i < 2) {
        if (this.peek(offset).kind !== ',') return false
        offset += 1
      }
    }

    return this.peek(offset).kind === ')'
  }

  private coordComponentTokenLength(offset: number): number {
    const token = this.peek(offset)

    if (token.kind === 'int_lit') {
      return 1
    }

    if (token.kind === '-') {
      return this.peek(offset + 1).kind === 'int_lit' ? 2 : 0
    }

    // rel_coord (~, ~5, ~-3) and local_coord (^, ^5, ^-3) are single tokens now
    if (token.kind === 'rel_coord' || token.kind === 'local_coord') {
      return 1
    }

    return 0
  }

  private parseBlockPos(): BlockPosExpr {
    const openParenToken = this.expect('(')
    const x = this.parseCoordComponent()
    this.expect(',')
    const y = this.parseCoordComponent()
    this.expect(',')
    const z = this.parseCoordComponent()
    this.expect(')')
    return this.withLoc({ kind: 'blockpos', x, y, z }, openParenToken)
  }

  private parseCoordComponent(): CoordComponent {
    const token = this.peek()

    // Handle rel_coord (~, ~5, ~-3) and local_coord (^, ^5, ^-3) tokens
    if (token.kind === 'rel_coord') {
      this.advance()
      // Parse the offset from the token value (e.g., "~5" -> 5, "~" -> 0, "~-3" -> -3)
      const offset = this.parseCoordOffsetFromValue(token.value.slice(1))
      return { kind: 'relative', offset }
    }

    if (token.kind === 'local_coord') {
      this.advance()
      const offset = this.parseCoordOffsetFromValue(token.value.slice(1))
      return { kind: 'local', offset }
    }

    return { kind: 'absolute', value: this.parseSignedCoordOffset(true) }
  }

  private parseCoordOffsetFromValue(value: string): number {
    if (value === '' || value === undefined) return 0
    return parseFloat(value)
  }

  private parseSignedCoordOffset(requireValue = false): number {
    let sign = 1
    if (this.match('-')) {
      sign = -1
    }

    if (this.check('int_lit')) {
      return sign * parseInt(this.advance().value, 10)
    }

    if (requireValue) {
      this.error('Expected integer coordinate component')
    }

    return 0
  }

  // -------------------------------------------------------------------------
  // Selector Parsing
  // -------------------------------------------------------------------------

  private parseSelector(): EntitySelector {
    const token = this.expect('selector')
    return this.parseSelectorValue(token.value)
  }

  // Parse either a selector (@a[...]) or a variable with filters (p[...])
  // Returns { selector } for selectors or { varName, filters } for variables
  private parseSelectorOrVarSelector(): { selector?: EntitySelector, varName?: string, filters?: SelectorFilter } {
    if (this.check('selector')) {
      return { selector: this.parseSelector() }
    }
    
    // Must be an identifier (variable) possibly with filters
    const varToken = this.expect('ident')
    const varName = varToken.value
    
    // Check for optional filters [...]
    if (this.check('[')) {
      this.advance() // consume '['
      // Collect everything until ']'
      let filterStr = ''
      let depth = 1
      while (depth > 0 && !this.check('eof')) {
        if (this.check('[')) depth++
        else if (this.check(']')) depth--
        if (depth > 0) {
          filterStr += this.peek().value ?? this.peek().kind
          this.advance()
        }
      }
      this.expect(']')
      const filters = this.parseSelectorFilters(filterStr)
      return { varName, filters }
    }
    
    return { varName }
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
        case 'x':
          filters.x = this.parseRangeValue(val)
          break
        case 'y':
          filters.y = this.parseRangeValue(val)
          break
        case 'z':
          filters.z = this.parseRangeValue(val)
          break
        case 'x_rotation':
          filters.x_rotation = this.parseRangeValue(val)
          break
        case 'y_rotation':
          filters.y_rotation = this.parseRangeValue(val)
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
