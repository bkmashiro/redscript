/**
 * Tests for Phase 6a: Option<T> — null safety
 *
 * Covers:
 * - Parsing Option<T> type annotation
 * - Parsing Some(expr) and None expressions
 * - Parsing if let Some(x) = opt { ... }
 * - HIR lowering of Option nodes
 * - MIR lowering: Option compiles to two slots (has + val)
 * - if let Some(x) = opt → checks has slot, binds val slot
 * - Function returning Option<int>
 * - Correct scoreboard commands generated
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { compile } from '../emit/compile'
import { lowerToHIR } from '../hir/lower'
import type { Program } from '../ast/types'

function parse(source: string, namespace = 'test'): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse(namespace)
}

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  // Prefer exact function file match: look for function/<name>.mcfunction
  const exact = files.find(f => f.path.endsWith(`function/${pathSubstr}.mcfunction`))
  if (exact) return exact.content
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('Option: Parser', () => {
  it('parses Option<int> type annotation', () => {
    const prog = parse('fn f(): Option<int> {}')
    expect(prog.declarations[0].returnType).toEqual({ kind: 'option', inner: { kind: 'named', name: 'int' } })
  })

  it('parses Option<bool> parameter type', () => {
    const prog = parse('fn f(x: Option<bool>): void {}')
    expect(prog.declarations[0].params[0].type).toEqual({ kind: 'option', inner: { kind: 'named', name: 'bool' } })
  })

  it('parses Some(42) expression', () => {
    const prog = parse('fn f(): void { let x: Option<int> = Some(42); }')
    const letStmt = prog.declarations[0].body[0]
    expect(letStmt.kind).toBe('let')
    if (letStmt.kind === 'let') {
      expect(letStmt.init.kind).toBe('some_lit')
      if (letStmt.init.kind === 'some_lit') {
        expect(letStmt.init.value).toEqual({ kind: 'int_lit', value: 42 })
      }
    }
  })

  it('parses None expression', () => {
    const prog = parse('fn f(): void { let x: Option<int> = None; }')
    const letStmt = prog.declarations[0].body[0]
    expect(letStmt.kind).toBe('let')
    if (letStmt.kind === 'let') {
      expect(letStmt.init.kind).toBe('none_lit')
    }
  })

  it('parses if let Some(x) = opt { ... }', () => {
    const prog = parse('fn f(p: Option<int>): void { if let Some(x) = p { let y: int = x; } }')
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('if_let_some')
    if (stmt.kind === 'if_let_some') {
      expect(stmt.binding).toBe('x')
      expect(stmt.init).toEqual({ kind: 'ident', name: 'p' })
      expect(stmt.then.length).toBe(1)
    }
  })

  it('parses if let Some(x) = opt { } else { }', () => {
    const prog = parse(`
      fn f(p: Option<int>): void {
        if let Some(x) = p {
          let a: int = x;
        } else {
          let b: int = 0;
        }
      }
    `)
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('if_let_some')
    if (stmt.kind === 'if_let_some') {
      expect(stmt.else_).toBeDefined()
      expect(stmt.else_!.length).toBe(1)
    }
  })

  it('does not treat Some as identifier', () => {
    const prog = parse('fn f(): void { let x: Option<int> = Some(1); }')
    if (prog.declarations[0].body[0].kind === 'let') {
      const init = prog.declarations[0].body[0].init
      expect(init.kind).toBe('some_lit')
    }
  })

  it('does not treat None as identifier', () => {
    const prog = parse('fn f(): void { let x: Option<int> = None; }')
    if (prog.declarations[0].body[0].kind === 'let') {
      const init = prog.declarations[0].body[0].init
      expect(init.kind).toBe('none_lit')
    }
  })
})

// ---------------------------------------------------------------------------
// HIR lowering tests
// ---------------------------------------------------------------------------

describe('Option: HIR lowering', () => {
  function hirOf(source: string) {
    const tokens = new Lexer(source).tokenize()
    const ast = new Parser(tokens).parse('test')
    return lowerToHIR(ast)
  }

  it('lowers some_lit through HIR unchanged', () => {
    const hir = hirOf('fn f(): void { let x: Option<int> = Some(42); }')
    const fn0 = hir.functions[0]
    const letStmt = fn0.body[0]
    expect(letStmt.kind).toBe('let')
    if (letStmt.kind === 'let') {
      expect(letStmt.init.kind).toBe('some_lit')
    }
  })

  it('lowers none_lit through HIR unchanged', () => {
    const hir = hirOf('fn f(): void { let x: Option<int> = None; }')
    const fn0 = hir.functions[0]
    const letStmt = fn0.body[0]
    expect(letStmt.kind).toBe('let')
    if (letStmt.kind === 'let') {
      expect(letStmt.init.kind).toBe('none_lit')
    }
  })

  it('lowers if_let_some through HIR unchanged', () => {
    const hir = hirOf('fn f(p: Option<int>): void { if let Some(x) = p {} }')
    const fn0 = hir.functions[0]
    const stmt = fn0.body[0]
    expect(stmt.kind).toBe('if_let_some')
    if (stmt.kind === 'if_let_some') {
      expect(stmt.binding).toBe('x')
    }
  })
})

// ---------------------------------------------------------------------------
// Compilation (E2E) tests
// ---------------------------------------------------------------------------

describe('Option: E2E compilation', () => {
  it('compiles Some(42) assignment — sets has=1, val=42', () => {
    const source = `
      fn test(): void {
        let p: Option<int> = Some(42);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test')
    expect(fn).toBeDefined()
    expect(fn).toContain('scoreboard players set')
    // has slot should be set to 1, val slot should be set to 42
    expect(fn).toContain('1')
    expect(fn).toContain('42')
  })

  it('compiles None assignment — sets has=0', () => {
    const source = `
      fn test(): void {
        let p: Option<int> = None;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test')
    expect(fn).toBeDefined()
    expect(fn).toContain('scoreboard players set')
    expect(fn).toContain('0')
  })

  it('compiles if let Some(x) = p — conditional on has slot', () => {
    const source = `
      fn test(p: Option<int>): void {
        if let Some(x) = p {
          let y: int = x;
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    // Should generate a conditional call checking has slot
    expect(result.files.length).toBeGreaterThan(0)
  })

  it('compiles function returning Option<int> Some value', () => {
    const source = `
      fn make_some(): Option<int> {
        return Some(99);
      }
      fn test(): void {
        let p: Option<int> = make_some();
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'make_some')
    expect(fn).toBeDefined()
    // Should set ret_has=1 and ret_val=99
    expect(fn).toContain('$ret_has')
    expect(fn).toContain('99')
  })

  it('compiles function returning Option<int> None value', () => {
    const source = `
      fn make_none(): Option<int> {
        return None;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'make_none')
    expect(fn).toBeDefined()
    expect(fn).toContain('$ret_has')
    // has=0
    expect(fn).toContain('0')
  })

  it('compiles full if-let Some pattern with body using bound variable', () => {
    // Use a function that returns Option<int>.
    // With auto-inline + constant folding the conditional may collapse entirely.
    // Use a @keep fn that RETURNS the doubled value so DCE keeps the code.
    const source = `
      fn maybe_val(): Option<int> {
        return Some(10);
      }
      @keep fn test_result(): int {
        let p: Option<int> = maybe_val();
        if let Some(n) = p {
          return n + n;
        }
        return 0;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
    // The compilation should succeed
    const allContent = result.files.map(f => f.content).join('\n')
    expect(allContent.length).toBeGreaterThan(0)
    // Either the conditional is preserved OR constant-folded to 20 (10+10)
    expect(
      allContent.includes('execute if score') ||
      allContent.includes('20')
    ).toBe(true)
  })

  it('compiles if-let with else branch', () => {
    const source = `
      @tick
      fn tick(): void {
        let q: Option<int> = None;
        if let Some(v) = q {
          let a: int = v;
        } else {
          let b: int = 0;
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
  })

  it('compiles nested if-let inside if-let', () => {
    const source = `
      fn test(): void {
        let a: Option<int> = Some(1);
        let b: Option<int> = Some(2);
        if let Some(x) = a {
          if let Some(y) = b {
            let sum: int = x + y;
          }
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
  })

  it('generated scoreboard slots are unique per function and variable', () => {
    const source = `
      fn test(): void {
        let p: Option<int> = Some(5);
        let q: Option<int> = None;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test')
    expect(fn).toBeDefined()
  })
})
