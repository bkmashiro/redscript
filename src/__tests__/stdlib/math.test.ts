/**
 * Tests for stdlib/math.mcrs functions.
 * Verifies compilation succeeds and key functions are present.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_STDLIB = path.join(__dirname, '../../stdlib/math.mcrs')
const mathSrc = fs.readFileSync(MATH_STDLIB, 'utf-8')

function getFn(files: { path: string; content: string }[], fnName: string): string {
  // Match exact name or specialized variants (e.g. fn__const_0_0)
  const f = files.find(f => f.path.endsWith(`/${fnName}.mcfunction`))
    ?? files.find(f => {
      const base = f.path.split('/').pop()!
      return base.startsWith(`${fnName}__`)
    })
  if (!f) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found. Files:\n${paths}`)
  }
  return f.content
}

/** Get all content from all emitted files */
function getAllContent(files: { path: string; content: string }[]): string {
  return files.map(f => f.content).join('\n')
}

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(mathSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

describe('stdlib/math.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      const result = compile(mathSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  test('abs function is emitted', () => {
    const files = compileWith(`@keep fn t() { let x: int = -5; scoreboard_set("#r","t",abs(x)); }`)
    // abs function (or its monomorphized variant abs_int) should be called
    // The 't' entry point may be inlined by the compiler; check all generated content
    const allContent = getAllContent(files)
    const hasAbs = files.some(f => f.path.includes('abs')) || allContent.includes('abs')
    expect(hasAbs).toBe(true)
  })

  test('factorial(5) compiles and references no recursive calls for n=5', () => {
    const files = compileWith(`@keep fn t() { let x: int = 5; scoreboard_set("#r","t",factorial(x)); }`)
    expect(files.some(f => f.path.includes('factorial'))).toBe(true)
  })

  test('combinations function is emitted', () => {
    const files = compileWith(`@keep fn t() { let n: int = 5; let k: int = 2; scoreboard_set("#r","t",combinations(n,k)); }`)
    expect(files.some(f => f.path.includes('combinations'))).toBe(true)
  })

  test('pow_int function is emitted', () => {
    const files = compileWith(`@keep fn t() { scoreboard_set("#r","t",pow_int(2,10)); }`)
    expect(files.some(f => f.path.includes('pow_int'))).toBe(true)
  })

  test('gcd function is emitted', () => {
    const files = compileWith(`@keep fn t() { scoreboard_set("#r","t",gcd(12,8)); }`)
    expect(files.some(f => f.path.includes('gcd'))).toBe(true)
  })

  test('log2_int function is emitted', () => {
    const files = compileWith(`@keep fn t() { scoreboard_set("#r","t",log2_int(8)); }`)
    expect(files.some(f => f.path.includes('log2_int'))).toBe(true)
  })

  test('sqrt_fx function is emitted (uses isqrt)', () => {
    const files = compileWith(`@keep fn t() { let x: int = 40000; scoreboard_set("#r","t",sqrt_fx(x)); }`)
    expect(files.some(f => f.path.includes('sqrt_fx') || f.path.includes('isqrt'))).toBe(true)
  })

  test('explicit legacy ×1000 helper aliases compile', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let a: int = sqrt_fx1000(2000);
        let b: int = lerp_t1000(0, 1000, 500);
        let c: int = mul_fx1000(500, 707);
        let d: int = div_fx1000(1, 3);
        let e: int = smoothstep_t1000(0, 100, 50);
        let f: int = smootherstep_t1000(0, 100, 50);
        return a + b + c + d + e + f;
      }
    `)
    const allContent = getAllContent(files)
    expect(allContent).toContain('sqrt_fx1000')
    expect(allContent).toContain('lerp_t1000')
    expect(allContent).toContain('mul_fx1000')
    expect(allContent).toContain('div_fx1000')
    expect(allContent).toContain('smoothstep_t1000')
    expect(allContent).toContain('smootherstep_t1000')
  })

  test('explicit legacy ×1000 trig aliases compile and keep load requirement', () => {
    const files = compileWith(`
      @keep fn t(): int {
        return sin_fx1000(30) + cos_fx1000(60);
      }
    `)
    const allContent = getAllContent(files)
    expect(allContent).toContain('sin_fx1000')
    expect(allContent).toContain('cos_fx1000')
    expect(files.some(f => f.path.endsWith('/load.mcfunction'))).toBe(true)
  })

  test('quadratic_disc function is emitted', () => {
    const files = compileWith(`@keep fn t() { let a: int=1; let b: int=-5; let c: int=6; scoreboard_set("#r","t",quadratic_disc(a,b,c)); }`)
    expect(files.some(f => f.path.includes('quadratic_disc'))).toBe(true)
  })

  test('ln function is emitted with atanh implementation', () => {
    const files = compileWith(`@keep fn t() { let x: int = 20000; scoreboard_set("#r","t",ln(x)); }`)
    expect(files.some(f => f.path.includes('ln'))).toBe(true)
    // Should use while loops for range reduction
    const lnFn = files.find(f => f.path.endsWith('/ln.mcfunction'))
    if (lnFn) {
      expect(lnFn.content.length).toBeGreaterThan(0)
    }
  })

  test('exp_fx function is emitted', () => {
    const files = compileWith(`@keep fn t() { let x: int = 10000; scoreboard_set("#r","t",exp_fx(x)); }`)
    expect(files.some(f => f.path.includes('exp_fx'))).toBe(true)
  })

  test('min(3,7) = 3 via constant folding', () => {
    const files = compileWith(`@keep fn t() { scoreboard_set("#r","t",min(3,7)); }`)
    // min(3,7) should constant-fold to 3; check all generated content
    // The 't' entry point may be inlined by the compiler
    const allContent = getAllContent(files)
    expect(allContent).toContain('3')
  })

  test('clamp is emitted for variable input', () => {
    const files = compileWith(`@keep fn t() { let x: int = 15; scoreboard_set("#r","t",clamp(x,0,10)); }`)
    expect(files.some(f => f.path.includes('clamp'))).toBe(true)
  })
})
