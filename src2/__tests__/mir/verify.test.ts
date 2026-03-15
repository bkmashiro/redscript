import { verifyMIR } from '../../mir/verify'
import type { MIRModule, MIRBlock, MIRFunction } from '../../mir/types'

function makeModule(functions: MIRFunction[]): MIRModule {
  return { functions, namespace: 'test', objective: '__test' }
}

function makeBlock(id: string, instrs: any[], term: any, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

describe('MIR verifier — terminator checks', () => {
  test('rejects block without proper terminator', () => {
    const fn: MIRFunction = {
      name: 'bad',
      params: [],
      blocks: [
        makeBlock('entry', [], { kind: 'const', dst: 't0', value: 42 }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const errors = verifyMIR(makeModule([fn]))
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('does not end with a terminator')
  })

  test('rejects terminator in non-terminal position', () => {
    const fn: MIRFunction = {
      name: 'bad',
      params: [],
      blocks: [
        makeBlock(
          'entry',
          [{ kind: 'jump', target: 'entry' }], // terminator in instrs
          { kind: 'return', value: null },
        ),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const errors = verifyMIR(makeModule([fn]))
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('terminator')
    expect(errors[0].message).toContain('non-terminal position')
  })

  test('accepts valid terminator (return)', () => {
    const fn: MIRFunction = {
      name: 'good',
      params: [],
      blocks: [
        makeBlock('entry', [], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    expect(verifyMIR(makeModule([fn]))).toEqual([])
  })

  test('accepts valid terminator (jump)', () => {
    const fn: MIRFunction = {
      name: 'good',
      params: [],
      blocks: [
        makeBlock('entry', [], { kind: 'jump', target: 'b1' }),
        makeBlock('b1', [], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    expect(verifyMIR(makeModule([fn]))).toEqual([])
  })
})

describe('MIR verifier — target existence', () => {
  test('rejects jump to non-existent block', () => {
    const fn: MIRFunction = {
      name: 'bad',
      params: [],
      blocks: [
        makeBlock('entry', [], { kind: 'jump', target: 'nonexistent' }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const errors = verifyMIR(makeModule([fn]))
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('non-existent target')
  })

  test('rejects branch to non-existent block', () => {
    const fn: MIRFunction = {
      name: 'bad',
      params: [],
      blocks: [
        makeBlock('entry', [
          { kind: 'const', dst: 't0', value: 1 },
        ], { kind: 'branch', cond: { kind: 'temp', name: 't0' }, then: 'yes', else: 'no' }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const errors = verifyMIR(makeModule([fn]))
    expect(errors.length).toBe(2) // both targets missing
    expect(errors[0].message).toContain('non-existent target')
  })
})

describe('MIR verifier — reachability', () => {
  test('rejects unreachable block', () => {
    const fn: MIRFunction = {
      name: 'bad',
      params: [],
      blocks: [
        makeBlock('entry', [], { kind: 'return', value: null }),
        makeBlock('orphan', [], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const errors = verifyMIR(makeModule([fn]))
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('unreachable')
    expect(errors[0].block).toBe('orphan')
  })

  test('accepts all blocks reachable via jumps', () => {
    const fn: MIRFunction = {
      name: 'good',
      params: [],
      blocks: [
        makeBlock('entry', [], { kind: 'jump', target: 'b1' }),
        makeBlock('b1', [], { kind: 'jump', target: 'b2' }),
        makeBlock('b2', [], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    expect(verifyMIR(makeModule([fn]))).toEqual([])
  })

  test('accepts blocks reachable via branch', () => {
    const fn: MIRFunction = {
      name: 'good',
      params: [],
      blocks: [
        makeBlock('entry', [
          { kind: 'const', dst: 't0', value: 1 },
        ], { kind: 'branch', cond: { kind: 'temp', name: 't0' }, then: 'yes', else: 'no' }),
        makeBlock('yes', [], { kind: 'return', value: null }),
        makeBlock('no', [], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    expect(verifyMIR(makeModule([fn]))).toEqual([])
  })
})

describe('MIR verifier — use-before-def', () => {
  test('rejects use of undefined temp', () => {
    const fn: MIRFunction = {
      name: 'bad',
      params: [],
      blocks: [
        makeBlock('entry', [
          { kind: 'copy', dst: 't0', src: { kind: 'temp', name: 'undefined_temp' } },
        ], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const errors = verifyMIR(makeModule([fn]))
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('undefined_temp')
    expect(errors[0].message).toContain('never defined')
  })

  test('accepts temps defined as params', () => {
    const fn: MIRFunction = {
      name: 'good',
      params: [{ name: 't0', isMacroParam: false }],
      blocks: [
        makeBlock('entry', [], { kind: 'return', value: { kind: 'temp', name: 't0' } }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    expect(verifyMIR(makeModule([fn]))).toEqual([])
  })

  test('accepts temps defined in instructions', () => {
    const fn: MIRFunction = {
      name: 'good',
      params: [],
      blocks: [
        makeBlock('entry', [
          { kind: 'const', dst: 't0', value: 42 },
          { kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } },
        ], { kind: 'return', value: { kind: 'temp', name: 't1' } }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    expect(verifyMIR(makeModule([fn]))).toEqual([])
  })

  test('const operands do not require definition', () => {
    const fn: MIRFunction = {
      name: 'good',
      params: [],
      blocks: [
        makeBlock('entry', [
          { kind: 'const', dst: 't0', value: 5 },
          { kind: 'add', dst: 't1', a: { kind: 'temp', name: 't0' }, b: { kind: 'const', value: 3 } },
        ], { kind: 'return', value: { kind: 'temp', name: 't1' } }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    expect(verifyMIR(makeModule([fn]))).toEqual([])
  })
})

describe('MIR verifier — entry block', () => {
  test('rejects missing entry block', () => {
    const fn: MIRFunction = {
      name: 'bad',
      params: [],
      blocks: [
        makeBlock('not_entry', [], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const errors = verifyMIR(makeModule([fn]))
    expect(errors.some(e => e.message.includes('entry block'))).toBe(true)
  })
})
