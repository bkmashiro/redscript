/**
 * TypeParser — parses type annotations and generic type arguments.
 * Extends ParserBase to gain token navigation.
 */

import type { TypeNode, Param } from '../ast/types'
import { ParserBase } from './utils'

export class TypeParser extends ParserBase {
  // -------------------------------------------------------------------------
  // Type Parsing
  // -------------------------------------------------------------------------

  parseType(): TypeNode {
    const token = this.peek()
    let type: TypeNode

    if (token.kind === '(') {
      // Disambiguate: tuple type `(T, T)` vs function type `(T) -> R`
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
        this.pos = saved
        return this.parseFunctionType()
      }
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
      this.error(`Expected type, got '${token.value || token.kind}'. Valid types: int, float, bool, string, void, or a struct/enum name`)
    }

    while (this.match('[')) {
      this.expect(']')
      type = { kind: 'array', elem: type }
    }

    return type
  }

  parseFunctionType(): TypeNode {
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

  /**
   * Try to parse `<Type, ...>` as explicit generic type arguments.
   * Returns the parsed type list if successful, null if this looks like a comparison.
   * Does NOT consume any tokens if it returns null.
   */
  tryParseTypeArgs(): TypeNode[] | null {
    const saved = this.pos
    this.advance() // consume '<'
    const typeArgs: TypeNode[] = []
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

  // -------------------------------------------------------------------------
  // Lambda lookahead helpers (needed by expr-parser)
  // -------------------------------------------------------------------------

  isLambdaStart(): boolean {
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

  typeTokenLength(offset: number): number {
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

  // -------------------------------------------------------------------------
  // Params parsing (used by decl-parser)
  // -------------------------------------------------------------------------

  parseParams(implTypeName?: string): Param[] {
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
        let defaultValue: import('../ast/types').Expr | undefined
        if (this.match('=')) {
          defaultValue = (this as any).parseExpr()
        }
        params.push(this.withLoc({ name, type, default: defaultValue }, paramToken))
      } while (this.match(','))
    }

    return params
  }

  parseInterfaceParams(): Param[] {
    const params: Param[] = []
    if (!this.check(')')) {
      do {
        const paramToken = this.expect('ident')
        const paramName = paramToken.value
        let type: TypeNode
        if (params.length === 0 && paramName === 'self' && !this.check(':')) {
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
}
