/**
 * Tests for @deprecated decorator and compile-time deprecation warnings.
 */

import { compile } from '../../emit/compile'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { monomorphize } from '../../hir/monomorphize'
import { checkDeprecatedCalls } from '../../hir/deprecated'
import type { Decorator, HIRExpr, HIRFunction, HIRModule, HIRStmt, Span } from '../../hir/types'

// ---------------------------------------------------------------------------
// Parser: recognizes @deprecated decorator
// ---------------------------------------------------------------------------

describe('@deprecated decorator — parser', () => {
  it('parses @deprecated("message") on a function', () => {
    const src = `
      @deprecated("use take_damage() instead")
      fn apply_damage(amount: int) {
        let x: int = amount
      }
    `
    const tokens = new Lexer(src).tokenize()
    const ast = new Parser(tokens, src).parse('test')
    expect(ast.declarations).toHaveLength(1)
    const fn = ast.declarations[0]
    expect(fn.decorators).toHaveLength(1)
    const dec = fn.decorators[0]
    expect(dec.name).toBe('deprecated')
    expect(dec.args?.message).toBe('use take_damage() instead')
  })

  it('parses @deprecated with no message', () => {
    const src = `
      @deprecated("")
      fn old_fn() {
        let x: int = 1
      }
    `
    const tokens = new Lexer(src).tokenize()
    const ast = new Parser(tokens, src).parse('test')
    const fn = ast.declarations[0]
    const dec = fn.decorators[0]
    expect(dec.name).toBe('deprecated')
    expect(dec.args?.message).toBe('')
  })
})

// ---------------------------------------------------------------------------
// HIR: deprecated function marked in decorators
// ---------------------------------------------------------------------------

describe('@deprecated decorator — HIR', () => {
  it('preserves @deprecated decorator in HIR function', () => {
    const src = `
      @deprecated("use new_fn() instead")
      fn old_fn(x: int) {
        let y: int = x
      }
    `
    const tokens = new Lexer(src).tokenize()
    const ast = new Parser(tokens, src).parse('test')
    const hir = lowerToHIR(ast)
    const fn = hir.functions.find(f => f.name === 'old_fn')!
    expect(fn).toBeDefined()
    const dep = fn.decorators.find(d => d.name === 'deprecated')
    expect(dep).toBeDefined()
    expect(dep!.args?.message).toBe('use new_fn() instead')
  })
})

// ---------------------------------------------------------------------------
// checkDeprecatedCalls: warning generation
// ---------------------------------------------------------------------------

describe('checkDeprecatedCalls', () => {
  it('emits warning when a deprecated function is called', () => {
    const src = `
      @deprecated("use take_damage() instead")
      fn apply_damage(amount: int) {
        let x: int = amount
      }

      fn test() {
        apply_damage(5)
      }
    `
    const tokens = new Lexer(src).tokenize()
    const ast = new Parser(tokens, src).parse('test')
    const hirRaw = lowerToHIR(ast)
    const hir = monomorphize(hirRaw)
    const warnings = checkDeprecatedCalls(hir)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('apply_damage')
    expect(warnings[0]).toContain('deprecated')
    expect(warnings[0]).toContain('use take_damage() instead')
    expect(warnings[0]).toContain('[DeprecatedUsage]')
  })

  it('emits no warning when calling a non-deprecated function', () => {
    const src = `
      fn safe_fn(amount: int) {
        let x: int = amount
      }

      fn test() {
        safe_fn(5)
      }
    `
    const tokens = new Lexer(src).tokenize()
    const ast = new Parser(tokens, src).parse('test')
    const hirRaw = lowerToHIR(ast)
    const hir = monomorphize(hirRaw)
    const warnings = checkDeprecatedCalls(hir)
    expect(warnings).toHaveLength(0)
  })

  it('emits warning with caller function name in message', () => {
    const src = `
      @deprecated("old api")
      fn old_api() {
        let x: int = 1
      }

      fn caller_fn() {
        old_api()
      }
    `
    const tokens = new Lexer(src).tokenize()
    const ast = new Parser(tokens, src).parse('test')
    const hirRaw = lowerToHIR(ast)
    const hir = monomorphize(hirRaw)
    const warnings = checkDeprecatedCalls(hir)
    expect(warnings[0]).toContain("caller_fn")
    expect(warnings[0]).toContain("old_api")
  })

  it('emits multiple warnings when deprecated fn is called multiple times', () => {
    const src = `
      @deprecated("outdated")
      fn legacy(x: int) {
        let y: int = x
      }

      fn main_fn() {
        legacy(1)
        legacy(2)
        legacy(3)
      }
    `
    const tokens = new Lexer(src).tokenize()
    const ast = new Parser(tokens, src).parse('test')
    const hirRaw = lowerToHIR(ast)
    const hir = monomorphize(hirRaw)
    const warnings = checkDeprecatedCalls(hir)
    expect(warnings).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// compile(): end-to-end — warnings propagate through full pipeline
// ---------------------------------------------------------------------------

describe('@deprecated end-to-end via compile()', () => {
  it('emits [DeprecatedUsage] warning in compile result', () => {
    const src = `
      @deprecated("use take_damage() instead")
      @tick
      fn apply_damage() {
        let x: int = 1
      }

      @tick
      fn test_caller() {
        apply_damage()
      }
    `
    const result = compile(src, { namespace: 'test' })
    const depWarnings = result.warnings.filter(w => w.includes('[DeprecatedUsage]'))
    expect(depWarnings).toHaveLength(1)
    expect(depWarnings[0]).toContain('apply_damage')
    expect(depWarnings[0]).toContain('use take_damage() instead')
  })

  it('does not emit warnings when no deprecated calls exist', () => {
    const src = `
      @tick
      fn safe_fn() {
        let x: int = 1
      }
    `
    const result = compile(src, { namespace: 'test' })
    const depWarnings = result.warnings.filter(w => w.includes('[DeprecatedUsage]'))
    expect(depWarnings).toHaveLength(0)
  })

  it('deprecated function itself can still compile successfully', () => {
    const src = `
      @deprecated("use new_fn()")
      @tick
      fn old_fn() {
        let x: int = 42
      }
    `
    // Should compile without throwing — @deprecated doesn't prevent compilation
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })
})

function mkDecorator(message?: string): Decorator {
  return message === undefined ? { name: 'deprecated' } : { name: 'deprecated', args: { message } }
}

function mkFn(name: string, body: HIRStmt[], decorators: Decorator[] = []): HIRFunction {
  return {
    name,
    params: [],
    returnType: { kind: 'named', name: 'void' },
    decorators,
    body,
  }
}

function span(line: number, col = 1): Span {
  return { line, col }
}

function call(fn: string, callSpan?: Span): HIRExpr {
  return callSpan ? { kind: 'call', fn, args: [], span: callSpan } : { kind: 'call', fn, args: [] }
}

describe('checkDeprecatedCalls — manual walker coverage', () => {
  it('walks nested stmt/expr forms and skips execute/raw-style statements', () => {
    const module: HIRModule = {
      namespace: 'test',
      globals: [],
      structs: [],
      enums: [],
      consts: [],
      functions: [
        mkFn('old_fn', [], [mkDecorator('use new_fn')]),
        mkFn('old_empty', [], [mkDecorator()]),
        mkFn('caller', [
          { kind: 'let', name: 'a', init: call('old_fn', span(1, 2)) },
          { kind: 'expr', expr: call('old_empty') },
          { kind: 'return' },
          { kind: 'if', cond: call('old_fn'), then: [{ kind: 'expr', expr: call('old_fn') }], else_: [{ kind: 'expr', expr: call('old_empty') }] },
          { kind: 'if', cond: call('old_fn'), then: [] },
          { kind: 'while', cond: call('old_fn'), body: [{ kind: 'expr', expr: call('old_fn') }], step: [{ kind: 'expr', expr: call('old_empty') }] },
          { kind: 'while', cond: call('old_fn'), body: [] },
          { kind: 'foreach', binding: 'item', iterable: call('old_fn'), body: [{ kind: 'expr', expr: call('old_fn') }] },
          { kind: 'match', expr: call('old_fn'), arms: [{ pattern: { kind: 'PatWild' }, body: [{ kind: 'expr', expr: call('old_fn') }] }] },
          { kind: 'execute', subcommands: [], body: [{ kind: 'expr', expr: call('old_fn') }] },
          { kind: 'raw', cmd: 'say ignored' },
          { kind: 'break' },
          { kind: 'continue' },
          { kind: 'expr', expr: { kind: 'static_call', type: 'Box', method: 'old_method', args: [], span: span(3, 4) } },
          { kind: 'expr', expr: { kind: 'static_call', type: 'Box', method: 'old_empty_method', args: [] } },
          { kind: 'expr', expr: { kind: 'invoke', callee: call('old_fn'), args: [call('old_empty')] } },
          { kind: 'expr', expr: { kind: 'binary', op: '+', left: call('old_fn'), right: call('old_empty') } },
          { kind: 'expr', expr: { kind: 'unary', op: '-', operand: call('old_fn') } },
          { kind: 'expr', expr: { kind: 'is_check', expr: call('old_fn'), entityType: 'entity' } },
          { kind: 'expr', expr: { kind: 'type_cast', expr: call('old_fn'), targetType: { kind: 'named', name: 'int' } } },
          { kind: 'expr', expr: { kind: 'assign', target: 'value', value: call('old_fn') } },
          { kind: 'expr', expr: { kind: 'member_assign', obj: call('old_fn'), field: 'x', value: call('old_empty') } },
          { kind: 'expr', expr: { kind: 'index_assign', obj: call('old_fn'), index: call('old_empty'), op: '=', value: call('old_fn') } },
          { kind: 'expr', expr: { kind: 'member', obj: call('old_fn'), field: 'x' } },
          { kind: 'expr', expr: { kind: 'index', obj: call('old_fn'), index: call('old_empty') } },
          { kind: 'expr', expr: { kind: 'array_lit', elements: [call('old_fn')] } },
          { kind: 'expr', expr: { kind: 'struct_lit', fields: [{ name: 'x', value: call('old_fn') }] } },
          { kind: 'expr', expr: { kind: 'str_interp', parts: ['x=', call('old_fn')] } },
          { kind: 'expr', expr: { kind: 'f_string', parts: [{ kind: 'text', value: 'x=' }, { kind: 'expr', expr: call('old_fn') }] } },
          { kind: 'expr', expr: { kind: 'some_lit', value: call('old_fn') } },
          { kind: 'expr', expr: { kind: 'unwrap_or', opt: call('old_fn'), default_: call('old_empty') } },
          { kind: 'expr', expr: { kind: 'lambda', params: [], body: [{ kind: 'expr', expr: call('old_fn') }] } },
          { kind: 'expr', expr: { kind: 'lambda', params: [], body: call('old_empty') } },
          { kind: 'expr', expr: { kind: 'tuple_lit', elements: [call('old_fn')] } },
          { kind: 'expr', expr: { kind: 'enum_construct', enumName: 'State', variant: 'On', args: [{ name: 'value', value: call('old_fn') }] } },
        ]),
      ],
      implBlocks: [
        {
          typeName: 'Box',
          methods: [
            mkFn('old_method', [], [mkDecorator('use Box::new_method')]),
            mkFn('old_empty_method', [], [mkDecorator()]),
            mkFn('helper', []),
          ],
        },
      ],
    }

    const warnings = checkDeprecatedCalls(module)

    expect(warnings).toHaveLength(43)
    expect(warnings.some(w => w.includes("line 1, col 2: 'old_fn' is deprecated: use new_fn"))).toBe(true)
    expect(warnings.some(w => w.includes("'old_empty' is deprecated (called from 'caller')"))).toBe(true)
    expect(warnings.some(w => w.includes("line 3, col 4: 'Box::old_method' is deprecated: use Box::new_method"))).toBe(true)
    expect(warnings.some(w => w.includes("'Box::old_empty_method' is deprecated (called from 'caller')"))).toBe(true)
    expect(warnings.some(w => w.includes('(called from \'caller\')'))).toBe(true)
    expect(warnings.some(w => w.includes('line 3, col 4'))).toBe(true)
  })
})
