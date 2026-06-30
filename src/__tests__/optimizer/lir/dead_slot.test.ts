import { deadSlotElim, deadSlotElimModule } from '../../../optimizer/lir/dead_slot'
import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'

const obj = '__test'

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(name: string, instructions: LIRInstr[]): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function mkModule(functions: LIRFunction[]): LIRModule {
  return { functions, namespace: 'test', objective: obj }
}

describe('dead slot elimination', () => {
  test('removes score_set when dst is never read', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$dead'), value: 42 },
      { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$live') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$live'), value: 1 })
  })

  test('removes score_copy when dst is never read', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$src'), value: 5 },
      { kind: 'score_copy', dst: mkSlot('$dead'), src: mkSlot('$src') },
      { kind: 'return_value', slot: mkSlot('$src') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions.some(i => i.kind === 'score_copy')).toBe(false)
  })

  test('removes earlier compiler temp write when same temp is overwritten before read', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'return_value', slot: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$t0'), value: 2 })
    expect(result.instructions[1]).toEqual({ kind: 'return_value', slot: mkSlot('$t0') })
  })

  test('handles a chain where only the last temp value is read', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 3 },
      { kind: 'return_value', slot: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$t0'), value: 3 })
    expect(result.instructions[1]).toEqual({ kind: 'return_value', slot: mkSlot('$t0') })
  })

  test('removes unused const materialization when it is not referenced', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$__const_7'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$live') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$live'), value: 1 })
    expect(result.instructions[1]).toEqual({ kind: 'return_value', slot: mkSlot('$live') })
  })

  test('keeps unused const materialization when followed by raw barrier', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$__const_7'), value: 7 },
      { kind: 'raw', cmd: 'say something opaque' },
      { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$live') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('keeps unused const materialization when followed by call barrier', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$__const_9'), value: 9 },
      { kind: 'call', fn: 'test:side_effect' },
      { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$live') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('treats function-local temp names as compiler-owned', () => {
    const fn = mkFn('my_fn', [
      { kind: 'score_set', dst: mkSlot('$my_fn_t0'), value: 1 },
      { kind: 'score_set', dst: mkSlot('$my_fn_t0'), value: 2 },
      { kind: 'score_copy', dst: mkSlot('$x'), src: mkSlot('$my_fn_t0') },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$my_fn_t0'), value: 2 })
    expect(result.instructions[1]).toEqual({ kind: 'score_copy', dst: mkSlot('$x'), src: mkSlot('$my_fn_t0') })
  })

  test('keeps writes to $ret slot', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$ret'), value: 10 },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(1)
  })

  test('keeps writes to $ret_field slots', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$ret_x'), value: 10 },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(1)
  })

  test('keeps writes to $p0 parameter slots', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$p0'), value: 3 },
      { kind: 'score_set', dst: mkSlot('$p1'), value: 7 },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('keeps writes to future $pN parameter slots', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$p12'), value: 12 },
      { kind: 'score_set', dst: mkSlot('$p12'), value: 13 },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('keeps protected temp-ABI-like slots even when they are overwritten', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$ret'), value: 4 },
      { kind: 'score_set', dst: mkSlot('$ret'), value: 5 },
      { kind: 'score_set', dst: mkSlot('$p0'), value: 1 },
      { kind: 'score_set', dst: mkSlot('$p0'), value: 2 },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$ret') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('keeps non-pure-write instructions even if dst is unread', () => {
    const fn = mkFn('test', [
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$y') },
      { kind: 'call', fn: 'test:foo' },
      { kind: 'raw', cmd: 'say hello' },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('keeps score_set when dst is read by score_add', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t'), value: 5 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$t') },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('keeps a temp slot write that is destructively read by the next RMW op', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t'), value: 1 },
      { kind: 'score_add', dst: mkSlot('$t'), src: mkSlot('$x') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('keeps a temp slot write read by call_context score conditions', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$cond'), value: 1 },
      { kind: 'call_context', fn: 'test:target', subcommands: [{ kind: 'if_score', a: '$cond __test', op: 'eq', b: '$rhs __test' }] },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('keeps a temp slot write consumed by nested raw store command text', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$x'), value: 1 },
      { kind: 'store_cmd_to_score', dst: mkSlot('$out'), cmd: { kind: 'raw', cmd: 'scoreboard players get $x __test' } },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('keeps earlier temp write when temp is read before overwrite', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'score_copy', dst: mkSlot('$x'), src: mkSlot('$t0') },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'return_value', slot: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$t0'), value: 1 })
  })

  test('keeps non-temp user slot overwrite unless no-read behavior applies', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$user_tmp'), value: 1 },
      { kind: 'score_set', dst: mkSlot('$user_tmp'), value: 2 },
      { kind: 'return_value', slot: mkSlot('$user_tmp') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$user_tmp'), value: 1 })
  })

  test('keeps temp writes around opaque boundaries when they cannot be proven safe', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'call', fn: 'test:side_effect' },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('keeps temp writes across macro_line barriers', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'macro_line', template: '$say $(opaque)' },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'return_value', slot: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('keeps temp writes across call_macro barriers', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'call_macro', fn: 'test:macro_target', storage: 'test:args' },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'return_value', slot: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('keeps temp writes across storage/NBT barriers', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'nbt_set_literal', ns: 'test:state', path: 'value', value: '1' },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'return_value', slot: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('keeps typed storage score materialization and NBT score readback barriers', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$src'), value: 5 },
      { kind: 'store_score_to_nbt', src: mkSlot('$src'), ns: 'test:state', path: 'value', type: 'int', scale: 1 },
      { kind: 'store_nbt_to_score', dst: mkSlot('$out'), ns: 'test:state', path: 'value', scale: 1 },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('keeps temp writes across NBT copy barriers', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
      { kind: 'nbt_copy', srcNs: 'test:state', srcPath: 'a', dstNs: 'test:state', dstPath: 'b' },
      { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
      { kind: 'return_value', slot: mkSlot('$t0') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(4)
  })

  test('returns same reference when nothing removed', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$x'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
    const result = deadSlotElim(fn)
    expect(result).toBe(fn)
  })

  test('handles call_if_matches slot reads', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$cond'), value: 1 },
      { kind: 'call_if_matches', fn: 'test:branch', slot: mkSlot('$cond'), range: '1' },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('keeps score_set when slot is referenced in raw command', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$cond'), value: 0 },
      { kind: 'raw', cmd: 'execute if score $a __test > $b __test run scoreboard players set $cond __test 1' },
      { kind: 'call_if_matches', fn: 'test:branch', slot: mkSlot('$cond'), range: '1' },
    ])
    const result = deadSlotElim(fn)
    // $cond is referenced in the raw command — must not be removed
    expect(result.instructions).toHaveLength(3)
  })

  test('handles call_if_score slot reads', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$a'), value: 1 },
      { kind: 'score_set', dst: mkSlot('$b'), value: 2 },
      { kind: 'call_if_score', fn: 'test:cmp', a: mkSlot('$a'), op: 'lt', b: mkSlot('$b') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })
})

describe('dead slot elimination (module-level)', () => {
  test('removes slot dead across all functions', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$dead'), value: 99 },
        { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      ]),
      mkFn('fn2', [
        { kind: 'return_value', slot: mkSlot('$live') },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(1)
    expect(result.functions[0].instructions[0]).toEqual({
      kind: 'score_set', dst: mkSlot('$live'), value: 1,
    })
  })

  test('keeps slot read in another function', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$shared'), value: 5 },
      ]),
      mkFn('fn2', [
        { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$shared') },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(1)
  })

  test('removes earlier compiler temp write in module function when overwritten before read', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
        { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
        { kind: 'return_value', slot: mkSlot('$t0') },
      ]),
      mkFn('fn2', [
        { kind: 'score_set', dst: mkSlot('$tmp'), value: 1 },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(2)
    expect(result.functions[0].instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$t0'), value: 2 })
  })

  test('keeps overwritten temp writes when another function can observe the slot', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
        { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
        { kind: 'return_value', slot: mkSlot('$t0') },
      ]),
      mkFn('fn2', [
        { kind: 'call', fn: 'other:consumer' },
        { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$t0') },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(3)
  })

  test('keeps overwritten temp writes when another function mentions the slot in raw text', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
        { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
        { kind: 'return_value', slot: mkSlot('$t0') },
      ]),
      mkFn('fn2', [
        { kind: 'raw', cmd: 'execute if score $t0 __test matches 1.. run say observed' },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(3)
  })

  test('keeps overwritten temp writes when another function mentions the slot in macro text', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
        { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
        { kind: 'return_value', slot: mkSlot('$t0') },
      ]),
      mkFn('fn2', [
        { kind: 'macro_line', template: '$scoreboard players get $t0 __test' },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(3)
  })

  test('keeps overwritten temp writes when another function mentions the slot in call_context', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$t0'), value: 1 },
        { kind: 'score_set', dst: mkSlot('$t0'), value: 2 },
        { kind: 'return_value', slot: mkSlot('$t0') },
      ]),
      mkFn('fn2', [
        { kind: 'call_context', fn: 'test:target', subcommands: [{ kind: 'if_score', a: '$t0 __test', op: 'eq', b: '$rhs __test' }] },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(3)
  })

  test('keeps cross-function-safe const materialization when an opaque call barrier exists', () => {
    const mod = mkModule([
      mkFn('producer', [
        { kind: 'score_set', dst: mkSlot('$__const_3'), value: 3 },
        { kind: 'call', fn: 'test:side_effect' },
      ]),
      mkFn('consumer', [
        { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(2)
  })
})
