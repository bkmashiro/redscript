/**
 * End-to-end tests for MC 1.20.2+ macro function support in the v2 pipeline.
 *
 * When a function uses runtime parameters in positions that require literal
 * values in MC commands (coordinates, entity types, etc.), the compiler should
 * automatically compile it as a macro function using $-prefixed syntax and
 * call it via `function ns:fn with storage rs:macro_args`.
 */

import { compile } from '../../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// ---------------------------------------------------------------------------
// Macro function detection
// ---------------------------------------------------------------------------

describe('e2e: macro function detection', () => {
  test('function with int params in summon coords emits $-prefixed command', () => {
    const source = `
      fn spawn_zombie(x: int, y: int, z: int) {
        summon("minecraft:zombie", x, y, z);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'spawn_zombie.mcfunction')
    expect(fn).toBeDefined()
    // The function body should have a $summon macro line
    expect(fn).toContain('$summon minecraft:zombie $(x) $(y) $(z)')
  })

  test('function with all constant args does NOT produce macro line', () => {
    const source = `
      fn spawn_fixed() {
        summon("minecraft:zombie", 100, 64, 200);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'spawn_fixed.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('summon minecraft:zombie 100 64 200')
    // No $ prefix
    expect(fn).not.toMatch(/^\$summon/m)
  })

  test('function with int params in particle coords emits $-prefixed command', () => {
    const source = `
      fn show_particle(x: int, y: int, z: int) {
        particle("minecraft:flame", x, y, z);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'show_particle.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('$particle minecraft:flame $(x) $(y) $(z)')
  })

  test('function with int params in setblock coords emits $-prefixed command', () => {
    const source = `
      fn place_block(x: int, y: int, z: int) {
        setblock(x, y, z, "minecraft:stone");
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'place_block.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('$setblock $(x) $(y) $(z) minecraft:stone')
  })

  test('mixed literal and variable args: only variable args get $()', () => {
    const source = `
      fn teleport_y(y: int) {
        summon("minecraft:zombie", 100, y, 200);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'teleport_y.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('$summon minecraft:zombie 100 $(y) 200')
  })
})

// ---------------------------------------------------------------------------
// Macro call site generation
// ---------------------------------------------------------------------------

describe('e2e: macro call site generation', () => {
  test('call site emits store_score_to_nbt + function with storage', () => {
    const source = `
      fn spawn_zombie(x: int, y: int, z: int) {
        summon("minecraft:zombie", x, y, z);
      }

      fn caller(px: int, pz: int) {
        spawn_zombie(px, 64, pz);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const callerFn = getFile(result.files, 'caller.mcfunction')
    expect(callerFn).toBeDefined()

    // Should have 'function test:spawn_zombie with storage rs:macro_args'
    expect(callerFn).toContain('with storage rs:macro_args')
    expect(callerFn).toContain('spawn_zombie')
  })

  test('call site stores args to rs:macro_args NBT', () => {
    const source = `
      fn spawn_zombie(x: int, y: int, z: int) {
        summon("minecraft:zombie", x, y, z);
      }

      fn caller(my_x: int) {
        spawn_zombie(my_x, 64, 0);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const callerFn = getFile(result.files, 'caller.mcfunction')
    expect(callerFn).toBeDefined()

    // Should have NBT storage setup for macro args
    expect(callerFn).toContain('rs:macro_args')
    expect(callerFn).toContain('with storage')
  })
})

// ---------------------------------------------------------------------------
// Float macro params (local coords)
// ---------------------------------------------------------------------------

describe('e2e: float macro params with local coords', () => {
  test('float params in ^coord positions produce macro function', () => {
    const source = `
      fn draw_pt(px: float, py: float) {
        particle("minecraft:end_rod", ^px, ^py, ^5, 0.02, 0.02, 0.02, 0.0, 10);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'draw_pt.mcfunction')
    expect(fn).toBeDefined()
    // Should have $particle with ^$(px) and ^$(py)
    expect(fn).toContain('$particle minecraft:end_rod ^$(px) ^$(py) ^5')
  })

  test('float macro call site uses double 0.01 scale for NBT storage', () => {
    const source = `
      fn draw_pt(px: float, py: float) {
        particle("minecraft:end_rod", ^px, ^py, ^5, 0.02, 0.02, 0.02, 0.0, 10);
      }

      fn caller() {
        draw_pt(100, 200);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const callerFn = getFile(result.files, 'caller.mcfunction')
    expect(callerFn).toBeDefined()

    // Should store to NBT with double type and 0.01 scale
    expect(callerFn).toContain('rs:macro_args')
    expect(callerFn).toContain('double 0.01')
    expect(callerFn).toContain('with storage rs:macro_args')
  })
})

// ---------------------------------------------------------------------------
// Non-macro functions still work
// ---------------------------------------------------------------------------

describe('e2e: non-macro functions', () => {
  test('say builtin emits normal (non-macro) command', () => {
    const source = `
      fn greet() {
        say("hello world");
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'greet.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('say hello world')
    // No $ prefix
    expect(fn).not.toMatch(/^\$/m)
  })

  test('kill builtin emits normal command', () => {
    const source = `
      fn cleanup() {
        kill(@e[tag=temp]);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'cleanup.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('kill @e[tag=temp]')
  })
})
