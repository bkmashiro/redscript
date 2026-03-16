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
      expect(() => compileLenient(`
fn test() {
    let x: int = undeclared;
}
`)).not.toThrow()
    })

    it('returns type errors as warnings in lenient mode', () => {
      const result = compileLenient(`
fn test() {
    let x: int = undeclared;
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

  describe('int/float implicit conversion checks', () => {
    it('detects int assigned to float variable', () => {
      // int literal assigned to float — different types
      const errors = typeCheck(`
fn test() {
    let x: float = 5;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert int to float')
      expect(errors[0].message).toContain('as float')
    })

    it('detects float assigned to int variable', () => {
      const errors = typeCheck(`
fn get_f() -> float {
    return 3.14;
}
fn test() {
    let x: int = get_f();
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert')
    })

    it('detects int/float return type mismatch', () => {
      const errors = typeCheck(`
fn get_float() -> float {
    return 5;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert int to float')
      expect(errors[0].message).toContain('as float')
    })

    it('detects float/int return type mismatch', () => {
      const errors = typeCheck(`
fn get_int() -> int {
    return 3.14;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot implicitly convert float to int')
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

    it('allows float assigned to float variable', () => {
      const errors = typeCheck(`
fn get_f() -> float {
    return 3.14;
}
fn test() {
    let x: float = get_f();
}
`)
      expect(errors).toHaveLength(0)
    })

    it('blocks compilation on int→float mismatch', () => {
      expect(() => compileStrict(`
fn get_float() -> float {
    return 5;
}
`)).toThrow()
    })

    it('int→float mismatch demoted to warning in lenient mode', () => {
      const result = compileLenient(`
fn get_float() -> float {
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
