/**
 * Phase 6b: TypeChecker strict (error-mode) tests
 *
 * Covers:
 * - Type errors now block compilation (error-mode default)
 * - --lenient flag demotes type errors to warnings
 * - int/float implicit conversion detection
 * - redscript check command correctly reports type errors
 */

import { compile } from '../emit/compile'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { TypeChecker } from '../typechecker'
import type { DiagnosticError } from '../diagnostics'

// Helper: run TypeChecker directly
function typeCheck(source: string): DiagnosticError[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const checker = new TypeChecker(source)
  return checker.check(ast)
}

// Helper: compile in strict mode (default)
function compileStrict(source: string): void {
  compile(source, { namespace: 'test' })
}

// Helper: compile in lenient mode
function compileLenient(source: string): { warnings: string[] } {
  return compile(source, { namespace: 'test', lenient: true })
}

describe('TypeChecker error-mode (Phase 6b)', () => {
  describe('type errors block compilation', () => {
    it('throws on undeclared variable usage', () => {
      expect(() => compileStrict(`
fn test() {
    let x: int = undeclared;
}
`)).toThrow()
    })

    it('throws on return type mismatch', () => {
      expect(() => compileStrict(`
fn get_bool() -> bool {
    return 5;
}
`)).toThrow()
    })

    it('throws on wrong argument count', () => {
      expect(() => compileStrict(`
fn add(a: int, b: int) -> int {
    return a + b;
}
fn test() {
    let x: int = add(1);
}
`)).toThrow()
    })

    it('does not throw for valid programs', () => {
      expect(() => compileStrict(`
fn add(a: int, b: int) -> int {
    return a + b;
}
fn test() {
    let x: int = add(1, 2);
}
`)).not.toThrow()
    })
  })

  describe('--lenient mode', () => {
    it('does not throw on type errors in lenient mode', () => {
      // Lenient mode demotes TypeChecker errors to warnings, but undeclared
      // identifiers also cause an unrecoverable crash at MIR lowering.
      // Use a type-mismatch (caught by TypeChecker) instead of an undeclared var.
      expect(() => compileLenient(`
fn test() {
    let x: int = "hello";
}
`)).not.toThrow()
    })

    it('returns type errors as warnings in lenient mode', () => {
      const result = compileLenient(`
fn test() {
    let x: int = "hello";
}
`)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('TypeError')
    })

    it('emits no warnings for valid programs in lenient mode', () => {
      const result = compileLenient(`
fn test() {
    let x: int = 5;
}
`)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('int/fixed implicit conversion checks', () => {
    it('detects int assigned to fixed variable', () => {
      // int literal assigned to fixed — different types
      const errors = typeCheck(`
fn test() {
    let x: fixed = 5;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert int to fixed')
      expect(errors[0].message).toContain('as fixed')
    })

    it('detects fixed assigned to int variable', () => {
      const errors = typeCheck(`
fn get_f() -> fixed {
    return 3.14;
}
fn test() {
    let x: int = get_f();
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert')
    })

    it('detects int/fixed return type mismatch', () => {
      const errors = typeCheck(`
fn get_fixed() -> fixed {
    return 5;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert int to fixed')
      expect(errors[0].message).toContain('as fixed')
    })

    it('detects fixed/int return type mismatch', () => {
      const errors = typeCheck(`
fn get_int() -> int {
    return 3.14;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert fixed to int')
      expect(errors[0].message).toContain('as int')
    })

    it('allows int assigned to int variable', () => {
      const errors = typeCheck(`
fn test() {
    let x: int = 5;
}
`)
      expect(errors).toHaveLength(0)
    })

    it('allows fixed assigned to fixed variable', () => {
      const errors = typeCheck(`
fn get_f() -> fixed {
    return 3.14;
}
fn test() {
    let x: fixed = get_f();
}
`)
      expect(errors).toHaveLength(0)
    })

    it.each([
      ['fixed + int', 'let x = 1.5 + 2;'],
      ['int + fixed', 'let x = 2 + 1.5;'],
      ['double + fixed', 'let x = 1.0d + 2.5;'],
      ['fixed + double', 'let x = 2.5 + 1.0d;'],
      ['double + int', 'let x = 1.0d + 2;'],
      ['int + double', 'let x = 2 + 1.0d;'],
    ])('requires explicit casts for mixed numeric binary arithmetic: %s', (_label, statement) => {
      const errors = typeCheck(`
fn test() {
    ${statement}
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('Mixed numeric arithmetic requires explicit casts')
    })

    it.each([
      ['int + int', 'let x = 1 + 2;'],
      ['fixed + fixed', 'let x = 1.5 + 2.5;'],
      ['double + double', 'let x = 1.0d + 2.0d;'],
      ['float + fixed legacy alias', 'let a: float = 1.0; let b: fixed = 2.0; let x = a + b;'],
    ])('allows same-family numeric binary arithmetic: %s', (_label, statements) => {
      const errors = typeCheck(`
fn test() {
    ${statements}
}
`)
      expect(errors).toHaveLength(0)
    })

    it('blocks compilation on mixed numeric binary arithmetic in strict mode', () => {
      expect(() => compileStrict(`
fn test() {
    let x = 1.5 + 2;
}
`)).toThrow()
    })

    it('mixed numeric binary arithmetic is demoted to warning in lenient mode', () => {
      const result = compileLenient(`
fn test() {
    let x = 1.5 + 2;
}
`)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('Mixed numeric arithmetic requires explicit casts')
    })

    it('blocks compilation on int→fixed mismatch', () => {
      expect(() => compileStrict(`
fn get_fixed() -> fixed {
    return 5;
}
`)).toThrow()
    })

    it('int→fixed mismatch demoted to warning in lenient mode', () => {
      const result = compileLenient(`
fn get_fixed() -> fixed {
    return 5;
}
`)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('TypeError')
    })
  })

  describe('redscript check command behavior', () => {
    it('TypeChecker check() returns errors for type mismatches', () => {
      const errors = typeCheck(`
fn test() {
    let x: int = undeclared;
    let y: bool = 1;
}
`)
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it('TypeChecker check() returns empty array for valid programs', () => {
      const errors = typeCheck(`
struct Point { x: int, y: int }

fn test() {
    let p: Point = { x: 10, y: 20 };
    let val: int = p.x;
}
`)
      expect(errors).toHaveLength(0)
    })
  })
})
