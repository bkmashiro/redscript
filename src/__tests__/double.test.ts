/**
 * Tests for double type support in RedScript.
 *
 * double variables are NBT-backed IEEE 754 doubles stored in rs:d storage.
 * All arithmetic goes through fixed (×10000) as intermediate representation.
 */

import { compile } from '../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

function getAllMcContent(files: { path: string; content: string }[]): string {
  return files.filter(f => f.path.endsWith('.mcfunction')).map(f => f.content).join('\n')
}

describe('double literal storage', () => {
  test('double literal stores into rs:d NBT storage', () => {
    const source = `
      fn t() {
        let x: double = 3.14d;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('data modify storage rs:d')
    expect(all).toContain('3.14d')
  })

  test('double literal read back as ×10000 fixed (3.14d → ~31400)', () => {
    const source = `
      fn t(): fixed {
        let x: double = 3.14d;
        return x as fixed;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    // Reading back uses 10000.0 scale
    expect(all).toContain('10000.0')
    expect(all).toContain('rs:d')
  })

  test('double literal 1.5d stores 1.5d in NBT', () => {
    const source = `
      fn t() {
        let x: double = 1.5d;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('1.5d')
  })
})

describe('double to fixed cast', () => {
  test('x as fixed reads double as ×10000 score', () => {
    const source = `
      fn t(): fixed {
        let x: double = 2.5d;
        return x as fixed;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    // The cast emits a data get with scale 10000.0
    expect(all).toContain('data get storage rs:d')
    expect(all).toContain('10000.0')
  })
})

describe('fixed to double cast', () => {
  test('fixed as double stores in NBT with scale 0.0001', () => {
    const source = `
      fn t() {
        let x: fixed = 1.5;
        let y: double = x as double;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    // The cast emits execute store with scale 0.0001
    expect(all).toContain('0.0001')
    expect(all).toContain('rs:d')
  })

  test('round-trip: fixed → double → fixed preserves value', () => {
    const source = `
      fn t(): fixed {
        let x: fixed = 1.5;
        let y: double = x as double;
        return y as fixed;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    // Should see both directions of conversion
    expect(all).toContain('0.0001')
    expect(all).toContain('10000.0')
    expect(all).toContain('rs:d')
  })
})

describe('double arithmetic via fixed', () => {
  test('double + double compiles (both read as ×10000, added)', () => {
    const source = `
      fn t(): fixed {
        let a: double = 1.5d;
        let b: double = 2.5d;
        return (a + b) as fixed;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    // Both reads should use 10000.0
    expect(all).toContain('10000.0')
    expect(all).toContain('rs:d')
  })
})

describe('double literal type system', () => {
  test('double_lit expression emits NBT set and score read', () => {
    const source = `
      fn t(): fixed {
        return 3.0d as fixed;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('3d')
    expect(all).toContain('rs:d')
    expect(all).toContain('10000.0')
  })
})

describe('double parameter passing', () => {
  test('passing double var to fn uses data modify (no ×10000 conversion)', () => {
    const source = `
      fn take_double(d: double): fixed {
        return d as fixed;
      }
      fn t(): fixed {
        let x: double = 3.14d;
        return take_double(x);
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    // Caller must copy NBT path directly — no execute store with 10000 for the arg
    expect(all).toContain('data modify storage rs:d __dp0 set from storage rs:d')
    // Callee reads __dp0 as double
    expect(all).toContain('data get storage rs:d __dp0')
  })

  test('double param returning double uses NBT round-trip', () => {
    const source = `
      fn identity(d: double): double {
        return d;
      }
      fn t(): fixed {
        let x: double = 2.0d;
        let y: double = identity(x);
        return y as fixed;
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('__dp0')
    expect(all).toContain('data modify storage rs:d __dp0 set from storage rs:d')
  })

  test('mixed double and int params: double via NBT, int via scoreboard', () => {
    const source = `
      fn mixed(d: double, n: int): fixed {
        return (d as fixed) + n;
      }
      fn t(): fixed {
        let x: double = 1.5d;
        return mixed(x, 42);
      }
    `
    const result = compile(source, { namespace: 'doubletest' })
    const all = getAllMcContent(result.files)
    // Double arg passed via NBT
    expect(all).toContain('data modify storage rs:d __dp0 set from storage rs:d')
    // Int arg passed via scoreboard $p0 (first non-double param)
    expect(all).toContain('$p0')
  })
})

describe('double_add — entity position trick', () => {
  const mathHpSrc = fs.readFileSync(
    path.join(__dirname, '../stdlib/math_hp.mcrs'),
    'utf-8',
  )

  test('double_add compiles: emits tp macro helpers and Pos[0] read-back', () => {
    const source = mathHpSrc + `
      @keep fn test_dadd() {
        let a: double = 1.5d;
        let b: double = 2.5d;
        let result: double = double_add(a, b);
      }
    `
    const result = compile(source, { namespace: 'daddtest' })
    const all = getAllMcContent(result.files)
    // Macro helper for absolute TP must be used
    expect(all).toContain('with storage rs:d __dadd_args')
    // Pos[0] read-back into __dp0
    expect(all).toContain('Pos[0]')
    // Marker UUID used
    expect(all).toContain('b54f1a4f-d7ac-4002-915e-3c2a3bf6f8a4')
  })

  test('double_add emits __dadd_tp_to and __dadd_tp_rel helper functions', () => {
    const source = mathHpSrc + `
      @keep fn test_dadd() {
        let a: double = 1.5d;
        let b: double = 2.5d;
        let result: double = double_add(a, b);
      }
    `
    const result = compile(source, { namespace: 'daddtest' })
    const tp_to = result.files.find(f => f.path.includes('__dadd_tp_to'))
    const tp_rel = result.files.find(f => f.path.includes('__dadd_tp_rel'))
    expect(tp_to).toBeDefined()
    expect(tp_rel).toBeDefined()
    expect(tp_to!.content).toContain('$(x)')
    expect(tp_rel!.content).toContain('$(dx)')
  })

  test('double_add uses __NS__ correctly — helpers called in compilation namespace', () => {
    const source = mathHpSrc + `
      @keep fn test_dadd() {
        let a: double = 1.5d;
        let b: double = 2.5d;
        let result: double = double_add(a, b);
      }
    `
    const result = compile(source, { namespace: 'mynamespace' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('function mynamespace:__dadd_tp_to with storage')
    expect(all).toContain('function mynamespace:__dadd_tp_rel with storage')
  })

  test('init_double_add is called on load — summons AEC marker UUID', () => {
    const source = mathHpSrc + `
      @keep fn test_dadd() {
        let a: double = 1.5d;
        let b: double = 2.5d;
        let result: double = double_add(a, b);
      }
    `
    const result = compile(source, { namespace: 'daddtest' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('rs_math_hp_marker')
    expect(all).toContain('area_effect_cloud')
  })
})

describe('double_sub — negate-then-add', () => {
  const mathHpSrc = fs.readFileSync(
    path.join(__dirname, '../stdlib/math_hp.mcrs'),
    'utf-8',
  )

  test('double_sub emits negation step (double -0.0001 × 10000)', () => {
    const source = mathHpSrc + `
      @keep fn test_dsub() {
        let a: double = 5.0d;
        let b: double = 2.0d;
        let result: double = double_sub(a, b);
      }
    `
    const result = compile(source, { namespace: 'dsubtest' })
    const all = getAllMcContent(result.files)
    // Negation: store __dp1 as double × -0.0001
    expect(all).toContain('double -0.0001')
    // Then uses the add machinery
    expect(all).toContain('with storage rs:d __dadd_args')
    expect(all).toContain('Pos[0]')
  })
})

describe('double_mul — scoreboard approximation', () => {
  const mathHpSrc = fs.readFileSync(
    path.join(__dirname, '../stdlib/math_hp.mcrs'),
    'utf-8',
  )

  test('double_mul emits data get ×10000 for both operands', () => {
    const source = mathHpSrc + `
      @keep fn test_dmul() {
        let a: double = 3.0d;
        let b: double = 2.0d;
        let result: double = double_mul(a, b);
      }
    `
    const result = compile(source, { namespace: 'dmultest2' })
    const all = getAllMcContent(result.files)
    // Both operands converted to ×10000 scores
    expect(all).toContain('$dmul_a')
    expect(all).toContain('$dmul_b')
    // Result stored back as double × 0.0001
    expect(all).toContain('double 0.0001')
    // Scoreboard multiply
    expect(all).toContain('$dmul_a __rs_math_hp *= $dmul_b __rs_math_hp')
  })
})

describe('double_div — display entity SVD trick', () => {
  const mathHpSrc = fs.readFileSync(
    path.join(__dirname, '../stdlib/math_hp.mcrs'),
    'utf-8',
  )

  test('double_div emits __ddiv_set_mat helper and reads transformation.scale[0]', () => {
    const source = mathHpSrc + `
      @keep fn test_ddiv() {
        let a: double = 6.0d;
        let b: double = 2.0d;
        let result: double = double_div(a, b);
      }
    `
    const result = compile(source, { namespace: 'ddivtest' })
    const all = getAllMcContent(result.files)
    // Uses rs_div entity (block_display)
    expect(all).toContain('rs_div')
    // Reads scale[0] back into __dp0
    expect(all).toContain('transformation.scale[0]')
    // Macro helper called with storage
    expect(all).toContain('with storage rs:math_hp __ddiv_args')
  })

  test('double_div emits __ddiv_set_mat helper function with $(da)/$(db) macros', () => {
    const source = mathHpSrc + `
      @keep fn test_ddiv() {
        let a: double = 6.0d;
        let b: double = 2.0d;
        let result: double = double_div(a, b);
      }
    `
    const result = compile(source, { namespace: 'ddivtest' })
    const helper = result.files.find(f => f.path.includes('__ddiv_set_mat'))
    expect(helper).toBeDefined()
    expect(helper!.content).toContain('$(da)')
    expect(helper!.content).toContain('$(db)')
  })

  test('double_div uses __NS__ correctly', () => {
    const source = mathHpSrc + `
      @keep fn test_ddiv() {
        let a: double = 6.0d;
        let b: double = 2.0d;
        let result: double = double_div(a, b);
      }
    `
    const result = compile(source, { namespace: 'mynamespace' })
    const all = getAllMcContent(result.files)
    expect(all).toContain('function mynamespace:__ddiv_set_mat with storage')
  })
})

describe('double_mul_fixed — true double precision via function macro', () => {
  const mathHpSrc = fs.readFileSync(
    path.join(__dirname, '../stdlib/math_hp.mcrs'),
    'utf-8',
  )

  test('double_mul_fixed compiles with function macro (with storage) pattern', () => {
    const source = mathHpSrc + `
      @keep fn test_dmul() {
        let d: double = 2.5d;
        let result: double = double_mul_fixed(d, 20000);
      }
    `
    const result = compile(source, { namespace: 'dmultest' })
    const all = getAllMcContent(result.files)
    // Must use the macro helper function call
    expect(all).toContain('with storage rs:math_hp __dmul_args')
    // Helper must contain the $ macro line
    expect(all).toContain('$execute store result storage rs:d __dp0 double $(scale)')
    // Scale must be stored as double 0.0001 factor
    expect(all).toContain('scale double 0.0001')
  })

  test('double_mul_fixed emits __dmul_apply_scale helper function', () => {
    const source = mathHpSrc + `
      @keep fn test_dmul() {
        let d: double = 2.5d;
        let result: double = double_mul_fixed(d, 20000);
      }
    `
    const result = compile(source, { namespace: 'dmultest' })
    const helper = result.files.find(f => f.path.includes('__dmul_apply_scale'))
    expect(helper).toBeDefined()
    expect(helper!.content).toContain('$execute store result storage rs:d __dp0 double $(scale)')
  })

  test('double_mul_fixed uses __NS__ correctly — helper called in same namespace', () => {
    const source = mathHpSrc + `
      @keep fn test_dmul() {
        let d: double = 2.5d;
        let result: double = double_mul_fixed(d, 20000);
      }
    `
    const result = compile(source, { namespace: 'mynamespace' })
    const all = getAllMcContent(result.files)
    // The function call must use the compilation namespace, not a hardcoded one
    expect(all).toContain('function mynamespace:__dmul_apply_scale with storage')
  })
})
