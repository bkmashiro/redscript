/**
 * StmtParser — statement parsing (if/while/for/match/execute/etc).
 * Extends ExprParser so statement methods can call expression methods.
 */

import { DiagnosticError } from '../diagnostics'
import type { Stmt, Block, TypeNode, Expr, MatchPattern, ExecuteSubcommand } from '../ast/types'
import { ExprParser } from './expr-parser'

export class StmtParser extends ExprParser {
  // -------------------------------------------------------------------------
  // Block
  // -------------------------------------------------------------------------

  parseBlock(): Block {
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

  // -------------------------------------------------------------------------
  // Statement dispatch
  // -------------------------------------------------------------------------

  parseStmt(): Stmt {
    if (this.check('let')) return this.parseLetStmt()
    if (this.check('const')) return this.parseLocalConstDecl()
    if (this.check('return')) return this.parseReturnStmt()

    if (this.check('break')) {
      const token = this.advance()
      if (this.check('ident')) {
        const labelToken = this.advance()
        this.match(';')
        return this.withLoc({ kind: 'break_label', label: labelToken.value }, token)
      }
      this.match(';')
      return this.withLoc({ kind: 'break' }, token)
    }

    if (this.check('continue')) {
      const token = this.advance()
      if (this.check('ident')) {
        const labelToken = this.advance()
        this.match(';')
        return this.withLoc({ kind: 'continue_label', label: labelToken.value }, token)
      }
      this.match(';')
      return this.withLoc({ kind: 'continue' }, token)
    }

    if (this.check('if')) return this.parseIfStmt()

    // Labeled loop: ident ':' (while|for|foreach|repeat)
    if (this.check('ident') && this.peek(1).kind === ':') {
      const labelToken = this.advance()
      this.advance() // consume ':'
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

    if (this.check('while')) return this.parseWhileStmt()
    if (this.check('do')) return this.parseDoWhileStmt()
    if (this.check('repeat')) return this.parseRepeatStmt()
    if (this.check('for')) return this.parseForStmt()
    if (this.check('foreach')) return this.parseForeachStmt()
    if (this.check('match')) return this.parseMatchStmt()
    if (this.check('as')) return this.parseAsStmt()
    if (this.check('at')) return this.parseAtStmt()
    if (this.check('execute')) return this.parseExecuteStmt()

    if (this.check('raw_cmd')) {
      const token = this.advance()
      const cmd = token.value
      this.match(';')
      return this.withLoc({ kind: 'raw', cmd }, token)
    }

    return this.parseExprStmt()
  }

  // -------------------------------------------------------------------------
  // Individual statement parsers
  // -------------------------------------------------------------------------

  private parseLetStmt(): Stmt {
    const letToken = this.expect('let')

    if (this.check('(')) {
      this.advance()
      const names: string[] = []
      do {
        names.push(this.expect('ident').value)
      } while (this.match(','))
      this.expect(')')
      let type: TypeNode | undefined
      if (this.match(':')) type = this.parseType()
      this.expect('=')
      const init = this.parseExpr()
      this.match(';')
      return this.withLoc({ kind: 'let_destruct', names, type, init }, letToken)
    }

    const name = this.expect('ident').value
    let type: TypeNode | undefined
    if (this.match(':')) type = this.parseType()
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
      this.advance()
      this.advance()
      this.expect('(')
      const binding = this.expect('ident').value
      this.expect(')')
      this.expect('=')
      const init = this.parseExpr()
      const then = this.parseBlock()
      let else_: Block | undefined
      if (this.match('else')) {
        else_ = this.check('if') ? [this.parseIfStmt()] : this.parseBlock()
      }
      return this.withLoc({ kind: 'if_let_some', binding, init, then, else_ }, ifToken)
    }

    const cond = this.parseParenOptionalCond()
    const then = this.parseBlock()
    let else_: Block | undefined
    if (this.match('else')) {
      else_ = this.check('if') ? [this.parseIfStmt()] : this.parseBlock()
    }
    return this.withLoc({ kind: 'if', cond, then, else_ }, ifToken)
  }

  private parseWhileStmt(): Stmt {
    const whileToken = this.expect('while')

    if (this.check('let') && this.peek(1).kind === 'ident' && this.peek(1).value === 'Some') {
      this.advance()
      this.advance()
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

    if (this.check('ident') && this.peek(1).kind === 'in') {
      return this.parseForRangeStmt(forToken)
    }

    this.expect('(')

    if (this.check('let') && this.peek(1).kind === 'ident' && this.peek(2).kind === 'in' && this.peek(3).kind === 'ident' && this.peek(4).kind === ',') {
      this.advance()
      const binding = this.expect('ident').value
      this.expect('in')
      const arrayName = this.expect('ident').value
      this.expect(',')
      const lenExpr = this.parseExpr()
      this.expect(')')
      const body = this.parseBlock()
      return this.withLoc({ kind: 'for_in_array', binding, arrayName, lenExpr, body }, forToken)
    }

    let init: Stmt | undefined
    if (this.check('let')) {
      const letToken = this.expect('let')
      const name = this.expect('ident').value
      let type: TypeNode | undefined
      if (this.match(':')) type = this.parseType()
      this.expect('=')
      const initExpr = this.parseExpr()
      const initStmt: Stmt = { kind: 'let', name, type, init: initExpr }
      init = this.withLoc(initStmt, letToken)
    }
    this.expect(';')

    const cond = this.parseExpr()
    this.expect(';')

    const step = this.parseExpr()
    this.expect(')')

    const body = this.parseBlock()
    return this.withLoc({ kind: 'for', init, cond, step, body }, forToken)
  }

  private parseForRangeStmt(forToken: import('../lexer').Token): Stmt {
    const varName = this.expect('ident').value
    this.expect('in')

    let start: Expr
    let end: Expr
    let inclusive = false

    if (this.check('range_lit')) {
      const rangeToken = this.advance()
      const raw = rangeToken.value
      inclusive = raw.includes('..=')
      const range = this.parseRangeValue(raw)
      start = this.withLoc({ kind: 'int_lit', value: range.min ?? 0 }, rangeToken)
      if (range.max !== null && range.max !== undefined) {
        end = this.withLoc({ kind: 'int_lit', value: range.max }, rangeToken)
      } else {
        end = this.parseUnaryExpr()
      }
    } else {
      const arrayOrStart = this.parseExpr()

      if (!this.check('range_lit')) {
        const body = this.parseBlock()
        return this.withLoc({ kind: 'for_each', binding: varName, array: arrayOrStart, body }, forToken)
      }

      start = arrayOrStart
      if (this.check('range_lit')) {
        const rangeOp = this.advance()
        inclusive = rangeOp.value.includes('=')
        const afterOp = rangeOp.value.replace(/^\.\.=?/, '')
        if (afterOp.length > 0) {
          end = this.withLoc({ kind: 'int_lit', value: parseInt(afterOp, 10) }, rangeOp)
        } else {
          end = this.parseExpr()
        }
      } else {
        this.error('Expected .. or ..= in for-range expression. Example: for i in 0..10 { ... }')
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

    let executeContext: string | undefined
    const execIdentKeywords = ['positioned', 'rotated', 'facing', 'anchored', 'align', 'on', 'summon']
    if (this.check('as') || this.check('at') || this.check('in') || (this.check('ident') && execIdentKeywords.includes(this.peek().value))) {
      let context = ''
      while (!this.check('{') && !this.check('eof')) {
        context += this.advance().value + ' '
      }
      executeContext = context.trim()
    }

    const body = this.parseBlock()
    return this.withLoc({ kind: 'foreach', binding, iterable, body, executeContext }, foreachToken)
  }

  // -------------------------------------------------------------------------
  // Match
  // -------------------------------------------------------------------------

  private parseMatchPattern(): MatchPattern {
    if (this.check('ident') && this.peek().value === '_') {
      this.advance()
      return { kind: 'PatWild' }
    }
    if (this.check('ident') && this.peek().value === 'None') {
      this.advance()
      return { kind: 'PatNone' }
    }
    if (this.check('ident') && this.peek().value === 'Some') {
      this.advance()
      this.expect('(')
      const binding = this.expect('ident').value
      this.expect(')')
      return { kind: 'PatSome', binding }
    }
    if (this.check('ident') && this.peek(1).kind === '::') {
      const enumName = this.advance().value
      this.expect('::')
      const variant = this.expect('ident').value
      const bindings: string[] = []
      if (this.check('(')) {
        this.advance()
        while (!this.check(')') && !this.check('eof')) {
          bindings.push(this.expect('ident').value)
          if (!this.match(',')) break
        }
        this.expect(')')
      }
      return { kind: 'PatEnum', enumName, variant, bindings }
    }
    if (this.check('int_lit')) {
      const tok = this.advance()
      return { kind: 'PatInt', value: parseInt(tok.value, 10) }
    }
    if (this.check('-') && this.peek(1).kind === 'int_lit') {
      this.advance()
      const tok = this.advance()
      return { kind: 'PatInt', value: -parseInt(tok.value, 10) }
    }
    const e = this.parseExpr()
    return { kind: 'PatExpr', expr: e }
  }

  private parseMatchStmt(): Stmt {
    const matchToken = this.expect('match')
    let expr: Expr
    if (this.check('(')) {
      this.advance()
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
      this.match(',')
      arms.push({ pattern, body })
    }

    this.expect('}')
    return this.withLoc({ kind: 'match', expr, arms }, matchToken)
  }

  // -------------------------------------------------------------------------
  // As / At / Execute
  // -------------------------------------------------------------------------

  private parseAsStmt(): Stmt {
    const asToken = this.expect('as')
    const as_sel = this.parseSelector()
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
        const storeType = this.advance().value
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
        let dim = this.advance().value
        if (this.match(':')) dim += ':' + this.advance().value
        subcommands.push({ kind: 'in', dimension: dim })
      } else {
        this.error(`Unexpected token in execute statement: '${this.peek().value || this.peek().kind}'. Valid subcommands: as, at, positioned, align, facing, rotated, anchored, if, unless, in, store`)
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
      if (this.checkIdent('matches')) {
        this.advance()
        const range = this.advance().value
        subcommands.push({ kind: type === 'if' ? 'if_score_range' : 'unless_score_range', target, targetObj, range })
      } else {
        const op = this.advance().value
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

  // -------------------------------------------------------------------------
  // Expression statement
  // -------------------------------------------------------------------------

  private parseExprStmt(): Stmt {
    const expr = this.parseExpr()
    this.match(';')
    const exprToken = this.getLocToken(expr) ?? this.peek()
    return this.withLoc({ kind: 'expr', expr }, exprToken)
  }
}
