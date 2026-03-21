/**
 * Enum + pattern matching tests for Phase 2a.
 *
 * Tests cover:
 * - Lexer/Parser: enum declarations, :: path operator
 * - TypeChecker: enum type checking, variant resolution
 * - HIR/MIR/LIR: enum compilation to integer scoreboard slots
 * - E2E: match on enum variants → execute if score ... matches N
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { compile } from '../emit/compile'
import { TypeChecker } from '../typechecker'

// Helper: parse source → AST
function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse()
}

// Helper: type check source → errors
function typeCheck(source: string) {
  const program = parse(source)
  const checker = new TypeChecker(source)
  return checker.check(program)
}

// Helper: compile and get all mcfunction content
function getCommands(source: string, namespace = 'test'): string[] {
  const result = compile(source, { namespace })
  expect(result.success).toBe(true)
  return (result.files ?? [])
    .filter(f => f.path.endsWith('.mcfunction'))
    .flatMap(f => f.content.split('\n'))
    .filter(line => line.trim().length > 0)
}

// Helper: get specific mcfunction file content
function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

// =========================================================================
// Lexer tests
// =========================================================================

describe('enum: lexer', () => {
  test('tokenizes enum keyword', () => {
    const tokens = new Lexer('enum Phase').tokenize()
    expect(tokens[0].kind).toBe('enum')
    expect(tokens[1].kind).toBe('ident')
    expect(tokens[1].value).toBe('Phase')
  })

  test('tokenizes :: operator', () => {
    const tokens = new Lexer('Phase::Idle').tokenize()
    expect(tokens.map(t => t.kind)).toEqual(['ident', '::', 'ident', 'eof'])
  })

  test(':: does not conflict with single :', () => {
    const tokens = new Lexer('a: int :: b').tokenize()
    expect(tokens.map(t => t.kind)).toEqual(['ident', ':', 'int', '::', 'ident', 'eof'])
  })
})

// =========================================================================
// Parser tests
// =========================================================================

describe('enum: parser', () => {
  test('parses basic enum declaration', () => {
    const program = parse('enum Phase { Idle, Moving, Attacking }')
    expect(program.enums).toEqual([
      {
        name: 'Phase',
        variants: [
          { name: 'Idle', value: 0 },
          { name: 'Moving', value: 1 },
          { name: 'Attacking', value: 2 },
        ],
      },
    ])
  })

  test('parses enum with explicit values', () => {
    const program = parse('enum Color { Red = 10, Green, Blue = 20 }')
    expect(program.enums[0].variants).toEqual([
      { name: 'Red', value: 10 },
      { name: 'Green', value: 11 },
      { name: 'Blue', value: 20 },
    ])
  })

  test('parses enum variant access with :: operator', () => {
    const program = parse(`
      enum Phase { Idle, Moving }
      fn test() {
        let p: Phase = Phase::Idle;
      }
    `)
    const letStmt = program.declarations[0].body[0]
    expect(letStmt.kind).toBe('let')
    if (letStmt.kind === 'let') {
      expect(letStmt.init).toMatchObject({
        kind: 'path_expr',
        enumName: 'Phase',
        variant: 'Idle',
      })
    }
  })

  test('parses match with enum variant patterns', () => {
    const program = parse(`
      enum Phase { Idle, Moving }
      fn test() {
        let p: Phase = Phase::Idle;
        match (p) {
          Phase::Idle => { }
          Phase::Moving => { }
        }
      }
    `)
    const matchStmt = program.declarations[0].body[1]
    expect(matchStmt.kind).toBe('match')
    if (matchStmt.kind === 'match') {
      expect(matchStmt.arms).toHaveLength(2)
      // Enum variant patterns now parse as PatEnum (previously PatExpr wrapping path_expr)
      expect(matchStmt.arms[0].pattern).toMatchObject({
        kind: 'PatEnum',
        enumName: 'Phase',
        variant: 'Idle',
        bindings: [],
      })
      expect(matchStmt.arms[1].pattern).toMatchObject({
        kind: 'PatEnum',
        enumName: 'Phase',
        variant: 'Moving',
        bindings: [],
      })
    }
  })

  test(':: with () is still static_call', () => {
    const program = parse(`
      struct Timer { x: int }
      impl Timer {
        fn new(): void { }
      }
      fn test() { Timer::new(); }
    `)
    const exprStmt = program.declarations[0].body[0]
    expect(exprStmt.kind).toBe('expr')
    if (exprStmt.kind === 'expr') {
      expect(exprStmt.expr.kind).toBe('static_call')
    }
  })

  test('enum type annotation in function params', () => {
    const program = parse(`
      enum Direction { North, South }
      fn move(dir: Direction) { }
    `)
    expect(program.declarations[0].params[0].type).toEqual({
      kind: 'struct',
      name: 'Direction',
    })
  })
})

// =========================================================================
// Type checker tests
// =========================================================================

describe('enum: type checker', () => {
  test('no errors for valid enum usage', () => {
    const errors = typeCheck(`
      enum Phase { Idle, Moving, Attacking }
      fn test() {
        let p: Phase = Phase::Idle;
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('error for unknown enum in path_expr', () => {
    const errors = typeCheck(`
      fn test() {
        let x: int = NoSuchEnum::Variant;
      }
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('NoSuchEnum')
  })

  test('error for unknown variant', () => {
    const errors = typeCheck(`
      enum Phase { Idle, Moving }
      fn test() {
        let p: Phase = Phase::Flying;
      }
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('Flying')
  })

  test('no errors for match on enum', () => {
    const errors = typeCheck(`
      enum Phase { Idle, Moving }
      fn test() {
        let p: Phase = Phase::Idle;
        match (p) {
          Phase::Idle => { }
          Phase::Moving => { }
        }
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('enum as function parameter and return value', () => {
    const errors = typeCheck(`
      enum State { On, Off }
      fn toggle(s: State): State {
        return State::Off;
      }
      fn test() {
        let s: State = State::On;
        let result: State = toggle(s);
      }
    `)
    expect(errors).toHaveLength(0)
  })
})

// =========================================================================
// E2E compilation tests
// =========================================================================

describe('enum: e2e compilation', () => {
  test('enum variable compiles to scoreboard set', () => {
    const source = `
      enum Phase { Idle, Moving, Attacking }
      fn test(): int {
        let phase: Phase = Phase::Attacking;
        return phase;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    // Phase::Attacking = 2, should see a set with value 2
    const setCmds = cmds.filter(c => c.includes('scoreboard players set') && c.includes(' 2'))
    expect(setCmds.length).toBeGreaterThan(0)
  })

  test('enum variant values map to correct integers', () => {
    const source = `
      enum Phase { Idle, Moving, Attacking }
      fn test_idle(): int {
        return Phase::Idle;
      }
      fn test_moving(): int {
        return Phase::Moving;
      }
      fn test_attacking(): int {
        return Phase::Attacking;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    // Should contain set commands for 0, 1, 2
    const hasCmdWith = (val: string) => cmds.some(c => c.includes('scoreboard players set') && c.includes(` ${val}`))
    expect(hasCmdWith('0')).toBe(true)
    expect(hasCmdWith('1')).toBe(true)
    expect(hasCmdWith('2')).toBe(true)
  })

  test('match on enum compiles to score comparison chain', () => {
    // Use function parameter to prevent constant folding
    const source = `
      enum Phase { Idle, Moving, Attacking }
      fn game(phase: Phase): int {
        match (phase) {
          Phase::Idle => {
            return 1;
          }
          Phase::Moving => {
            return 2;
          }
          Phase::Attacking => {
            return 3;
          }
        }
        return 0;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    // Match compiles to 'execute if score ... matches' or comparison chain
    const matchCmds = cmds.filter(c => c.includes('execute if score') || c.includes('execute unless score'))
    expect(matchCmds.length).toBeGreaterThan(0)
  })

  test('match with default arm compiles', () => {
    const source = `
      enum Phase { Idle, Moving, Attacking }
      fn game() {
        let phase: Phase = Phase::Idle;
        match (phase) {
          Phase::Idle => {
            let x: int = 0;
          }
          _ => {
            let x: int = 99;
          }
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })

  test('enum as function parameter', () => {
    const source = `
      enum Direction { North, South, East, West }
      fn handle_dir(dir: Direction) {
        match (dir) {
          Direction::North => { let x: int = 0; }
          Direction::South => { let x: int = 1; }
          Direction::East => { let x: int = 2; }
          Direction::West => { let x: int = 3; }
        }
      }
      fn main() {
        handle_dir(Direction::East);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    // Direction::East = 2, should see score set with value 2
    const cmds = getCommands(source)
    const setCmds = cmds.filter(c => c.includes('scoreboard players set') && c.includes(' 2'))
    expect(setCmds.length).toBeGreaterThan(0)
  })

  test('enum assignment and reassignment', () => {
    const source = `
      enum State { Off, On }
      fn toggle(): int {
        let s: State = State::Off;
        s = State::On;
        return s;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    // Optimizer may constant-fold: Off=0 → On=1 → return 1
    // Just verify it compiles and has a set command
    const setCmds = cmds.filter(c => c.includes('scoreboard players set'))
    expect(setCmds.length).toBeGreaterThanOrEqual(1)
  })

  test('enum comparison in if statement', () => {
    const source = `
      enum Phase { Idle, Active }
      fn check() {
        let p: Phase = Phase::Active;
        if (p == Phase::Active) {
          let x: int = 1;
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })

  test('enum with explicit values compiles correctly', () => {
    const source = `
      enum Priority { Low = 10, Medium = 20, High = 30 }
      fn test(): int {
        return Priority::High;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    // High = 30
    const setCmds = cmds.filter(c => c.includes('scoreboard players set') && c.includes(' 30'))
    expect(setCmds.length).toBeGreaterThan(0)
  })

  test('multiple enums in same program', () => {
    const source = `
      enum Phase { Idle, Active }
      enum Color { Red, Green, Blue }
      fn test() {
        let p: Phase = Phase::Active;
        let c: Color = Color::Blue;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })

  test('enum return value from function', () => {
    const source = `
      enum Direction { North, South }
      fn get_dir(): Direction {
        return Direction::North;
      }
      fn test() {
        let d: Direction = get_dir();
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })
})
