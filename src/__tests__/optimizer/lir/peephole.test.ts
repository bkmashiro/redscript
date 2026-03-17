import { execStorePeephole } from '../../../optimizer/lir/peephole'
import type { LIRFunction, LIRInstr, Slot } from '../../../lir/types'

const obj = '__test'

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(instructions: LIRInstr[]): LIRFunction {
  return { name: 'test', instructions, isMacro: false, macroParams: [] }
}

describe('execute store peephole', () => {
  test('merges call_context + score_set into store_cmd_to_score', () => {
    const callCtx: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:myfn',
      subcommands: [{ kind: 'as', selector: '@s' }],
    }
    const fn = mkFn([
      callCtx,
      { kind: 'score_set', dst: mkSlot('$result'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'store_cmd_to_score',
      dst: mkSlot('$result'),
      cmd: callCtx,
    })
  })

  test('merges call_context + score_set with zero value', () => {
    const callCtx: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:check',
      subcommands: [{ kind: 'at_self' }],
    }
    const fn = mkFn([
      callCtx,
      { kind: 'score_set', dst: mkSlot('$flag'), value: 0 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0].kind).toBe('store_cmd_to_score')
  })

  test('does not merge when call_context and score_set are not adjacent', () => {
    const fn = mkFn([
      {
        kind: 'call_context',
        fn: 'ns:myfn',
        subcommands: [{ kind: 'as', selector: '@s' }],
      },
      { kind: 'call', fn: 'ns:other' },
      { kind: 'score_set', dst: mkSlot('$result'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('does not merge plain call + score_set', () => {
    const fn = mkFn([
      { kind: 'call', fn: 'ns:myfn' },
      { kind: 'score_set', dst: mkSlot('$result'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('does not merge call_context + score_copy', () => {
    const fn = mkFn([
      {
        kind: 'call_context',
        fn: 'ns:myfn',
        subcommands: [{ kind: 'as', selector: '@s' }],
      },
      { kind: 'score_copy', dst: mkSlot('$result'), src: mkSlot('$src') },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('merges multiple adjacent call_context + score_set pairs', () => {
    const ctx1: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:fn1',
      subcommands: [{ kind: 'as', selector: '@s' }],
    }
    const ctx2: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:fn2',
      subcommands: [{ kind: 'at_self' }],
    }
    const fn = mkFn([
      ctx1,
      { kind: 'score_set', dst: mkSlot('$r1'), value: 1 },
      ctx2,
      { kind: 'score_set', dst: mkSlot('$r2'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({
      kind: 'store_cmd_to_score',
      dst: mkSlot('$r1'),
      cmd: ctx1,
    })
    expect(result.instructions[1]).toEqual({
      kind: 'store_cmd_to_score',
      dst: mkSlot('$r2'),
      cmd: ctx2,
    })
  })

  test('returns same reference when nothing changed', () => {
    const fn = mkFn([
      { kind: 'call', fn: 'ns:myfn' },
      { kind: 'score_copy', dst: mkSlot('$a'), src: mkSlot('$b') },
    ])
    const result = execStorePeephole(fn)
    expect(result).toBe(fn)
  })

  test('handles empty instruction list', () => {
    const fn = mkFn([])
    const result = execStorePeephole(fn)
    expect(result).toBe(fn)
  })

  test('handles single instruction', () => {
    const fn = mkFn([{ kind: 'score_set', dst: mkSlot('$x'), value: 5 }])
    const result = execStorePeephole(fn)
    expect(result).toBe(fn)
  })
})

describe('execute store success peephole (cmp pattern)', () => {
  test('merges score_set(0) + raw execute-set-1 into execute store success', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$flag'), value: 0 },
      { kind: 'raw', cmd: `execute if score $a ${obj} > $b ${obj} run scoreboard players set $flag ${obj} 1` },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'raw',
      cmd: `execute store success score $flag ${obj} if score $a ${obj} > $b ${obj}`,
    })
  })

  test('merges with "unless" condition', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$ne_flag'), value: 0 },
      { kind: 'raw', cmd: `execute unless score $x ${obj} = $y ${obj} run scoreboard players set $ne_flag ${obj} 1` },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'raw',
      cmd: `execute store success score $ne_flag ${obj} unless score $x ${obj} = $y ${obj}`,
    })
  })

  test('does not merge when players do not match', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$a'), value: 0 },
      { kind: 'raw', cmd: `execute if score $x ${obj} > $y ${obj} run scoreboard players set $b ${obj} 1` },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result).toBe(fn)
  })

  test('does not merge when objectives do not match', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$flag'), value: 0 },
      { kind: 'raw', cmd: `execute if score $a other_obj > $b other_obj run scoreboard players set $flag other_obj 1` },
    ])
    const result = execStorePeephole(fn)
    // objectives differ between score_set (obj=__test) and raw (other_obj)
    expect(result.instructions).toHaveLength(2)
    expect(result).toBe(fn)
  })

  test('does not merge score_set(1) + raw execute-set-1 (value must be 0)', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$flag'), value: 1 },
      { kind: 'raw', cmd: `execute if score $a ${obj} > $b ${obj} run scoreboard players set $flag ${obj} 1` },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result).toBe(fn)
  })

  test('does not merge when there is an instruction between them', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$flag'), value: 0 },
      { kind: 'call', fn: 'ns:other' },
      { kind: 'raw', cmd: `execute if score $a ${obj} > $b ${obj} run scoreboard players set $flag ${obj} 1` },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('merges multiple adjacent cmp patterns', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$r1'), value: 0 },
      { kind: 'raw', cmd: `execute if score $a ${obj} > $b ${obj} run scoreboard players set $r1 ${obj} 1` },
      { kind: 'score_set', dst: mkSlot('$r2'), value: 0 },
      { kind: 'raw', cmd: `execute if score $c ${obj} < $d ${obj} run scoreboard players set $r2 ${obj} 1` },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({
      kind: 'raw',
      cmd: `execute store success score $r1 ${obj} if score $a ${obj} > $b ${obj}`,
    })
    expect(result.instructions[1]).toEqual({
      kind: 'raw',
      cmd: `execute store success score $r2 ${obj} if score $c ${obj} < $d ${obj}`,
    })
  })

  test('5 cmp patterns: saves exactly 5 commands', () => {
    const instrs: LIRInstr[] = []
    for (let k = 1; k <= 5; k++) {
      instrs.push({ kind: 'score_set', dst: mkSlot(`$r${k}`), value: 0 })
      instrs.push({ kind: 'raw', cmd: `execute if score $a ${obj} > $b ${obj} run scoreboard players set $r${k} ${obj} 1` })
    }
    const fn = mkFn(instrs)
    expect(fn.instructions).toHaveLength(10)
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(5)
  })
})
