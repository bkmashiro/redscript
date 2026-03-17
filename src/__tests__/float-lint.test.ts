/**
 * Tests for [FloatArithmetic] lint warning.
 *
 * 'float' is a MC NBT system boundary type (used for volume/pitch parameters).
 * It should NOT be used for arithmetic — use 'fixed' (×10000) instead.
 */

import { compile } from '../emit/compile'

function compileAndGetWarnings(source: string): string[] {
  const result = compile(source, { namespace: 'floatlinttest' })
  return result.warnings
}

describe('[FloatArithmetic] lint warnings', () => {
  test('float arithmetic emits [FloatArithmetic] warning', () => {
    const source = `
fn test(): void {
  let a: float = 1.5f;
  let b: float = 2.5f;
  let c: float = a + b;
}
`
    const warnings = compileAndGetWarnings(source)
    const floatArithWarnings = warnings.filter(w => w.includes('[FloatArithmetic]'))
    expect(floatArithWarnings.length).toBeGreaterThan(0)
    expect(floatArithWarnings[0]).toContain("'float' is a system boundary type")
    expect(floatArithWarnings[0]).toContain("use 'fixed' for arithmetic")
  })

  test('float used as function parameter type — no [FloatArithmetic] warning', () => {
    const source = `
fn foo(volume: float): void {
}
`
    const warnings = compileAndGetWarnings(source)
    const floatArithWarnings = warnings.filter(w => w.includes('[FloatArithmetic]'))
    expect(floatArithWarnings).toHaveLength(0)
  })

  test('fixed arithmetic — no [FloatArithmetic] warning', () => {
    const source = `
fn test(): void {
  let x: fixed = 15000 as fixed;
  let y: fixed = x + 5000;
}
`
    const warnings = compileAndGetWarnings(source)
    const floatArithWarnings = warnings.filter(w => w.includes('[FloatArithmetic]'))
    expect(floatArithWarnings).toHaveLength(0)
  })

  test('float literal assigned directly — no [FloatArithmetic] warning (only [DeprecatedType])', () => {
    const source = `
fn test(): void {
  let v: float = 1.5f;
}
`
    const warnings = compileAndGetWarnings(source)
    const floatArithWarnings = warnings.filter(w => w.includes('[FloatArithmetic]'))
    expect(floatArithWarnings).toHaveLength(0)
    // But [DeprecatedType] should still fire
    const deprecatedWarnings = warnings.filter(w => w.includes('[DeprecatedType]'))
    expect(deprecatedWarnings.length).toBeGreaterThan(0)
  })

  test('compilation still succeeds when float arithmetic is used (warning only, no error)', () => {
    const source = `
fn test(): void {
  let a: float = 1.5f;
  let b: float = 2.5f;
  let c: float = a + b;
}
`
    // Should not throw
    expect(() => compile(source, { namespace: 'floatlinttest' })).not.toThrow()
  })

  test('float return type with arithmetic binary expression — emits [FloatArithmetic] warning', () => {
    const source = `
fn compute(a: float, b: float): float {
  return a + b;
}
`
    const warnings = compileAndGetWarnings(source)
    const floatArithWarnings = warnings.filter(w => w.includes('[FloatArithmetic]'))
    expect(floatArithWarnings.length).toBeGreaterThan(0)
  })

  test('float return type with literal — no extra [FloatArithmetic] warning beyond operand check', () => {
    const source = `
fn get_volume(): float {
  return 1.5f;
}
`
    const warnings = compileAndGetWarnings(source)
    // The literal itself is not arithmetic, so no FloatArithmetic warning from return check
    // (There may be a [DeprecatedType] warning but not [FloatArithmetic])
    const floatArithWarnings = warnings.filter(w => w.includes('[FloatArithmetic]'))
    expect(floatArithWarnings).toHaveLength(0)
  })
})
