import { lirOptimizeModule } from '../../../optimizer/lir/pipeline'
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

describe('LIR optimization pipeline', () => {
  test('dead slot + const_imm combined: removes dead write and folds constant', () => {
    const mod = mkModule([
      mkFn('main', [
        // Dead write — $dead is never read anywhere
        { kind: 'score_set', dst: mkSlot('$dead'), value: 99 },
        // Constant add pattern
        { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
        { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
        { kind: 'return_value', slot: mkSlot('$x') },
      ]),
    ])

    const result = lirOptimizeModule(mod)
    const instrs = result.functions[0].instructions

    // $dead should be removed by dead_slot
    expect(instrs.some(i =>
      i.kind === 'score_set' && i.dst.player === '$dead'
    )).toBe(false)

    // const+add should be folded by const_imm
    expect(instrs.some(i =>
      i.kind === 'raw' && i.cmd.includes('scoreboard players add $x')
    )).toBe(true)
  })

  test('dead slot enables const_imm: removing extra use makes const single-use', () => {
    // $__const_5 is used twice: once in score_add and once in a dead score_copy
    // After dead_slot removes the dead copy, $__const_5 becomes single-use → foldable
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
        { kind: 'score_copy', dst: mkSlot('$dead'), src: mkSlot('$__const_5') },
        { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
        { kind: 'return_value', slot: mkSlot('$x') },
      ]),
    ])

    const result = lirOptimizeModule(mod)
    const instrs = result.functions[0].instructions

    // The dead copy should be gone and const_imm should fold
    expect(instrs.some(i =>
      i.kind === 'raw' && i.cmd.includes('scoreboard players add $x')
    )).toBe(true)
    expect(instrs.some(i =>
      i.kind === 'score_copy' && i.dst.player === '$dead'
    )).toBe(false)
  })

  test('preserves module when no optimizations apply', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: mkSlot('$x'), value: 1 },
        { kind: 'return_value', slot: mkSlot('$x') },
      ]),
    ])

    const result = lirOptimizeModule(mod)
    expect(result.functions[0].instructions).toHaveLength(2)
  })

  test('works across multiple functions', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$dead_in_fn1'), value: 0 },
        { kind: 'score_set', dst: mkSlot('$__const_10'), value: 10 },
        { kind: 'score_add', dst: mkSlot('$a'), src: mkSlot('$__const_10') },
        { kind: 'return_value', slot: mkSlot('$a') },
      ]),
      mkFn('fn2', [
        { kind: 'score_set', dst: mkSlot('$__const_3'), value: 3 },
        { kind: 'score_sub', dst: mkSlot('$b'), src: mkSlot('$__const_3') },
        { kind: 'return_value', slot: mkSlot('$b') },
      ]),
    ])

    const result = lirOptimizeModule(mod)

    // fn1: dead write removed, const folded
    const fn1 = result.functions[0]
    expect(fn1.instructions.some(i =>
      i.kind === 'score_set' && i.dst.player === '$dead_in_fn1'
    )).toBe(false)
    expect(fn1.instructions.some(i =>
      i.kind === 'raw' && i.cmd.includes('add $a')
    )).toBe(true)

    // fn2: const folded
    const fn2 = result.functions[1]
    expect(fn2.instructions.some(i =>
      i.kind === 'raw' && i.cmd.includes('remove $b')
    )).toBe(true)
  })
})
