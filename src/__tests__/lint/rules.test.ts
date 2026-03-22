/**
 * Tests for redscript lint rules.
 * Each rule has 2-3 test cases.
 */

import { lintString } from '../../lint/index'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function lint(source: string, opts: { maxFunctionLines?: number } = {}) {
  return lintString(source, '<test>', 'test', opts)
}

function ruleNames(source: string, opts: { maxFunctionLines?: number } = {}) {
  return lint(source, opts).map(w => w.rule)
}

function messages(source: string, opts: { maxFunctionLines?: number } = {}) {
  return lint(source, opts).map(w => w.message)
}

// ---------------------------------------------------------------------------
// Rule: unused-variable
// ---------------------------------------------------------------------------

describe('unused-variable', () => {
  it('warns when a let variable is never read', () => {
    const src = `
fn foo(): void {
  let x: int = 5;
}
`
    const rules = ruleNames(src)
    expect(rules).toContain('unused-variable')
    const msgs = messages(src)
    expect(msgs.some(m => m.includes('"x"') && m.includes('never used'))).toBe(true)
  })

  it('does NOT warn when the variable is read', () => {
    const src = `
fn foo(): int {
  let x: int = 5;
  return x;
}
`
    const warnings = lint(src).filter(w => w.rule === 'unused-variable')
    expect(warnings).toHaveLength(0)
  })

  it('warns for multiple unused variables in the same function', () => {
    const src = `
fn bar(): void {
  let a: int = 1;
  let b: int = 2;
}
`
    const warnings = lint(src).filter(w => w.rule === 'unused-variable')
    // both a and b are unused
    const names = warnings.map(w => w.message).join(',')
    expect(names).toContain('"a"')
    expect(names).toContain('"b"')
  })
})

// ---------------------------------------------------------------------------
// Rule: unused-import
// ---------------------------------------------------------------------------

describe('unused-import', () => {
  it('warns when an imported symbol is never used', () => {
    // Use a simple import that the parser will accept
    const src = `
import mylib::helper;

fn main(): void {
  say("hello");
}
`
    const warnings = lint(src).filter(w => w.rule === 'unused-import')
    // The import "helper" from "mylib" is never called
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].message).toContain('"helper"')
  })

  it('does NOT warn when the imported symbol is called', () => {
    const src = `
import mylib::helper;

fn main(): void {
  helper();
}
`
    const warnings = lint(src).filter(w => w.rule === 'unused-import')
    expect(warnings).toHaveLength(0)
  })

  it('warns for each individually unused named import', () => {
    const src = `
import mylib::alpha;
import mylib::beta;

fn main(): void {
  alpha();
}
`
    const warnings = lint(src).filter(w => w.rule === 'unused-import')
    // only beta is unused
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('"beta"')
  })
})

// ---------------------------------------------------------------------------
// Rule: magic-number
// ---------------------------------------------------------------------------

describe('magic-number', () => {
  it('warns for literal numbers greater than 1', () => {
    const src = `
fn foo(): void {
  let x: int = 1000;
}
`
    const warnings = lint(src).filter(w => w.rule === 'magic-number')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].message).toContain('1000')
  })

  it('does NOT warn for 0 or 1', () => {
    const src = `
fn foo(): int {
  let a: int = 0;
  let b: int = 1;
  return a + b;
}
`
    const warnings = lint(src).filter(w => w.rule === 'magic-number')
    expect(warnings).toHaveLength(0)
  })

  it('does NOT warn for numbers in const declarations', () => {
    const src = `
const MAX_PLAYERS: int = 100;

fn foo(): void {
  say("ok");
}
`
    const warnings = lint(src).filter(w => w.rule === 'magic-number')
    expect(warnings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule: dead-branch
// ---------------------------------------------------------------------------

describe('dead-branch', () => {
  it('warns for if (1 == 2) — always false condition', () => {
    const src = `
fn foo(): void {
  if 1 == 2 {
    say("never");
  }
}
`
    const warnings = lint(src).filter(w => w.rule === 'dead-branch')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].message).toContain('always false')
  })

  it('warns for if (3 == 3) — always true condition', () => {
    const src = `
fn foo(): void {
  if 3 == 3 {
    say("always");
  }
}
`
    const warnings = lint(src).filter(w => w.rule === 'dead-branch')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].message).toContain('always true')
  })

  it('does NOT warn for dynamic conditions', () => {
    const src = `
fn foo(x: int): void {
  if x == 5 {
    say("maybe");
  }
}
`
    const warnings = lint(src).filter(w => w.rule === 'dead-branch')
    expect(warnings).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule: function-too-long
// ---------------------------------------------------------------------------

describe('function-too-long', () => {
  it('warns when function body exceeds maxFunctionLines', () => {
    // Build a function with 60 statements
    const stmts = Array.from({ length: 60 }, (_, i) => `  say("line ${i}");`).join('\n')
    const src = `fn long_fn(): void {\n${stmts}\n}`
    const warnings = lint(src, { maxFunctionLines: 50 }).filter(w => w.rule === 'function-too-long')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].message).toContain('"long_fn"')
  })

  it('does NOT warn when function is within the limit', () => {
    const stmts = Array.from({ length: 5 }, (_, i) => `  say("line ${i}");`).join('\n')
    const src = `fn short_fn(): void {\n${stmts}\n}`
    const warnings = lint(src, { maxFunctionLines: 50 }).filter(w => w.rule === 'function-too-long')
    expect(warnings).toHaveLength(0)
  })

  it('respects custom maxFunctionLines threshold', () => {
    const stmts = Array.from({ length: 10 }, (_, i) => `  say("s${i}");`).join('\n')
    const src = `fn medium_fn(): void {\n${stmts}\n}`
    // With default 50 it's fine, with threshold 5 it should warn
    const noWarn = lint(src, { maxFunctionLines: 50 }).filter(w => w.rule === 'function-too-long')
    expect(noWarn).toHaveLength(0)
    const warn = lint(src, { maxFunctionLines: 5 }).filter(w => w.rule === 'function-too-long')
    expect(warn.length).toBeGreaterThan(0)
  })
})
