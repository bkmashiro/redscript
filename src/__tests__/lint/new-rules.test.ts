/**
 * Tests for the 5 new redscript lint rules:
 *   no-dead-assignment
 *   prefer-match-exhaustive
 *   no-empty-catch
 *   naming-convention
 *   no-magic-numbers
 */

import { lintString } from '../../lint/index'

function lint(source: string, opts: { maxFunctionLines?: number; allowedNumbers?: number[] } = {}) {
  return lintString(source, '<test>', 'test', opts)
}

function warnings(source: string, rule: string, opts: { allowedNumbers?: number[] } = {}) {
  return lint(source, opts).filter(w => w.rule === rule)
}

// ---------------------------------------------------------------------------
// Rule: no-dead-assignment
// ---------------------------------------------------------------------------

describe('no-dead-assignment', () => {
  it('warns when a variable is assigned then immediately overwritten without being read', () => {
    const src = `
fn foo(): void {
  let x: int = 0;
  x = 5;
  x = 10;
  say("done");
}
`
    const w = warnings(src, 'no-dead-assignment')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('"x"')
    expect(w[0].message).toContain('never read')
  })

  it('does NOT warn when each assignment is read before the next one', () => {
    // x is read (return x + y) after all assignments
    // y is read (return x + y)
    const src = `
fn foo(): int {
  let x: int = 5;
  let y: int = x;
  x = 10;
  return x + y;
}
`
    const w = warnings(src, 'no-dead-assignment')
    // x is not overwritten without being read between assignments here:
    // let x=5 → pending; y reads x → pending cleared; x=10 → no prior pending; return x reads x
    expect(w).toHaveLength(0)
  })

  it('warns when let init is immediately overwritten without being read', () => {
    // The initial let value is dead because x is reassigned before any read
    const src = `
fn foo(): int {
  let x: int = 0;
  x = 42;
  return x;
}
`
    // let x=0 is dead (overwritten by x=42 before x is read)
    const w = warnings(src, 'no-dead-assignment')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('"x"')
  })

  it('warns for multiple dead assignments in the same function', () => {
    const src = `
fn bar(): void {
  let a: int = 0;
  let b: int = 0;
  a = 1;
  a = 2;
  b = 3;
  b = 4;
  say("done");
}
`
    const w = warnings(src, 'no-dead-assignment')
    const msgs = w.map(warn => warn.message)
    expect(msgs.some(m => m.includes('"a"'))).toBe(true)
    expect(msgs.some(m => m.includes('"b"'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rule: prefer-match-exhaustive
// ---------------------------------------------------------------------------

describe('prefer-match-exhaustive', () => {
  it('warns when Option match is missing the None arm', () => {
    const src = `
fn foo(x: Option<int>): void {
  match x {
    Some(v) => { say("got value"); }
  }
}
`
    const w = warnings(src, 'prefer-match-exhaustive')
    expect(w.length).toBeGreaterThan(0)
    expect(w.some(warn => warn.message.includes('None'))).toBe(true)
  })

  it('warns when Option match is missing the Some arm', () => {
    const src = `
fn foo(x: Option<int>): void {
  match x {
    None => { say("nothing"); }
  }
}
`
    const w = warnings(src, 'prefer-match-exhaustive')
    expect(w.length).toBeGreaterThan(0)
    expect(w.some(warn => warn.message.includes('Some'))).toBe(true)
  })

  it('does NOT warn when both Some and None arms are present', () => {
    const src = `
fn foo(x: Option<int>): void {
  match x {
    Some(v) => { say("got value"); }
    None => { say("nothing"); }
  }
}
`
    const w = warnings(src, 'prefer-match-exhaustive')
    expect(w).toHaveLength(0)
  })

  it('does NOT warn when a wildcard arm is present', () => {
    const src = `
fn foo(x: Option<int>): void {
  match x {
    Some(v) => { say("got"); }
    _ => { say("other"); }
  }
}
`
    const w = warnings(src, 'prefer-match-exhaustive')
    expect(w).toHaveLength(0)
  })

  it('does NOT warn for non-Option integer match', () => {
    const src = `
fn foo(x: int): void {
  match x {
    1 => { say("one"); }
    2 => { say("two"); }
    _ => { say("other"); }
  }
}
`
    const w = warnings(src, 'prefer-match-exhaustive')
    expect(w).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule: no-empty-catch
// ---------------------------------------------------------------------------

describe('no-empty-catch', () => {
  it('warns when if let Some has an empty else block', () => {
    const src = `
fn foo(x: Option<int>): void {
  if let Some(v) = x {
    say("got it");
  } else {}
}
`
    const w = warnings(src, 'no-empty-catch')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('None case is silently ignored')
  })

  it('does NOT warn when if let Some has no else block', () => {
    const src = `
fn foo(x: Option<int>): void {
  if let Some(v) = x {
    say("got it");
  }
}
`
    const w = warnings(src, 'no-empty-catch')
    expect(w).toHaveLength(0)
  })

  it('does NOT warn when else block has statements', () => {
    const src = `
fn foo(x: Option<int>): void {
  if let Some(v) = x {
    say("got it");
  } else {
    say("nothing");
  }
}
`
    const w = warnings(src, 'no-empty-catch')
    expect(w).toHaveLength(0)
  })

  it('warns when a match arm body is empty', () => {
    const src = `
fn foo(x: Option<int>): void {
  match x {
    Some(v) => { say("ok"); }
    None => {}
  }
}
`
    const w = warnings(src, 'no-empty-catch')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('Empty match arm')
  })

  it('does NOT warn when all match arm bodies have statements', () => {
    const src = `
fn foo(x: Option<int>): void {
  match x {
    Some(v) => { say("ok"); }
    None => { say("none"); }
  }
}
`
    const w = warnings(src, 'no-empty-catch')
    expect(w).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule: naming-convention
// ---------------------------------------------------------------------------

describe('naming-convention', () => {
  it('warns for snake_case variable names', () => {
    const src = `
fn foo(): void {
  let my_var: int = 5;
  say("ok");
}
`
    const w = warnings(src, 'naming-convention')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('"my_var"')
    expect(w[0].message).toContain('camelCase')
  })

  it('warns for UPPER_CASE variable names', () => {
    const src = `
fn foo(): void {
  let MAX_VAL: int = 5;
  say("ok");
}
`
    const w = warnings(src, 'naming-convention')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('"MAX_VAL"')
  })

  it('does NOT warn for camelCase variable names', () => {
    const src = `
fn foo(): void {
  let myVar: int = 5;
  let anotherOne: int = 10;
  say("ok");
}
`
    const w = warnings(src, 'naming-convention')
    expect(w).toHaveLength(0)
  })

  it('does NOT warn for single-letter variable names', () => {
    const src = `
fn foo(): int {
  let x: int = 5;
  return x;
}
`
    const w = warnings(src, 'naming-convention')
    expect(w).toHaveLength(0)
  })

  it('warns for snake_case loop bindings in foreach', () => {
    const src = `
fn foo(): void {
  foreach (my_item in @a) {
    say("x");
  }
}
`
    const w = warnings(src, 'naming-convention')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('"my_item"')
  })

  it('does NOT warn for camelCase loop bindings', () => {
    const src = `
fn foo(): void {
  foreach (myItem in @a) {
    say("x");
  }
}
`
    const w = warnings(src, 'naming-convention')
    expect(w).toHaveLength(0)
  })

  it('warns for struct with lowercase start name', () => {
    const src = `
struct myStruct { x: int }

fn foo(): void {
  say("ok");
}
`
    const w = warnings(src, 'naming-convention')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('"myStruct"')
    expect(w[0].message).toContain('PascalCase')
  })

  it('does NOT warn for correctly named PascalCase struct', () => {
    const src = `
struct MyStruct { x: int }

fn foo(): void {
  say("ok");
}
`
    const w = warnings(src, 'naming-convention')
    expect(w).toHaveLength(0)
  })

  it('allows leading underscore in variable names', () => {
    const src = `
fn foo(): void {
  let _unused: int = 5;
  say("ok");
}
`
    const w = warnings(src, 'naming-convention')
    expect(w).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule: no-magic-numbers
// ---------------------------------------------------------------------------

describe('no-magic-numbers', () => {
  it('warns for literal numbers other than 0 and 1', () => {
    const src = `
fn foo(): void {
  let x: int = 42;
  say("ok");
}
`
    const w = warnings(src, 'no-magic-numbers')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('42')
    expect(w[0].message).toContain('Magic number')
  })

  it('does NOT warn for 0', () => {
    const src = `
fn foo(): int {
  let x: int = 0;
  return x;
}
`
    const w = warnings(src, 'no-magic-numbers')
    expect(w).toHaveLength(0)
  })

  it('does NOT warn for 1', () => {
    const src = `
fn foo(): int {
  let x: int = 1;
  return x;
}
`
    const w = warnings(src, 'no-magic-numbers')
    expect(w).toHaveLength(0)
  })

  it('does NOT warn for numbers in const declarations', () => {
    const src = `
const MAX_SIZE: int = 100;

fn foo(): void {
  say("ok");
}
`
    const w = warnings(src, 'no-magic-numbers')
    expect(w).toHaveLength(0)
  })

  it('respects custom allowedNumbers list', () => {
    const src = `
fn foo(): void {
  let x: int = 42;
  let y: int = 100;
  say("ok");
}
`
    // With 42 allowed, only 100 should warn
    const w = warnings(src, 'no-magic-numbers', { allowedNumbers: [0, 1, 42] })
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('100')
  })

  it('warns for magic numbers used in expressions', () => {
    const src = `
fn foo(x: int): bool {
  return x > 255;
}
`
    const w = warnings(src, 'no-magic-numbers')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].message).toContain('255')
  })

  it('does NOT warn for 0 and 1 even without explicit allowedNumbers', () => {
    const src = `
fn foo(x: int): bool {
  return x > 0 && x < 1;
}
`
    const w = warnings(src, 'no-magic-numbers')
    expect(w).toHaveLength(0)
  })
})
