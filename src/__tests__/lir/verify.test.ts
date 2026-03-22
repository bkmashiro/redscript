import { verifyLIR } from '../../lir/verify'
import type { LIRModule, LIRFunction, LIRInstr, Slot } from '../../lir/types'

const OBJ = '__test'
const NS = 'test'

function mkModule(functions: LIRFunction[]): LIRModule {
  return { functions, namespace: NS, objective: OBJ }
}

function mkFn(
  name: string,
  instructions: LIRInstr[],
  isMacro = false,
  macroParams: string[] = [],
): LIRFunction {
  return { name, instructions, isMacro, macroParams }
}

function slot(name: string): Slot {
  return { player: `$${name}`, obj: OBJ }
}

// ---------------------------------------------------------------------------
// Objective checks
// ---------------------------------------------------------------------------

describe('LIR verifier — objective checks', () => {
  test('accepts slots with correct objective', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: slot('x'), value: 42 },
        { kind: 'score_copy', dst: slot('y'), src: slot('x') },
      ]),
    ])
    expect(verifyLIR(mod)).toEqual([])
  })

  test('rejects slot with wrong objective', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: { player: '$x', obj: '__wrong' }, value: 42 },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('objective')
    expect(errors[0].message).toContain('__wrong')
  })

  test('rejects wrong objective in src slot', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_copy', dst: slot('x'), src: { player: '$y', obj: '__bad' } },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('__bad')
  })

  test('checks slots in score_swap', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_swap', a: { player: '$x', obj: '__bad' }, b: slot('y') },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('__bad')
  })

  test('checks slots in store_cmd_to_score (recursive)', () => {
    const mod = mkModule([
      mkFn('main', [
        {
          kind: 'store_cmd_to_score',
          dst: slot('r'),
          cmd: {
            kind: 'call_if_score',
            fn: 'test:main',
            a: { player: '$a', obj: '__bad' },
            op: 'eq' as const,
            b: slot('b'),
          },
        },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('__bad')
  })

  test('checks slot in call_if_matches', () => {
    const mod = mkModule([
      mkFn('main', [
        {
          kind: 'call_if_matches',
          fn: 'test:main',
          slot: { player: '$c', obj: '__bad' },
          range: '1',
        },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
  })

  test('checks slot in return_value', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'return_value', slot: { player: '$r', obj: '__bad' } },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
  })

  test('checks slots in store_score_to_nbt and store_nbt_to_score', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'store_score_to_nbt', ns: 'rs:data', path: 'value', type: 'int', scale: 1, src: { player: '$bad', obj: '__bad' } },
        { kind: 'store_nbt_to_score', dst: { player: '$also_bad', obj: '__bad' }, ns: 'rs:data', path: 'value', scale: 1 },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain('__bad')
    expect(errors[1].message).toContain('__bad')
  })
})

// ---------------------------------------------------------------------------
// Function reference checks
// ---------------------------------------------------------------------------

describe('LIR verifier — function references', () => {
  test('skips placeholder empty function refs', () => {
    const mod = mkModule([
      mkFn('main', [{ kind: 'call', fn: 'test:' }]),
    ])
    expect(verifyLIR(mod)).toEqual([])
  })

  test('accepts call to existing function', () => {
    const mod = mkModule([
      mkFn('main', [{ kind: 'call', fn: 'test:helper' }]),
      mkFn('helper', []),
    ])
    expect(verifyLIR(mod)).toEqual([])
  })

  test('rejects call to undefined function', () => {
    const mod = mkModule([
      mkFn('main', [{ kind: 'call', fn: 'test:nonexistent' }]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('undefined function')
    expect(errors[0].message).toContain('nonexistent')
  })

  test('rejects call_macro to undefined function', () => {
    const mod = mkModule([
      mkFn('main', [{ kind: 'call_macro', fn: 'test:missing', storage: 'rs:macro_args' }]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('undefined function')
  })

  test('rejects call_if_matches to undefined function', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'call_if_matches', fn: 'test:missing', slot: slot('c'), range: '1' },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('undefined function')
  })

  test('rejects call_unless variants to undefined function', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'call_unless_matches', fn: 'test:missing_a', slot: slot('c'), range: '1' },
        { kind: 'call_unless_score', fn: 'test:missing_b', a: slot('a'), op: 'eq', b: slot('b') },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors).toHaveLength(2)
    expect(errors[0].message).toContain('missing_a')
    expect(errors[1].message).toContain('missing_b')
  })

  test('rejects call_context to undefined function', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'call_context', fn: 'test:missing', subcommands: [{ kind: 'at_self' }] },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('undefined function')
  })

  test('checks function refs inside store_cmd_to_score', () => {
    const mod = mkModule([
      mkFn('main', [
        {
          kind: 'store_cmd_to_score',
          dst: slot('r'),
          cmd: { kind: 'call', fn: 'test:missing' },
        },
      ]),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('undefined function')
  })
})

// ---------------------------------------------------------------------------
// Macro line checks
// ---------------------------------------------------------------------------

describe('LIR verifier — macro_line', () => {
  test('accepts macro_line in macro function', () => {
    const mod = mkModule([
      mkFn('draw', [
        { kind: 'macro_line', template: '$particle end_rod ^$(px)' },
      ], true, ['px']),
    ])
    expect(verifyLIR(mod)).toEqual([])
  })

  test('rejects macro_line in non-macro function', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'macro_line', template: '$particle end_rod ^$(px)' },
      ], false),
    ])
    const errors = verifyLIR(mod)
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('macro_line')
    expect(errors[0].message).toContain('non-macro')
  })
})

// ---------------------------------------------------------------------------
// Clean module
// ---------------------------------------------------------------------------

describe('LIR verifier — clean module', () => {
  test('accepts a well-formed module', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: slot('t0'), value: 1 },
        { kind: 'score_set', dst: slot('t1'), value: 2 },
        { kind: 'score_copy', dst: slot('r'), src: slot('t0') },
        { kind: 'score_add', dst: slot('r'), src: slot('t1') },
        { kind: 'call', fn: 'test:helper' },
        { kind: 'return_value', slot: slot('r') },
      ]),
      mkFn('helper', [
        { kind: 'raw', cmd: 'say hello' },
      ]),
    ])
    expect(verifyLIR(mod)).toEqual([])
  })

  test('raw and nbt instructions do not trigger errors', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'raw', cmd: 'say hi' },
        { kind: 'nbt_set_literal', ns: 'rs:data', path: 'x', value: '42' },
        { kind: 'nbt_copy', srcNs: 'rs:a', srcPath: 'x', dstNs: 'rs:b', dstPath: 'y' },
      ]),
    ])
    expect(verifyLIR(mod)).toEqual([])
  })
})
