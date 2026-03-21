/**
 * Tests for @deprecated decorator and compile-time deprecation warnings.
 */

import { compile } from '../../emit/compile'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { monomorphize } from '../../hir/monomorphize'
import { checkDeprecatedCalls } from '../../hir/deprecated'

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
