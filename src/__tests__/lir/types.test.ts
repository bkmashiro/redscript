import type { Slot, LIRInstr, LIRFunction, LIRModule } from '../../lir/types'

describe('LIR types — Slot', () => {
  test('Slot has player and obj fields', () => {
    const slot: Slot = { player: '$t0', obj: '__test' }
    expect(slot.player).toBe('$t0')
    expect(slot.obj).toBe('__test')
  })
})

describe('LIR types — instructions', () => {
  test('score_set instruction', () => {
    const instr: LIRInstr = { kind: 'score_set', dst: { player: '$x', obj: '__ns' }, value: 42 }
    expect(instr.kind).toBe('score_set')
  })

  test('score_copy instruction', () => {
    const dst: Slot = { player: '$x', obj: '__ns' }
    const src: Slot = { player: '$y', obj: '__ns' }
    const instr: LIRInstr = { kind: 'score_copy', dst, src }
    expect(instr.kind).toBe('score_copy')
  })

  test('score arithmetic instructions', () => {
    const dst: Slot = { player: '$x', obj: '__ns' }
    const src: Slot = { player: '$y', obj: '__ns' }
    const ops: LIRInstr['kind'][] = ['score_add', 'score_sub', 'score_mul', 'score_div', 'score_mod']
    for (const kind of ops) {
      const instr: LIRInstr = { kind, dst, src } as LIRInstr
      expect(instr.kind).toBe(kind)
    }
  })

  test('score_min, score_max instructions', () => {
    const dst: Slot = { player: '$x', obj: '__ns' }
    const src: Slot = { player: '$y', obj: '__ns' }
    const min: LIRInstr = { kind: 'score_min', dst, src }
    const max: LIRInstr = { kind: 'score_max', dst, src }
    expect(min.kind).toBe('score_min')
    expect(max.kind).toBe('score_max')
  })

  test('score_swap instruction', () => {
    const a: Slot = { player: '$x', obj: '__ns' }
    const b: Slot = { player: '$y', obj: '__ns' }
    const instr: LIRInstr = { kind: 'score_swap', a, b }
    expect(instr.kind).toBe('score_swap')
  })

  test('store_cmd_to_score instruction', () => {
    const dst: Slot = { player: '$x', obj: '__ns' }
    const cmd: LIRInstr = { kind: 'call', fn: 'test:foo' }
    const instr: LIRInstr = { kind: 'store_cmd_to_score', dst, cmd }
    expect(instr.kind).toBe('store_cmd_to_score')
  })

  test('store_score_to_nbt instruction', () => {
    const instr: LIRInstr = {
      kind: 'store_score_to_nbt',
      ns: 'rs:data', path: 'value', type: 'int', scale: 1,
      src: { player: '$x', obj: '__ns' },
    }
    expect(instr.kind).toBe('store_score_to_nbt')
  })

  test('store_nbt_to_score instruction', () => {
    const instr: LIRInstr = {
      kind: 'store_nbt_to_score',
      dst: { player: '$x', obj: '__ns' },
      ns: 'rs:data', path: 'value', scale: 1,
    }
    expect(instr.kind).toBe('store_nbt_to_score')
  })

  test('nbt_set_literal instruction', () => {
    const instr: LIRInstr = { kind: 'nbt_set_literal', ns: 'rs:data', path: 'x', value: '42' }
    expect(instr.kind).toBe('nbt_set_literal')
  })

  test('nbt_copy instruction', () => {
    const instr: LIRInstr = {
      kind: 'nbt_copy',
      srcNs: 'rs:a', srcPath: 'x',
      dstNs: 'rs:b', dstPath: 'y',
    }
    expect(instr.kind).toBe('nbt_copy')
  })

  test('call instruction', () => {
    const instr: LIRInstr = { kind: 'call', fn: 'test:foo' }
    expect(instr.kind).toBe('call')
  })

  test('call_macro instruction', () => {
    const instr: LIRInstr = { kind: 'call_macro', fn: 'test:draw', storage: 'rs:macro_args' }
    expect(instr.kind).toBe('call_macro')
  })

  test('call_if_matches instruction', () => {
    const instr: LIRInstr = {
      kind: 'call_if_matches',
      fn: 'test:branch',
      slot: { player: '$cond', obj: '__ns' },
      range: '1',
    }
    expect(instr.kind).toBe('call_if_matches')
  })

  test('call_unless_matches instruction', () => {
    const instr: LIRInstr = {
      kind: 'call_unless_matches',
      fn: 'test:branch',
      slot: { player: '$cond', obj: '__ns' },
      range: '1',
    }
    expect(instr.kind).toBe('call_unless_matches')
  })

  test('call_if_score instruction', () => {
    const instr: LIRInstr = {
      kind: 'call_if_score',
      fn: 'test:check',
      a: { player: '$x', obj: '__ns' },
      op: 'lt',
      b: { player: '$y', obj: '__ns' },
    }
    expect(instr.kind).toBe('call_if_score')
  })

  test('call_unless_score instruction', () => {
    const instr: LIRInstr = {
      kind: 'call_unless_score',
      fn: 'test:check',
      a: { player: '$x', obj: '__ns' },
      op: 'ge',
      b: { player: '$y', obj: '__ns' },
    }
    expect(instr.kind).toBe('call_unless_score')
  })

  test('call_context instruction', () => {
    const instr: LIRInstr = {
      kind: 'call_context',
      fn: 'test:helper',
      subcommands: [{ kind: 'as', selector: '@e[tag=foo]' }, { kind: 'at_self' }],
    }
    expect(instr.kind).toBe('call_context')
  })

  test('return_value instruction', () => {
    const instr: LIRInstr = { kind: 'return_value', slot: { player: '$result', obj: '__ns' } }
    expect(instr.kind).toBe('return_value')
  })

  test('macro_line instruction', () => {
    const instr: LIRInstr = { kind: 'macro_line', template: '$particle end_rod ^$(px) ^$(py) ^5' }
    expect(instr.kind).toBe('macro_line')
  })

  test('raw instruction', () => {
    const instr: LIRInstr = { kind: 'raw', cmd: 'say hello' }
    expect(instr.kind).toBe('raw')
  })
})

describe('LIR types — LIRFunction', () => {
  test('basic function structure', () => {
    const fn: LIRFunction = {
      name: 'main',
      instructions: [
        { kind: 'score_set', dst: { player: '$x', obj: '__ns' }, value: 0 },
      ],
      isMacro: false,
      macroParams: [],
    }
    expect(fn.name).toBe('main')
    expect(fn.instructions).toHaveLength(1)
    expect(fn.isMacro).toBe(false)
    expect(fn.macroParams).toEqual([])
  })

  test('macro function structure', () => {
    const fn: LIRFunction = {
      name: 'draw_pt',
      instructions: [
        { kind: 'macro_line', template: '$particle end_rod ^$(px) ^$(py) ^5' },
      ],
      isMacro: true,
      macroParams: ['px', 'py'],
    }
    expect(fn.isMacro).toBe(true)
    expect(fn.macroParams).toEqual(['px', 'py'])
  })
})

describe('LIR types — LIRModule', () => {
  test('module structure', () => {
    const mod: LIRModule = {
      functions: [],
      namespace: 'mypack',
      objective: '__mypack',
    }
    expect(mod.namespace).toBe('mypack')
    expect(mod.objective).toBe('__mypack')
    expect(mod.functions).toEqual([])
  })
})
