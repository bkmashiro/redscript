/**
 * Enum with payload tests.
 *
 * Tests cover:
 * - Parser: enum variants with payload fields, enum_construct expr, PatEnum
 * - Type checker: payload field validation, binding type inference
 * - MIR/E2E: construction emits NBT writes; match emits tag check + NBT reads
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { compile } from '../../emit/compile'
import { TypeChecker } from '../../typechecker'

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse()
}

function typeCheck(source: string) {
  const program = parse(source)
  const checker = new TypeChecker(source)
  return checker.check(program)
}

function getCommands(source: string, namespace = 'test'): string[] {
  const result = compile(source, { namespace })
  expect(result.success).toBe(true)
  return (result.files ?? [])
    .filter(f => f.path.endsWith('.mcfunction'))
    .flatMap(f => f.content.split('\n'))
    .filter(line => line.trim().length > 0)
}

// ===========================================================================
// Parser tests
// ===========================================================================

describe('enum-payload: parser', () => {
  test('parses enum variant with payload fields', () => {
    const source = `
      enum Color {
        Red,
        RGB(r: int, g: int, b: int),
      }
    `
    const ast = parse(source)
    expect(ast.enums).toHaveLength(1)
    const e = ast.enums[0]
    expect(e.name).toBe('Color')
    expect(e.variants).toHaveLength(2)

    const red = e.variants[0]
    expect(red.name).toBe('Red')
    expect(red.fields).toBeUndefined()

    const rgb = e.variants[1]
    expect(rgb.name).toBe('RGB')
    expect(rgb.fields).toHaveLength(3)
    expect(rgb.fields![0]).toMatchObject({ name: 'r', type: { kind: 'named', name: 'int' } })
    expect(rgb.fields![1]).toMatchObject({ name: 'g', type: { kind: 'named', name: 'int' } })
    expect(rgb.fields![2]).toMatchObject({ name: 'b', type: { kind: 'named', name: 'int' } })
  })

  test('parses enum_construct expression', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn test(): Color {
        return Color::RGB(r: 10, g: 20, b: 30);
      }
    `
    const ast = parse(source)
    const fn = ast.declarations[0]
    const retStmt = fn.body[0]
    expect(retStmt.kind).toBe('return')
    if (retStmt.kind === 'return' && retStmt.value) {
      expect(retStmt.value.kind).toBe('enum_construct')
      if (retStmt.value.kind === 'enum_construct') {
        expect(retStmt.value.enumName).toBe('Color')
        expect(retStmt.value.variant).toBe('RGB')
        expect(retStmt.value.args).toHaveLength(3)
        expect(retStmt.value.args[0]).toMatchObject({ name: 'r' })
        expect(retStmt.value.args[1]).toMatchObject({ name: 'g' })
        expect(retStmt.value.args[2]).toMatchObject({ name: 'b' })
      }
    }
  })

  test('parses PatEnum in match (with bindings)', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn test(c: Color): int {
        match c {
          Color::RGB(r, g, b) => { return r; }
          Color::Red => { return 0; }
        }
        return -1;
      }
    `
    const ast = parse(source)
    const fn = ast.declarations[0]
    const matchStmt = fn.body[0]
    expect(matchStmt.kind).toBe('match')
    if (matchStmt.kind === 'match') {
      const firstArm = matchStmt.arms[0]
      expect(firstArm.pattern.kind).toBe('PatEnum')
      if (firstArm.pattern.kind === 'PatEnum') {
        expect(firstArm.pattern.enumName).toBe('Color')
        expect(firstArm.pattern.variant).toBe('RGB')
        expect(firstArm.pattern.bindings).toEqual(['r', 'g', 'b'])
      }
      const secondArm = matchStmt.arms[1]
      expect(secondArm.pattern.kind).toBe('PatEnum')
      if (secondArm.pattern.kind === 'PatEnum') {
        expect(secondArm.pattern.bindings).toEqual([])
      }
    }
  })

  test('parses simple no-binding PatEnum', () => {
    const source = `
      enum Dir { North, South(x: int) }
      fn test(d: Dir): void {
        match d {
          Dir::North => { }
          Dir::South(x) => { }
        }
      }
    `
    const ast = parse(source)
    const fn = ast.declarations[0]
    const matchStmt = fn.body[0]
    expect(matchStmt.kind).toBe('match')
  })
})

// ===========================================================================
// Type checker tests
// ===========================================================================

describe('enum-payload: typechecker', () => {
  test('accepts valid enum_construct with correct fields', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn test(): Color {
        return Color::RGB(r: 10, g: 20, b: 30);
      }
    `
    const errors = typeCheck(source)
    expect(errors).toHaveLength(0)
  })

  test('reports error for unknown field in enum_construct', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn test(): Color {
        return Color::RGB(x: 10, g: 20, b: 30);
      }
    `
    const errors = typeCheck(source)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.message.includes('x'))).toBe(true)
  })

  test('accepts match with PatEnum bindings in scope', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn test(c: Color): int {
        match c {
          Color::RGB(r, g, b) => { return r; }
          Color::Red => { return 0; }
        }
        return -1;
      }
    `
    const errors = typeCheck(source)
    expect(errors).toHaveLength(0)
  })

  test('enum_construct infers enum type', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn test(): Color {
        let c: Color = Color::RGB(r: 1, g: 2, b: 3);
        return c;
      }
    `
    const errors = typeCheck(source)
    expect(errors).toHaveLength(0)
  })
})

// ===========================================================================
// E2E compilation tests
// ===========================================================================

describe('enum-payload: e2e compilation', () => {
  test('enum_construct emits tag scoreboard set and NBT writes', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn make_color(): Color {
        return Color::RGB(r: 10, g: 20, b: 30);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')

    // Should set the tag to 1 (RGB = variant 1)
    const tagSets = cmds.filter(c => c.includes('scoreboard players set') && c.includes(' 1'))
    expect(tagSets.length).toBeGreaterThan(0)

    // Should write payload fields to NBT storage rs:enums
    expect(allCmds).toContain('storage rs:enums')
    // Should store the r, g, b values (10, 20, 30)
    expect(allCmds).toContain('Color_r')
    expect(allCmds).toContain('Color_g')
    expect(allCmds).toContain('Color_b')
  })

  test('match on PatEnum emits tag comparison and NBT reads', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn use_color(c: Color): int {
        match c {
          Color::RGB(r, g, b) => { return r; }
          Color::Red => { return 0; }
        }
        return -1;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')

    // Tag comparison: execute if score ... matches 1 (RGB variant)
    expect(allCmds).toContain('execute if score')

    // NBT read for payload: data get storage rs:enums Color_r
    expect(allCmds).toContain('storage rs:enums')
    expect(allCmds).toContain('Color_r')
  })

  test('no-payload PatEnum (bare variant) compiles like existing enum match', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn use_color(c: Color): int {
        match c {
          Color::Red => { return 0; }
          Color::RGB(r, g, b) => { return 1; }
        }
        return -1;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })

  test('mixed enum: payload and no-payload variants in same enum', () => {
    const source = `
      enum Shape {
        Circle,
        Rect(w: int, h: int),
      }
      fn area(s: Shape): int {
        match s {
          Shape::Circle => { return 0; }
          Shape::Rect(w, h) => { return w; }
        }
        return -1;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('Shape_w')
  })

  test('enum_construct for no-payload variant still compiles as integer constant', () => {
    const source = `
      enum Color { Red, RGB(r: int, g: int, b: int) }
      fn test(): Color {
        return Color::Red;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)

    const cmds = getCommands(source)
    const zeroSets = cmds.filter(c => c.includes('scoreboard players set') && c.includes(' 0'))
    expect(zeroSets.length).toBeGreaterThan(0)
  })
})
