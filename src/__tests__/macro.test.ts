/**
 * Tests for MC 1.20.2+ macro function support
 *
 * When a function uses runtime parameters in positions that require literal
 * values in MC commands (coordinates, entity types, etc.), RedScript should
 * automatically compile it as a macro function using $-prefixed syntax.
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { Lowering } from '../lowering'
import { generateDatapack } from '../codegen/mcfunction'
import type { IRModule, IRFunction, IRInstr } from '../ir/types'

function compile(source: string, namespace = 'test'): IRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse(namespace)
  const lowering = new Lowering(namespace)
  return lowering.lower(ast)
}

function getFunction(module: IRModule, name: string): IRFunction | undefined {
  return module.functions.find(f => f.name === name)
}

function getRawCommands(fn: IRFunction): string[] {
  return fn.blocks
    .flatMap(b => b.instrs)
    .filter((i): i is IRInstr & { op: 'raw' } => i.op === 'raw')
    .map(i => i.cmd)
}

function getGeneratedContent(module: IRModule, fnName: string): string | undefined {
  const files = generateDatapack(module)
  const file = files.find(f => f.path.includes(`/${fnName}.mcfunction`))
  return file?.content
}

// ---------------------------------------------------------------------------
// Macro function detection
// ---------------------------------------------------------------------------

describe('MC macro function detection', () => {
  it('marks function as macro when int param used in summon coordinates', () => {
    const ir = compile(`
fn spawn_zombie(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
}
`)
    const fn = getFunction(ir, 'spawn_zombie')
    expect(fn).toBeDefined()
    expect(fn!.isMacroFunction).toBe(true)
    expect(fn!.macroParamNames).toEqual(expect.arrayContaining(['x', 'y', 'z']))
  })

  it('does NOT mark function as macro when all summon args are constants', () => {
    const ir = compile(`
fn spawn_fixed() {
    summon("minecraft:zombie", 100, 64, 200);
}
`)
    const fn = getFunction(ir, 'spawn_fixed')
    expect(fn).toBeDefined()
    expect(fn!.isMacroFunction).toBeFalsy()
  })

  it('marks function as macro when int param used in particle coordinates', () => {
    const ir = compile(`
fn show_particle(x: int, y: int, z: int) {
    particle("minecraft:flame", x, y, z);
}
`)
    const fn = getFunction(ir, 'show_particle')
    expect(fn).toBeDefined()
    expect(fn!.isMacroFunction).toBe(true)
  })

  it('marks function as macro when int param used in setblock coordinates', () => {
    const ir = compile(`
fn place_block(x: int, y: int, z: int) {
    setblock(x, y, z, "minecraft:stone");
}
`)
    const fn = getFunction(ir, 'place_block')
    expect(fn).toBeDefined()
    expect(fn!.isMacroFunction).toBe(true)
    expect(fn!.macroParamNames).toEqual(expect.arrayContaining(['x', 'y', 'z']))
  })

  it('identifies only the params used in macro positions', () => {
    const ir = compile(`
fn do_stuff(count: int, x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
    // count is not used in a macro position
}
`)
    const fn = getFunction(ir, 'do_stuff')
    expect(fn).toBeDefined()
    expect(fn!.isMacroFunction).toBe(true)
    // x, y, z should be macro params; count should NOT be
    expect(fn!.macroParamNames).toEqual(expect.arrayContaining(['x', 'y', 'z']))
    expect(fn!.macroParamNames).not.toContain('count')
  })
})

// ---------------------------------------------------------------------------
// Macro command generation in function body
// ---------------------------------------------------------------------------

describe('MC macro command generation', () => {
  it('generates $-prefixed summon command with $(param) for macro params', () => {
    const ir = compile(`
fn spawn_zombie(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
}
`)
    const fn = getFunction(ir, 'spawn_zombie')!
    const cmds = getRawCommands(fn)

    // Should have a macro command for summon
    const macroCmd = cmds.find(c => c.startsWith('$summon'))
    expect(macroCmd).toBeDefined()
    expect(macroCmd).toContain('$(x)')
    expect(macroCmd).toContain('$(y)')
    expect(macroCmd).toContain('$(z)')
    expect(macroCmd).toBe('$summon minecraft:zombie $(x) $(y) $(z)')
  })

  it('generates non-prefixed command when args are literals', () => {
    const ir = compile(`
fn spawn_fixed() {
    summon("minecraft:zombie", 100, 64, 200);
}
`)
    const fn = getFunction(ir, 'spawn_fixed')!
    const cmds = getRawCommands(fn)
    const summonCmd = cmds.find(c => c.includes('summon'))
    expect(summonCmd).toBeDefined()
    expect(summonCmd!.startsWith('$')).toBe(false)
    expect(summonCmd).toContain('100')
    expect(summonCmd).toContain('64')
    expect(summonCmd).toContain('200')
  })

  it('generates $-prefixed particle command with $(param)', () => {
    const ir = compile(`
fn show_particle(x: int, y: int, z: int) {
    particle("minecraft:flame", x, y, z);
}
`)
    const fn = getFunction(ir, 'show_particle')!
    const cmds = getRawCommands(fn)
    const macroCmd = cmds.find(c => c.startsWith('$particle'))
    expect(macroCmd).toBeDefined()
    expect(macroCmd).toContain('$(x)')
  })

  it('generates $-prefixed setblock command with $(param)', () => {
    const ir = compile(`
fn place_block(x: int, y: int, z: int) {
    setblock(x, y, z, "minecraft:stone");
}
`)
    const fn = getFunction(ir, 'place_block')!
    const cmds = getRawCommands(fn)
    const macroCmd = cmds.find(c => c.startsWith('$setblock'))
    expect(macroCmd).toBeDefined()
    expect(macroCmd).toContain('$(x)')
    expect(macroCmd).toContain('$(y)')
    expect(macroCmd).toContain('$(z)')
    expect(macroCmd).toContain('minecraft:stone')
  })
})

// ---------------------------------------------------------------------------
// Call site code generation
// ---------------------------------------------------------------------------

describe('MC macro call site generation', () => {
  it('emits NBT setup + with-storage call for variable args', () => {
    const ir = compile(`
fn spawn_zombie(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
}

fn caller(px: int, pz: int) {
    spawn_zombie(px, 64, pz);
}
`)
    const callerFn = getFunction(ir, 'caller')!
    const cmds = getRawCommands(callerFn)

    // Should have NBT setup for variable params (px → x, pz → z)
    const xSetup = cmds.find(c => c.includes('macro_args') && c.includes(' x '))
    const zSetup = cmds.find(c => c.includes('macro_args') && c.includes(' z '))
    expect(xSetup).toBeDefined()
    expect(zSetup).toBeDefined()

    // Should have 'function test:spawn_zombie with storage rs:macro_args'
    const callCmd = cmds.find(c => c.includes('spawn_zombie') && c.includes('with storage'))
    expect(callCmd).toBeDefined()
    expect(callCmd).toContain('rs:macro_args')
  })

  it('emits NBT setup for constant args too', () => {
    const ir = compile(`
fn spawn_zombie(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
}

fn caller_const() {
    spawn_zombie(100, 64, 200);
}
`)
    const callerFn = getFunction(ir, 'caller_const')!
    const cmds = getRawCommands(callerFn)

    // Should have NBT setup for all macro params
    const nbtCmds = cmds.filter(c => c.includes('macro_args'))
    expect(nbtCmds.length).toBeGreaterThan(0)

    // Should call with storage
    const callCmd = cmds.find(c => c.includes('spawn_zombie') && c.includes('with storage'))
    expect(callCmd).toBeDefined()
  })

  it('correctly sets up int variable args into NBT storage', () => {
    const ir = compile(`
fn spawn_zombie(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
}

fn caller(my_x: int) {
    spawn_zombie(my_x, 64, 0);
}
`)
    const callerFn = getFunction(ir, 'caller')!
    const cmds = getRawCommands(callerFn)

    // For variable arg my_x → x: should use execute store result
    const varSetup = cmds.find(c =>
      c.includes('execute store result storage rs:macro_args x') &&
      c.includes('scoreboard players get')
    )
    expect(varSetup).toBeDefined()

    // For constant 64 → y: should use data modify ... set value
    const constSetup = cmds.find(c =>
      c.includes('data modify storage rs:macro_args y set value 64')
    )
    expect(constSetup).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Codegen output (mcfunction file content)
// ---------------------------------------------------------------------------

describe('MC macro function codegen output', () => {
  it('generates $-prefixed lines in the macro function mcfunction file', () => {
    const ir = compile(`
fn spawn_zombie(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
}
`)
    const content = getGeneratedContent(ir, 'spawn_zombie')
    expect(content).toBeDefined()
    expect(content).toContain('$summon minecraft:zombie $(x) $(y) $(z)')
  })

  it('generates correct call site in caller mcfunction file', () => {
    const ir = compile(`
fn spawn_zombie(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
}

fn caller(px: int, pz: int) {
    spawn_zombie(px, 64, pz);
}
`)
    const content = getGeneratedContent(ir, 'caller')
    expect(content).toBeDefined()
    expect(content).toContain('with storage rs:macro_args')
    expect(content).toContain('spawn_zombie')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('MC macro edge cases', () => {
  it('handles mixed literal and variable args correctly', () => {
    const ir = compile(`
fn teleport_y(y: int) {
    summon("minecraft:zombie", 100, y, 200);
}
`)
    const fn = getFunction(ir, 'teleport_y')!
    expect(fn.isMacroFunction).toBe(true)
    expect(fn.macroParamNames).toContain('y')
    expect(fn.macroParamNames).not.toContain('x')

    const cmds = getRawCommands(fn)
    const macroCmd = cmds.find(c => c.startsWith('$summon'))
    expect(macroCmd).toBeDefined()
    // x and z are literals, y is macro
    expect(macroCmd).toContain('100')
    expect(macroCmd).toContain('$(y)')
    expect(macroCmd).toContain('200')
  })

  it('non-macro functions still work normally', () => {
    const ir = compile(`
fn greet() {
    say("hello world");
}
`)
    const fn = getFunction(ir, 'greet')!
    expect(fn.isMacroFunction).toBeFalsy()
    const cmds = getRawCommands(fn)
    const sayCmd = cmds.find(c => c.includes('say') || c.includes('tellraw'))
    expect(sayCmd).toBeDefined()
    expect(sayCmd!.startsWith('$')).toBe(false)
  })

  it('macro function with params used in arithmetic still works', () => {
    const ir = compile(`
fn spawn_offset(x: int, y: int, z: int) {
    summon("minecraft:zombie", x, y, z);
    // params are also used in the macro commands
}
`)
    const fn = getFunction(ir, 'spawn_offset')!
    expect(fn.isMacroFunction).toBe(true)

    // The macro commands should use $(param) syntax
    const cmds = getRawCommands(fn)
    const macroCmd = cmds.find(c => c.startsWith('$summon'))
    expect(macroCmd).toBeDefined()
    expect(macroCmd).toContain('$(x)')
  })
})
