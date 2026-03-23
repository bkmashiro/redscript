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
  CoordComponent, LambdaParam, EntityTypeName, ImportDecl, MatchPattern,
  InterfaceDecl, InterfaceMethod
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
  /** Warnings accumulated during parsing (e.g. deprecated keyword usage). */
  readonly warnings: string[] = []
  /** Parse errors collected during error-recovery mode. */
  readonly parseErrors: DiagnosticError[] = []

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
  // Error Recovery
  // -------------------------------------------------------------------------

  /**
   * Synchronize to the next top-level declaration boundary after a parse error.
   * Skips tokens until we find a keyword that starts a top-level declaration,
   * or a `}` (end of a block), or EOF.
   */
  private syncToNextDecl(): void {
    const TOP_LEVEL_KEYWORDS = new Set([
      'fn', 'struct', 'impl', 'enum', 'const', 'let', 'export', 'declare', 'import', 'namespace', 'module'
    ])
    while (!this.check('eof')) {
      const kind = this.peek().kind
      if (kind === '}') {
        this.advance() // consume the stray `}`
        return
      }
      if (TOP_LEVEL_KEYWORDS.has(kind)) {
        return
      }
      // Also recover on a plain ident that could be 'import' keyword used as ident
      if (kind === 'ident' && this.peek().value === 'import') {
        return
      }
      this.advance()
    }
  }

  /**
   * Synchronize to the next statement boundary inside a block after a parse error.
   * Skips tokens until we reach `;`, `}`, or EOF.
   */
  private syncToNextStmt(): void {
    while (!this.check('eof')) {
      const kind = this.peek().kind
      if (kind === ';') {
        this.advance() // consume the `;`
        return
      }
      if (kind === '}') {
        return // leave `}` for parseBlock to consume
      }
      this.advance()
    }
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
    const imports: ImportDecl[] = []
    const interfaces: InterfaceDecl[] = []
    let isLibrary = false
    let moduleName: string | undefined

    // Check for namespace declaration
    if (this.check('namespace')) {
      this.advance()
      const name = this.expect('ident')
      namespace = name.value
      this.match(';')
    }

    // Check for module declaration: `module library;` or `module <name>;`
    // Library-mode: all functions parsed from this point are marked isLibraryFn=true.
    // When using the `librarySources` compile option, each library source is parsed
    // by its own fresh Parser — so this flag never bleeds into user code.
    if (this.check('module')) {
      this.advance()
      const modKind = this.expect('ident')
      if (modKind.value === 'library') {
        isLibrary = true
        this.inLibraryMode = true
      } else {
        // Named module declaration: `module math;`
        moduleName = modKind.value
      }
      this.match(';')
    }

    // Parse struct, function, and import declarations
    while (!this.check('eof')) {
      try {
        if (this.check('decorator') && this.peek().value.startsWith('@config')) {
          // @config decorator on a global let
          const decorToken = this.advance()
          const decorator = this.parseDecoratorValue(decorToken.value)
          if (!this.check('let')) {
            this.error('@config decorator must be followed by a let declaration')
          }
          const g = this.parseGlobalDecl(true)
          g.configKey = decorator.args?.configKey
          g.configDefault = decorator.args?.configDefault
          globals.push(g)
        } else if (this.check('let')) {
          globals.push(this.parseGlobalDecl(true))
        } else if (this.check('decorator') && this.peek().value === '@singleton') {
          // @singleton decorator on a struct
          this.advance() // consume '@singleton'
          if (!this.check('struct')) {
            this.error('@singleton decorator must be followed by a struct declaration')
          }
          const s = this.parseStructDecl()
          s.isSingleton = true
          structs.push(s)
        } else if (this.check('struct')) {
          structs.push(this.parseStructDecl())
        } else if (this.check('impl')) {
          implBlocks.push(this.parseImplBlock())
        } else if (this.check('interface')) {
          interfaces.push(this.parseInterfaceDecl())
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
        } else if (this.check('import') || (this.check('ident') && this.peek().value === 'import')) {
          // `import math::sin;` or `import math::*;` or `import player_utils;` (whole-module file import)
          this.advance() // consume 'import' (keyword or ident)
          const importToken = this.peek()
          const modName = this.expect('ident').value
          // Check for `::` — if present, this is a symbol import; otherwise, whole-module import
          if (this.check('::')) {
            this.advance() // consume '::'
            let symbol: string
            if (this.check('*')) {
              this.advance()
              symbol = '*'
            } else {
              symbol = this.expect('ident').value
            }
            this.match(';')
            imports.push(this.withLoc({ moduleName: modName, symbol }, importToken))
          } else {
            // Whole-module import: `import player_utils;`
            this.match(';')
            imports.push(this.withLoc({ moduleName: modName, symbol: undefined }, importToken))
          }
        } else {
          declarations.push(this.parseFnDecl())
        }
      } catch (err) {
        if (err instanceof DiagnosticError) {
          this.parseErrors.push(err)
          this.syncToNextDecl()
        } else {
          throw err
        }
      }
    }

    return { namespace, moduleName, globals, declarations, structs, implBlocks, enums, consts, imports, interfaces, isLibrary }
  }

  // -------------------------------------------------------------------------
  // Struct Declaration
  // -------------------------------------------------------------------------

  private parseStructDecl(): StructDecl {
    const structToken = this.expect('struct')
    const name = this.expect('ident').value
    const extendsName = this.match('extends') ? this.expect('ident').value : undefined
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
    return this.withLoc({ name, extends: extendsName, fields }, structToken)
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

      // Payload fields: Variant(field: Type, ...)
      if (this.check('(')) {
        this.advance() // consume '('
        const fields: { name: string; type: TypeNode }[] = []
        while (!this.check(')') && !this.check('eof')) {
          const fieldName = this.expect('ident').value
          this.expect(':')
          const fieldType = this.parseType()
          fields.push({ name: fieldName, type: fieldType })
          if (!this.match(',')) break
        }
        this.expect(')')
        variant.fields = fields
      }

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
    let traitName: string | undefined
    let typeName: string
    const firstName = this.expect('ident').value
    if (this.match('for')) {
      traitName = firstName
      typeName = this.expect('ident').value
    } else {
      typeName = firstName
    }
    this.expect('{')

    const methods: FnDecl[] = []
    while (!this.check('}') && !this.check('eof')) {
      methods.push(this.parseFnDecl(typeName))
    }

    this.expect('}')
    return this.withLoc({ kind: 'impl_block', traitName, typeName, methods }, implToken)
  }

  /**
   * Parse an interface declaration:
   *   interface <Name> {
   *     fn <method>(<params>): <retType>
   *     ...
   *   }
   * Method signatures have no body — they are prototype-only.
   */
  private parseInterfaceDecl(): InterfaceDecl {
    const ifaceToken = this.expect('interface')
    const name = this.expect('ident').value
    this.expect('{')

    const methods: InterfaceMethod[] = []
    while (!this.check('}') && !this.check('eof')) {
      const fnToken = this.expect('fn')
      const methodName = this.expect('ident').value
      this.expect('(')
      const params = this.parseInterfaceParams()
      this.expect(')')
      let returnType: TypeNode | undefined
      if (this.match(':')) {
        returnType = this.parseType()
      }
      // No body — interface methods are signature-only
      methods.push(this.withLoc({ name: methodName, params, returnType }, fnToken) as InterfaceMethod)
    }

    this.expect('}')
    return this.withLoc({ name, methods }, ifaceToken) as InterfaceDecl
  }

  /**
   * Parse interface method params — like parseParams but allows bare `self`
   * (no `:` required for the first param named 'self').
   */
  private parseInterfaceParams(): Param[] {
    const params: Param[] = []
    if (!this.check(')')) {
      do {
        const paramToken = this.expect('ident')
        const paramName = paramToken.value
        let type: TypeNode
        if (params.length === 0 && paramName === 'self' && !this.check(':')) {
          // self without type annotation — use a sentinel struct type
          type = { kind: 'named', name: 'void' }
        } else {
          this.expect(':')
          type = this.parseType()
        }
        params.push(this.withLoc({ name: paramName, type }, paramToken))
      } while (this.match(','))
    }
    return params
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
      value.kind === 'float_lit' ? { kind: 'named', name: 'fixed' } :
      { kind: 'named', name: 'int' }
    )
    return this.withLoc({ name, type: inferredType, value }, constToken)
  }

  private parseGlobalDecl(mutable: boolean): GlobalDecl {
    const token = this.advance() // consume 'let'
    const name = this.expect('ident').value
    this.expect(':')
    const type = this.parseType()
    let init: Expr
    if (this.match('=')) {
      init = this.parseExpr()
    } else {
      // No init — valid only for @config-decorated globals (resolved later)
      // Use a placeholder zero literal; will be replaced in compile step
      init = { kind: 'int_lit', value: 0 }
    }
    this.match(';')
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
    const watchObjective = decorators.find(decorator => decorator.name === 'watch')?.args?.objective

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

    // Parse optional generic type parameters: fn max<T>(...)
    let typeParams: string[] | undefined
    if (this.check('<')) {
      this.advance() // consume '<'
      typeParams = []
      do {
        typeParams.push(this.expect('ident').value)
      } while (this.match(','))
      this.expect('>')
    }

    this.expect('(')
    const params = this.parseParams(implTypeName)
    this.expect(')')

    let returnType: TypeNode = { kind: 'named', name: 'void' }
    if (this.match('->') || this.match(':')) {
      returnType = this.parseType()
    }

    const body = this.parseBlock()
    // Record the closing '}' line as endLine for accurate LSP scope detection
    const closingBraceLine = this.tokens[this.pos - 1]?.line

    const fn: import('../ast/types').FnDecl = this.withLoc(
      { name, typeParams, params, returnType, decorators: filteredDecorators, body,
        isLibraryFn: this.inLibraryMode || undefined, isExported, watchObjective },
      fnToken,
    )
    if (fn.span && closingBraceLine) fn.span.endLine = closingBraceLine
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
    // Parse @tick, @on(PlayerDeath), @on_trigger("name"), or @deprecated("msg with ) parens")
    // Use a greedy match for args that allows any content inside the outermost parens.
    const match = value.match(/^@([A-Za-z_][A-Za-z0-9_-]*)(?:\((.*)\))?$/s)
    if (!match) {
      this.error(`Invalid decorator: ${value}`)
    }

    const name = match[1] as Decorator['name']
    const argsStr = match[2]

    if (!argsStr) {
      return { name }
    }

    if (name === 'profile' || name === 'benchmark' || name === 'memoize') {
      this.error(`@${name} decorator does not accept arguments`)
    }

    const args: Decorator['args'] = {}

    if (name === 'on') {
      const eventTypeMatch = argsStr.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)
      if (eventTypeMatch) {
        args.eventType = eventTypeMatch[1]
        return { name, args }
      }
    }

    // Handle @watch("objective"), @on_trigger("name"), @on_advancement("id"), @on_craft("item"), @on_join_team("team")
    if (name === 'watch' || name === 'on_trigger' || name === 'on_advancement' || name === 'on_craft' || name === 'on_join_team') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) {
        if (name === 'watch') {
          args.objective = strMatch[1]
        } else if (name === 'on_trigger') {
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

    // Handle @config("key", default: value)
    if (name === 'config') {
      // Format: @config("key_name", default: 42)
      const configMatch = argsStr.match(/^"([^"]+)"\s*,\s*default\s*:\s*(-?\d+(?:\.\d+)?)$/)
      if (configMatch) {
        return { name, args: { configKey: configMatch[1], configDefault: parseFloat(configMatch[2]) } }
      }
      // Format: @config("key_name") — no default
      const keyOnlyMatch = argsStr.match(/^"([^"]+)"$/)
      if (keyOnlyMatch) {
        return { name, args: { configKey: keyOnlyMatch[1] } }
      }
      this.error(`Invalid @config syntax. Expected: @config("key", default: value) or @config("key")`)
    }

    // Handle @deprecated("message")
    if (name === 'deprecated') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) {
        return { name, args: { message: strMatch[1] } }
      }
      // @deprecated with no message string
      return { name, args: {} }
    }

    // @test("label") — marks a test function with a human-readable label
    if (name === 'test') {
      const strMatch = argsStr.match(/^"([^"]*)"$/)
      if (strMatch) {
        return { name, args: { testLabel: strMatch[1] } }
      }
      // @test with no label — use empty string
      return { name, args: { testLabel: '' } }
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

    // Handle key=value format (e.g., rate=20, batch=10, onDone=fn_name)
    for (const part of argsStr.split(',')) {
      const [key, val] = part.split('=').map(s => s.trim())
      if (key === 'rate') {
        args.rate = parseInt(val, 10)
      } else if (key === 'ticks') {
        args.ticks = parseInt(val, 10)
      } else if (key === 'batch') {
        args.batch = parseInt(val, 10)
      } else if (key === 'onDone') {
        args.onDone = val.replace(/^["']|["']$/g, '')
      } else if (key === 'trigger') {
        args.trigger = val
      } else if (key === 'advancement') {
        args.advancement = val
      } else if (key === 'item') {
        args.item = val
      } else if (key === 'team') {
        args.team = val
      } else if (key === 'max') {
        args.max = parseInt(val, 10)
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
      // Disambiguate: tuple type `(T, T)` vs function type `(T) -> R`
      // Look ahead: parse elements, then check if '->' follows.
      const saved = this.pos
      this.advance() // consume '('
      const elements: TypeNode[] = []
      if (!this.check(')')) {
        do {
          elements.push(this.parseType())
        } while (this.match(','))
      }
      this.expect(')')
      if (this.check('->')) {
        // It's a function type — restore and use existing parseFunctionType
        this.pos = saved
        return this.parseFunctionType()
      }
      // It's a tuple type
      return { kind: 'tuple', elements }
    }

    if (token.kind === 'float') {
      this.advance()
      const filePart = this.filePath ? `${this.filePath}:` : ''
      this.warnings.push(
        `[DeprecatedType] ${filePart}line ${token.line}, col ${token.col}: 'float' is deprecated, use 'fixed' instead (×10000 fixed-point)`
      )
      type = { kind: 'named', name: 'float' }
    } else if (token.kind === 'int' || token.kind === 'bool' ||
        token.kind === 'fixed' || token.kind === 'string' || token.kind === 'void' ||
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
      } else if (token.value === 'Option' && this.check('<')) {
        this.advance() // consume <
        const inner = this.parseType()
        this.expect('>')
        type = { kind: 'option', inner }
      } else if (token.value === 'double' || token.value === 'byte' ||
                 token.value === 'short' || token.value === 'long' ||
                 token.value === 'format_string') {
        type = { kind: 'named', name: token.value as any }
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
      try {
        stmts.push(this.parseStmt())
      } catch (err) {
        if (err instanceof DiagnosticError) {
          this.parseErrors.push(err)
          this.syncToNextStmt()
        } else {
          throw err
        }
      }
    }

    this.expect('}')
    return stmts
  }

  private parseStmt(): Stmt {
    // Let statement
    if (this.check('let')) {
      return this.parseLetStmt()
    }

    // Const declaration (local)
    if (this.check('const')) {
      return this.parseLocalConstDecl()
    }

    // Return statement
    if (this.check('return')) {
      return this.parseReturnStmt()
    }

    // Break statement (with optional label: break outer)
    if (this.check('break')) {
      const token = this.advance()
      // Check if next token is an identifier (label name)
      if (this.check('ident')) {
        const labelToken = this.advance()
        this.match(';')
        return this.withLoc({ kind: 'break_label', label: labelToken.value }, token)
      }
      this.match(';')
      return this.withLoc({ kind: 'break' }, token)
    }

    // Continue statement (with optional label: continue outer)
    if (this.check('continue')) {
      const token = this.advance()
      // Check if next token is an identifier (label name)
      if (this.check('ident')) {
        const labelToken = this.advance()
        this.match(';')
        return this.withLoc({ kind: 'continue_label', label: labelToken.value }, token)
      }
      this.match(';')
      return this.withLoc({ kind: 'continue' }, token)
    }

    // If statement
    if (this.check('if')) {
      return this.parseIfStmt()
    }

    // Labeled loop: ident ':' (while|for|foreach|repeat)
    if (this.check('ident') && this.peek(1).kind === ':') {
      const labelToken = this.advance() // consume ident
      const colonToken = this.advance() // consume ':'
      // Now parse the loop body
      let loopStmt: Stmt
      if (this.check('while')) {
        loopStmt = this.parseWhileStmt()
      } else if (this.check('for')) {
        loopStmt = this.parseForStmt()
      } else if (this.check('foreach')) {
        loopStmt = this.parseForeachStmt()
      } else if (this.check('repeat')) {
        loopStmt = this.parseRepeatStmt()
      } else {
        throw new DiagnosticError(
          'ParseError',
          `Expected loop statement after label '${labelToken.value}:', found '${this.peek().kind}'`,
          { line: labelToken.line, col: labelToken.col },
        )
      }
      return this.withLoc({ kind: 'labeled_loop', label: labelToken.value, body: loopStmt }, labelToken)
    }

    // While statement
    if (this.check('while')) {
      return this.parseWhileStmt()
    }

    // Do-while statement
    if (this.check('do')) {
      return this.parseDoWhileStmt()
    }

    // Repeat N statement
    if (this.check('repeat')) {
      return this.parseRepeatStmt()
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

    // Destructuring: let (a, b, c) = expr;
    if (this.check('(')) {
      this.advance() // consume '('
      const names: string[] = []
      do {
        names.push(this.expect('ident').value)
      } while (this.match(','))
      this.expect(')')
      let type: TypeNode | undefined
      if (this.match(':')) {
        type = this.parseType()
      }
      this.expect('=')
      const init = this.parseExpr()
      this.match(';')
      return this.withLoc({ kind: 'let_destruct', names, type, init }, letToken)
    }

    const name = this.expect('ident').value

    let type: TypeNode | undefined
    if (this.match(':')) {
      type = this.parseType()
    }

    this.expect('=')
    const init = this.parseExpr()
    this.match(';')

    return this.withLoc({ kind: 'let', name, type, init }, letToken)
  }

  private parseLocalConstDecl(): Stmt {
    const constToken = this.expect('const')
    const name = this.expect('ident').value
    this.expect(':')
    const type = this.parseType()
    this.expect('=')
    const value = this.parseExpr()
    this.match(';')
    return this.withLoc({ kind: 'const_decl', name, type, value }, constToken)
  }

  private parseReturnStmt(): Stmt {
    const returnToken = this.expect('return')

    let value: Expr | undefined
    if (!this.check(';') && !this.check('}') && !this.check('eof')) {
      value = this.parseExpr()
    }

    this.match(';')
    return this.withLoc({ kind: 'return', value }, returnToken)
  }

  private parseIfStmt(): Stmt {
    const ifToken = this.expect('if')

    // if let Some(x) = expr { ... }
    if (this.check('let') && this.peek(1).kind === 'ident' && this.peek(1).value === 'Some') {
      this.advance() // consume 'let'
      this.advance() // consume 'Some'
      this.expect('(')
      const binding = this.expect('ident').value
      this.expect(')')
      this.expect('=')
      const init = this.parseExpr()
      const then = this.parseBlock()

      let else_: Block | undefined
      if (this.match('else')) {
        if (this.check('if')) {
          else_ = [this.parseIfStmt()]
        } else {
          else_ = this.parseBlock()
        }
      }

      return this.withLoc({ kind: 'if_let_some', binding, init, then, else_ }, ifToken)
    }

    const cond = this.parseParenOptionalCond()
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

    // while let Some(x) = expr { ... }
    if (this.check('let') && this.peek(1).kind === 'ident' && this.peek(1).value === 'Some') {
      this.advance() // consume 'let'
      this.advance() // consume 'Some'
      this.expect('(')
      const binding = this.expect('ident').value
      this.expect(')')
      this.expect('=')
      const init = this.parseExpr()
      const body = this.parseBlock()
      return this.withLoc({ kind: 'while_let_some', binding, init, body }, whileToken)
    }

    const cond = this.parseParenOptionalCond()
    const body = this.parseBlock()

    return this.withLoc({ kind: 'while', cond, body }, whileToken)
  }

  private parseDoWhileStmt(): Stmt {
    const doToken = this.expect('do')
    const body = this.parseBlock()
    this.expect('while')
    const cond = this.parseParenOptionalCond()
    this.match(';')
    return this.withLoc({ kind: 'do_while', cond, body }, doToken)
  }

  private parseRepeatStmt(): Stmt {
    const repeatToken = this.expect('repeat')
    const countToken = this.expect('int_lit')
    const count = parseInt(countToken.value, 10)
    const body = this.parseBlock()
    return this.withLoc({ kind: 'repeat', count, body }, repeatToken)
  }

  private parseParenOptionalCond(): Expr {
    if (this.match('(')) {
      const cond = this.parseExpr()
      this.expect(')')
      return cond
    }
    return this.parseExpr()
  }

  private parseForStmt(): Stmt {
    const forToken = this.expect('for')

    // Check for for-range syntax: for <ident> in <range_lit> { ... }
    if (this.check('ident') && this.peek(1).kind === 'in') {
      return this.parseForRangeStmt(forToken)
    }

    this.expect('(')

    // Detect for-in-array syntax: for ( let ident in ident , lenExpr ) { ... }
    if (this.check('let') && this.peek(1).kind === 'ident' && this.peek(2).kind === 'in' && this.peek(3).kind === 'ident' && this.peek(4).kind === ',') {
      this.advance() // consume 'let'
      const binding = this.expect('ident').value
      this.expect('in')
      const arrayName = this.expect('ident').value
      this.expect(',')
      const lenExpr = this.parseExpr()
      this.expect(')')
      const body = this.parseBlock()
      return this.withLoc({ kind: 'for_in_array', binding, arrayName, lenExpr, body }, forToken)
    }

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
    let inclusive = false

    if (this.check('range_lit')) {
      // Literal range: 0..10, 0..count, 0..=9, 0..=count
      const rangeToken = this.advance()
      const raw = rangeToken.value
      // Detect inclusive: ends with = after .. (e.g. "0..=" or "..=")
      const incl = raw.includes('..=')
      inclusive = incl
      const range = this.parseRangeValue(raw)
      start = this.withLoc({ kind: 'int_lit', value: range.min ?? 0 }, rangeToken)
      if (range.max !== null && range.max !== undefined) {
        // Fully numeric: 0..10 or 0..=9
        end = this.withLoc({ kind: 'int_lit', value: range.max }, rangeToken)
      } else {
        // Open-ended: "0.." or "0..=" — parse the end expression from next tokens
        end = this.parseUnaryExpr()
      }
    } else {
      // Dynamic range: expr..expr or expr..=expr
      // parseExpr stops before range_lit (not in BINARY_OPS), so this is safe
      const arrayOrStart = this.parseExpr()

      // --- for_each detection: for item in arr { ... } ---
      // If after parsing the expression there is no range_lit, it's a for_each (array iteration)
      if (!this.check('range_lit')) {
        const body = this.parseBlock()
        return this.withLoc({ kind: 'for_each', binding: varName, array: arrayOrStart, body }, forToken)
      }

      start = arrayOrStart
      // Consume the range_lit token which should be ".." or "..="
      if (this.check('range_lit')) {
        const rangeOp = this.advance()
        inclusive = rangeOp.value.includes('=')
        // If the range_lit captured digits after .., use them as end
        const afterOp = rangeOp.value.replace(/^\.\.=?/, '')
        if (afterOp.length > 0) {
          end = this.withLoc({ kind: 'int_lit', value: parseInt(afterOp, 10) }, rangeOp)
        } else {
          end = this.parseExpr()
        }
      } else {
        this.error('Expected .. or ..= in for-range expression')
        start = this.withLoc({ kind: 'int_lit', value: 0 }, this.peek())
        end = this.withLoc({ kind: 'int_lit', value: 0 }, this.peek())
      }
    }

    const body = this.parseBlock()
    return this.withLoc({ kind: 'for_range', varName, start, end, inclusive, body }, forToken)
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

  private parseMatchPattern(): MatchPattern {
    // Wildcard: _
    if (this.check('ident') && this.peek().value === '_') {
      this.advance()
      return { kind: 'PatWild' }
    }
    // None
    if (this.check('ident') && this.peek().value === 'None') {
      this.advance()
      return { kind: 'PatNone' }
    }
    // Some(x)
    if (this.check('ident') && this.peek().value === 'Some') {
      this.advance() // consume 'Some'
      this.expect('(')
      const binding = this.expect('ident').value
      this.expect(')')
      return { kind: 'PatSome', binding }
    }
    // Enum pattern: EnumName::Variant or EnumName::Variant(b1, b2, ...)
    if (this.check('ident') && this.peek(1).kind === '::') {
      const enumName = this.advance().value
      this.expect('::')
      const variant = this.expect('ident').value
      const bindings: string[] = []
      if (this.check('(')) {
        this.advance() // consume '('
        while (!this.check(')') && !this.check('eof')) {
          bindings.push(this.expect('ident').value)
          if (!this.match(',')) break
        }
        this.expect(')')
      }
      return { kind: 'PatEnum', enumName, variant, bindings }
    }
    // Integer literal
    if (this.check('int_lit')) {
      const tok = this.advance()
      return { kind: 'PatInt', value: parseInt(tok.value, 10) }
    }
    // Negative integer literal: -N
    if (this.check('-') && this.peek(1).kind === 'int_lit') {
      this.advance() // consume '-'
      const tok = this.advance()
      return { kind: 'PatInt', value: -parseInt(tok.value, 10) }
    }
    // Legacy: range_lit or any other expression (e.g. 0..59)
    const e = this.parseExpr()
    return { kind: 'PatExpr', expr: e }
  }

  private parseMatchStmt(): Stmt {
    const matchToken = this.expect('match')

    // Support both `match (expr)` (legacy) and `match expr` (new syntax)
    let expr: Expr
    if (this.check('(')) {
      // Peek ahead — if it looks like `(expr)` followed by `{`, consume parens
      this.advance() // consume '('
      expr = this.parseExpr()
      this.expect(')')
    } else {
      expr = this.parseExpr()
    }
    this.expect('{')

    const arms: Array<{ pattern: MatchPattern; body: Block }> = []
    while (!this.check('}') && !this.check('eof')) {
      const pattern = this.parseMatchPattern()
      this.expect('=>')
      const body = this.parseBlock()
      this.match(',') // optional trailing comma
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
    this.match(';')
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

      // Index assignment: arr[0] = val, arr[i] = val
      if (left.kind === 'index') {
        const value = this.parseAssignment()
        return this.withLoc(
          { kind: 'index_assign', obj: left.obj, index: left.index, op, value },
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

  /**
   * Try to parse `<Type, ...>` as explicit generic type arguments.
   * Returns the parsed type list if successful, null if this looks like a comparison.
   * Does NOT consume any tokens if it returns null.
   */
  private tryParseTypeArgs(): import('../ast/types').TypeNode[] | null {
    const saved = this.pos
    this.advance() // consume '<'
    const typeArgs: import('../ast/types').TypeNode[] = []
    try {
      do {
        typeArgs.push(this.parseType())
      } while (this.match(','))
      if (!this.check('>')) {
        this.pos = saved
        return null
      }
      this.advance() // consume '>'
      return typeArgs
    } catch {
      this.pos = saved
      return null
    }
  }

  private parsePostfixExpr(): Expr {
    let expr = this.parsePrimaryExpr()

    while (true) {
      // Generic call: ident<Type>(args) — check before regular '(' handling
      if (expr.kind === 'ident' && this.check('<')) {
        const typeArgs = this.tryParseTypeArgs()
        if (typeArgs !== null && this.check('(')) {
          const openParenToken = this.peek()
          this.advance() // consume '('
          const args = this.parseArgs()
          this.expect(')')
          expr = this.withLoc(
            { kind: 'call', fn: expr.name, args, typeArgs },
            this.getLocToken(expr) ?? openParenToken
          )
          continue
        }
        // Not a generic call — fall through to normal expression handling
      }

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
          // Option.unwrap_or(default) → unwrap_or AST node
          if (expr.field === 'unwrap_or') {
            const defaultExpr = this.parseExpr()
            this.expect(')')
            expr = this.withLoc(
              { kind: 'unwrap_or', opt: expr.obj, default_: defaultExpr },
              this.getLocToken(expr) ?? openParenToken
            )
            continue
          }

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

      // Type cast: expr as Type
      // Only parse 'as' as a cast when followed by a type token (not a selector like @a)
      if (this.check('as') && this.isTypeCastAs()) {
        const asToken = this.advance() // consume 'as'
        const targetType = this.parseType()
        expr = this.withLoc(
          { kind: 'type_cast', expr, targetType },
          this.getLocToken(expr) ?? asToken
        )
        continue
      }

      break
    }

    return expr
  }

  /** Returns true if the current 'as' token is a type cast (not a context block) */
  private isTypeCastAs(): boolean {
    // Look ahead past 'as' to see if the next token looks like a type
    const next = this.tokens[this.pos + 1]
    if (!next) return false
    const typeStartTokens = new Set(['int', 'bool', 'float', 'fixed', 'string', 'void', 'BlockPos', '('])
    if (typeStartTokens.has(next.kind)) return true
    if (next.kind === 'ident' && (
      next.value === 'double' || next.value === 'byte' || next.value === 'short' ||
      next.value === 'long' || next.value === 'selector' || next.value === 'Option'
    )) return true
    return false
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
      const memberToken = this.expect('ident')
      if (this.check('(')) {
        // Peek inside: if first non-'(' token is `ident :` it's enum construction with named args.
        // We only treat it as enum_construct when there are actual named args (not empty parens),
        // because empty `()` is ambiguous and most commonly means a static method call.
        const isNamedArgs = this.peek(1).kind === 'ident' && this.peek(2).kind === ':'
        if (isNamedArgs) {
          // Enum variant construction: EnumName::Variant(field: expr, ...)
          this.advance() // consume '('
          const args: { name: string; value: Expr }[] = []
          while (!this.check(')') && !this.check('eof')) {
            const fieldName = this.expect('ident').value
            this.expect(':')
            const value = this.parseExpr()
            args.push({ name: fieldName, value })
            if (!this.match(',')) break
          }
          this.expect(')')
          return this.withLoc({ kind: 'enum_construct', enumName: typeToken.value, variant: memberToken.value, args }, typeToken)
        }
        // Static method call: Type::method(args)
        this.advance() // consume '('
        const args = this.parseArgs()
        this.expect(')')
        return this.withLoc({ kind: 'static_call', type: typeToken.value, method: memberToken.value, args }, typeToken)
      }
      // Enum variant access: Enum::Variant
      return this.withLoc({ kind: 'path_expr', enumName: typeToken.value, variant: memberToken.value }, typeToken)
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

    // Named struct literal: TypeName { field: value, ... }
    // Require at least one field (ident + :) to avoid ambiguity with blocks.
    if (token.kind === 'ident' && this.peek(1).kind === '{' &&
        this.peek(2).kind === 'ident' && this.peek(3).kind === ':') {
      this.advance() // consume type name (used only for disambiguation, dropped from AST)
      return this.parseStructLit()
    }

    // Some(expr) — Option constructor
    if (token.kind === 'ident' && token.value === 'Some' && this.peek(1).kind === '(') {
      this.advance() // consume 'Some'
      this.advance() // consume '('
      const value = this.parseExpr()
      this.expect(')')
      return this.withLoc({ kind: 'some_lit', value }, token)
    }

    // None — Option empty constructor
    if (token.kind === 'ident' && token.value === 'None') {
      this.advance()
      return this.withLoc({ kind: 'none_lit' }, token)
    }

    // Identifier
    if (token.kind === 'ident') {
      this.advance()
      return this.withLoc({ kind: 'ident', name: token.value }, token)
    }

    // Grouped expression or tuple literal
    if (token.kind === '(') {
      if (this.isBlockPosLiteral()) {
        return this.parseBlockPos()
      }
      if (this.isLambdaStart()) {
        return this.parseLambdaExpr()
      }
      this.advance()
      const first = this.parseExpr()
      // If followed by a comma, it's a tuple literal
      if (this.match(',')) {
        const elements: Expr[] = [first]
        if (!this.check(')')) {
          do {
            elements.push(this.parseExpr())
          } while (this.match(','))
        }
        this.expect(')')
        return this.withLoc({ kind: 'tuple_lit', elements }, token)
      }
      this.expect(')')
      return first
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
      // Check for {...} interpolation
      if (token.value[index] === '{') {
        if (current) {
          parts.push({ kind: 'text', value: current })
          current = ''
        }

        index++ // skip '{'
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
      token.kind === 'fixed' ||
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
    // ..=5 → { max: 5 }
    // 1.. → { min: 1 }
    // 1..= → { min: 1 } (open-ended inclusive, end parsed separately)
    // 1..10 → { min: 1, max: 10 }
    // 1..=10 → { min: 1, max: 10 }
    // 5 → { min: 5, max: 5 } (exact match)

    if (value.startsWith('..=')) {
      const rest = value.slice(3)
      if (!rest) return {}  // open upper bound, no max
      const max = parseInt(rest, 10)
      return { max }
    }

    if (value.startsWith('..')) {
      const rest = value.slice(2)
      if (!rest) return {}  // open upper bound, no max
      const max = parseInt(rest, 10)
      return { max }
    }

    const inclIdx = value.indexOf('..=')
    if (inclIdx !== -1) {
      const min = parseInt(value.slice(0, inclIdx), 10)
      const rest = value.slice(inclIdx + 3)
      if (!rest) return { min }  // open-ended inclusive
      const max = parseInt(rest, 10)
      return { min, max }
    }

    const dotIndex = value.indexOf('..')
    if (dotIndex !== -1) {
      const min = parseInt(value.slice(0, dotIndex), 10)
      const rest = value.slice(dotIndex + 2)
      if (!rest) return { min }  // open-ended
      const max = parseInt(rest, 10)
      return { min, max }
    }

    // Exact value
    const val = parseInt(value, 10)
    return { min: val, max: val }
  }
}
