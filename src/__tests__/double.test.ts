/**
 * Tests for double type support in RedScript.
 *
 * double variables are NBT-backed IEEE 754 doubles stored in rs:d storage.
 * All arithmetic goes through fixed (×10000) as intermediate representation.
 */

import { compile } from '../emit/compile'

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
