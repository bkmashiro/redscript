/**
 * ExprParser — expression parsing (binary, unary, postfix, primary).
 * Extends TypeParser so expression methods can call type methods.
 */

import { Lexer } from '../lexer'
import type { Token } from '../lexer'
import type {
  Expr, LiteralExpr, LambdaParam, TypeNode,
  RangeExpr, SelectorFilter, EntitySelector, SelectorKind,
  BlockPosExpr, CoordComponent, EntityTypeName, AssignOp,
} from '../ast/types'
import type { BinOp, CmpOp } from '../ast/types'
import { TypeParser } from './type-parser'
import { BINARY_OPS, PRECEDENCE } from './utils'

// ---------------------------------------------------------------------------
// Entity type name set
// ---------------------------------------------------------------------------

const ENTITY_TYPE_NAMES = new Set<EntityTypeName>([
  'entity', 'Player', 'Mob', 'HostileMob', 'PassiveMob', 'Zombie', 'Skeleton',
  'Creeper', 'Spider', 'Enderman', 'Blaze', 'Witch', 'Slime', 'ZombieVillager',
  'Husk', 'Drowned', 'Stray', 'WitherSkeleton', 'CaveSpider', 'Pig', 'Cow',
  'Sheep', 'Chicken', 'Villager', 'WanderingTrader', 'ArmorStand', 'Item', 'Arrow',
])

function computeIsSingle(raw: string): boolean {
  if (/^@[spr](\[|$)/.test(raw)) return true
  if (/[\[,\s]limit=1[,\]\s]/.test(raw)) return true
  return false
}

export class ExprParser extends TypeParser {
  // -------------------------------------------------------------------------
  // Expressions (Precedence Climbing)
  // -------------------------------------------------------------------------

  parseExpr(): Expr {
    return this.parseAssignment()
  }

  private parseAssignment(): Expr {
    const left = this.parseBinaryExpr(1)

    const token = this.peek()
    if (token.kind === '=' || token.kind === '+=' || token.kind === '-=' ||
        token.kind === '*=' || token.kind === '/=' || token.kind === '%=') {
      const op = this.advance().kind as AssignOp

      if (left.kind === 'ident') {
        const value = this.parseAssignment()
        return this.withLoc({ kind: 'assign', target: left.name, op, value }, this.getLocToken(left) ?? token)
      }

      if (left.kind === 'member') {
        const value = this.parseAssignment()
        return this.withLoc(
          { kind: 'member_assign', obj: left.obj, field: left.field, op, value },
          this.getLocToken(left) ?? token
        )
      }

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

      const right = this.parseBinaryExpr(prec + 1)
      left = this.withLoc(
        { kind: 'binary', op: op as BinOp | CmpOp | '&&' | '||', left, right },
        this.getLocToken(left) ?? opToken
      )
    }

    return left
  }

  parseUnaryExpr(): Expr {
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
    this.error(`Unknown entity type '${token.value}'. Valid types: ${[...ENTITY_TYPE_NAMES].slice(0, 6).join(', ')}, ...`)
  }

  private isSubtraction(): boolean {
    if (this.pos === 0) return false
    const prev = this.tokens[this.pos - 1]
    return ['int_lit', 'float_lit', 'ident', ')', ']'].includes(prev.kind)
  }

  private parsePostfixExpr(): Expr {
    let expr = this.parsePrimaryExpr()

    while (true) {
      // Generic call: ident<Type>(args)
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
        if (expr.kind === 'member') {
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

      // Array index access
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
      if (this.check('as') && this.isTypeCastAs()) {
        const asToken = this.advance()
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

  private isTypeCastAs(): boolean {
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

  parseArgs(): Expr[] {
    const args: Expr[] = []
    if (!this.check(')')) {
      do {
        args.push(this.parseExpr())
      } while (this.match(','))
    }
    return args
  }

  parsePrimaryExpr(): Expr {
    const token = this.peek()

    if (token.kind === 'ident' && this.peek(1).kind === '::') {
      const typeToken = this.advance()
      this.expect('::')
      const memberToken = this.expect('ident')
      if (this.check('(')) {
        const isNamedArgs = this.peek(1).kind === 'ident' && this.peek(2).kind === ':'
        if (isNamedArgs) {
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
        this.advance() // consume '('
        const args = this.parseArgs()
        this.expect(')')
        return this.withLoc({ kind: 'static_call', type: typeToken.value, method: memberToken.value, args }, typeToken)
      }
      return this.withLoc({ kind: 'path_expr', enumName: typeToken.value, variant: memberToken.value }, typeToken)
    }

    if (token.kind === 'ident' && this.peek(1).kind === '=>') {
      return this.parseSingleParamLambda()
    }

    if (token.kind === 'int_lit') {
      this.advance()
      return this.withLoc({ kind: 'int_lit', value: parseInt(token.value, 10) }, token)
    }

    if (token.kind === 'float_lit') {
      this.advance()
      return this.withLoc({ kind: 'float_lit', value: parseFloat(token.value) }, token)
    }

    if (token.kind === 'rel_coord') {
      this.advance()
      return this.withLoc({ kind: 'rel_coord', value: token.value }, token)
    }

    if (token.kind === 'local_coord') {
      this.advance()
      return this.withLoc({ kind: 'local_coord', value: token.value }, token)
    }

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

    if (token.kind === 'string_lit') {
      this.advance()
      return this.parseStringExpr(token)
    }

    if (token.kind === 'f_string') {
      this.advance()
      return this.parseFStringExpr(token)
    }

    if (token.kind === 'mc_name') {
      this.advance()
      return this.withLoc({ kind: 'mc_name', value: token.value.slice(1) }, token)
    }

    if (token.kind === 'true') {
      this.advance()
      return this.withLoc({ kind: 'bool_lit', value: true }, token)
    }
    if (token.kind === 'false') {
      this.advance()
      return this.withLoc({ kind: 'bool_lit', value: false }, token)
    }

    if (token.kind === 'range_lit') {
      this.advance()
      return this.withLoc({ kind: 'range_lit', range: this.parseRangeValue(token.value) }, token)
    }

    if (token.kind === 'selector') {
      this.advance()
      return this.withLoc({
        kind: 'selector',
        raw: token.value,
        isSingle: computeIsSingle(token.value),
        sel: this.parseSelectorValue(token.value),
      }, token)
    }

    if (token.kind === 'ident' && this.peek(1).kind === '{' &&
        this.peek(2).kind === 'ident' && this.peek(3).kind === ':') {
      this.advance()
      return this.parseStructLit()
    }

    if (token.kind === 'ident' && token.value === 'Some' && this.peek(1).kind === '(') {
      this.advance()
      this.advance()
      const value = this.parseExpr()
      this.expect(')')
      return this.withLoc({ kind: 'some_lit', value }, token)
    }

    if (token.kind === 'ident' && token.value === 'None') {
      this.advance()
      return this.withLoc({ kind: 'none_lit' }, token)
    }

    if (token.kind === 'ident') {
      this.advance()
      return this.withLoc({ kind: 'ident', name: token.value }, token)
    }

    if (token.kind === '(') {
      if (this.isBlockPosLiteral()) {
        return this.parseBlockPos()
      }
      if (this.isLambdaStart()) {
        return this.parseLambdaExpr()
      }
      this.advance()
      const first = this.parseExpr()
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

    if (token.kind === '{') {
      return this.parseStructLit()
    }

    if (token.kind === '[') {
      return this.parseArrayLit()
    }

    this.error(`Unexpected token '${token.value || token.kind}'. Expected an expression (identifier, literal, '(', '[', or '{')`)
  }

  parseLiteralExpr(): LiteralExpr {
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
      this.error('Expected number after unary minus (-). Const values must be numeric or string literals')
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

  // -------------------------------------------------------------------------
  // Lambda
  // -------------------------------------------------------------------------

  parseSingleParamLambda(): Expr {
    const paramToken = this.expect('ident')
    const params: LambdaParam[] = [{ name: paramToken.value }]
    this.expect('=>')
    return this.finishLambdaExpr(params, paramToken)
  }

  parseLambdaExpr(): Expr {
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
    const body = this.check('{') ? (this as any).parseBlock() : this.parseExpr()
    return this.withLoc({ kind: 'lambda', params, returnType, body }, token)
  }

  // -------------------------------------------------------------------------
  // String interpolation
  // -------------------------------------------------------------------------

  private parseStringExpr(token: Token): Expr {
    // Plain string literals: no interpolation. "${...}" is treated as literal text.
    // Only f"..." strings (f_string token) support {expr} interpolation.
    return this.withLoc({ kind: 'str_lit', value: token.value }, token)
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
            if (char === '{') depth++
            else if (char === '}') {
              depth--
              if (depth === 0) { index++; break }
            }
          }
          if (depth > 0) exprSource += char
          index++
        }

        if (depth !== 0) this.error('Unterminated f-string interpolation')
        parts.push({ kind: 'expr', expr: this.parseEmbeddedExpr(exprSource) })
        continue
      }
      current += token.value[index]
      index++
    }

    if (current) parts.push({ kind: 'text', value: current })
    return this.withLoc({ kind: 'f_string', parts }, token)
  }

  private parseEmbeddedExpr(source: string): Expr {
    // Lazy import to break circular dependency at runtime — Parser extends ExprParser
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Parser } = require('./index') as { Parser: new (tokens: import('../lexer').Token[], source?: string, filePath?: string) => ExprParser }
    const tokens = new Lexer(source, this.filePath).tokenize()
    const parser = new Parser(tokens, source, this.filePath)
    const expr = parser.parseExpr()
    if (!parser.check('eof')) {
      parser.error(`Unexpected token '${parser.peek().kind}' in string interpolation`)
    }
    return expr
  }

  // -------------------------------------------------------------------------
  // Struct / Array / BlockPos literals
  // -------------------------------------------------------------------------

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
    if (token.kind === 'int_lit') return 1
    if (token.kind === '-') {
      return this.peek(offset + 1).kind === 'int_lit' ? 2 : 0
    }
    if (token.kind === 'rel_coord' || token.kind === 'local_coord') return 1
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
    if (token.kind === 'rel_coord') {
      this.advance()
      return { kind: 'relative', offset: this.parseCoordOffsetFromValue(token.value.slice(1)) }
    }
    if (token.kind === 'local_coord') {
      this.advance()
      return { kind: 'local', offset: this.parseCoordOffsetFromValue(token.value.slice(1)) }
    }
    return { kind: 'absolute', value: this.parseSignedCoordOffset(true) }
  }

  private parseCoordOffsetFromValue(value: string): number {
    if (value === '' || value === undefined) return 0
    return parseFloat(value)
  }

  private parseSignedCoordOffset(requireValue = false): number {
    let sign = 1
    if (this.match('-')) sign = -1
    if (this.check('int_lit')) return sign * parseInt(this.advance().value, 10)
    if (requireValue) this.error('Expected integer coordinate component')
    return 0
  }

  // -------------------------------------------------------------------------
  // Selector parsing (also used by stmt-parser)
  // -------------------------------------------------------------------------

  parseSelector(): EntitySelector {
    const token = this.expect('selector')
    return this.parseSelectorValue(token.value)
  }

  parseSelectorOrVarSelector(): { selector?: EntitySelector, varName?: string, filters?: SelectorFilter } {
    if (this.check('selector')) {
      return { selector: this.parseSelector() }
    }
    const varToken = this.expect('ident')
    const varName = varToken.value
    if (this.check('[')) {
      this.advance()
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

  parseSelectorValue(value: string): EntitySelector {
    const bracketIndex = value.indexOf('[')
    if (bracketIndex === -1) {
      return { kind: value as SelectorKind }
    }
    const kind = value.slice(0, bracketIndex) as SelectorKind
    const paramsStr = value.slice(bracketIndex + 1, -1)
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
        case 'type': filters.type = val; break
        case 'distance': filters.distance = this.parseRangeValue(val); break
        case 'tag':
          if (val.startsWith('!')) {
            filters.notTag = filters.notTag ?? []
            filters.notTag.push(val.slice(1))
          } else {
            filters.tag = filters.tag ?? []
            filters.tag.push(val)
          }
          break
        case 'limit': filters.limit = parseInt(val, 10); break
        case 'sort': filters.sort = val as SelectorFilter['sort']; break
        case 'nbt': filters.nbt = val; break
        case 'gamemode': filters.gamemode = val; break
        case 'scores': filters.scores = this.parseScoresFilter(val); break
        case 'x': filters.x = this.parseRangeValue(val); break
        case 'y': filters.y = this.parseRangeValue(val); break
        case 'z': filters.z = this.parseRangeValue(val); break
        case 'x_rotation': filters.x_rotation = this.parseRangeValue(val); break
        case 'y_rotation': filters.y_rotation = this.parseRangeValue(val); break
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
    if (current.trim()) parts.push(current.trim())
    return parts
  }

  private parseScoresFilter(val: string): Record<string, RangeExpr> {
    const scores: Record<string, RangeExpr> = {}
    const inner = val.slice(1, -1)
    const parts = inner.split(',')
    for (const part of parts) {
      const [name, range] = part.split('=').map(s => s.trim())
      scores[name] = this.parseRangeValue(range)
    }
    return scores
  }

  parseRangeValue(value: string): RangeExpr {
    if (value.startsWith('..=')) {
      const rest = value.slice(3)
      if (!rest) return {}
      return { max: parseInt(rest, 10) }
    }
    if (value.startsWith('..')) {
      const rest = value.slice(2)
      if (!rest) return {}
      return { max: parseInt(rest, 10) }
    }
    const inclIdx = value.indexOf('..=')
    if (inclIdx !== -1) {
      const min = parseInt(value.slice(0, inclIdx), 10)
      const rest = value.slice(inclIdx + 3)
      if (!rest) return { min }
      return { min, max: parseInt(rest, 10) }
    }
    const dotIndex = value.indexOf('..')
    if (dotIndex !== -1) {
      const min = parseInt(value.slice(0, dotIndex), 10)
      const rest = value.slice(dotIndex + 2)
      if (!rest) return { min }
      return { min, max: parseInt(rest, 10) }
    }
    const val = parseInt(value, 10)
    return { min: val, max: val }
  }

  // -------------------------------------------------------------------------
  // Coord token (used by stmt-parser for execute subcommands)
  // -------------------------------------------------------------------------

  parseCoordToken(): string {
    const token = this.peek()
    if (token.kind === 'rel_coord' || token.kind === 'local_coord' ||
        token.kind === 'int_lit' || token.kind === 'float_lit' ||
        token.kind === '-' || token.kind === 'ident') {
      return this.advance().value
    }
    return this.error(`Expected coordinate, got ${token.kind}`)
  }

  parseBlockId(): string {
    let id = this.advance().value
    if (this.match(':')) id += ':' + this.advance().value
    if (this.check('[')) {
      id += this.advance().value
      while (!this.check(']') && !this.check('eof')) id += this.advance().value
      id += this.advance().value
    }
    return id
  }
}
