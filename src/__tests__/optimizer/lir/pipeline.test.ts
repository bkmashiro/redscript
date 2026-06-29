import { runLIRPassManager, lirOptimizeModule } from '../../../optimizer/lir/pipeline'
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
  function runAndCollect(mod: ReturnType<typeof mkModule>) {
    const result = runLIRPassManager(mod)
    return result
  }

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
      i.kind === 'score_delta' && i.dst.player === '$x' && i.value === 5
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
      i.kind === 'score_delta' && i.dst.player === '$x' && i.value === 5
    )).toBe(true)
    expect(instrs.some(i =>
      i.kind === 'score_copy' && i.dst.player === '$dead'
    )).toBe(false)
  })

  test('does not run experimental local-copy rewrite by default', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
        { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
        { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
        { kind: 'return_value', slot: mkSlot('$out') },
      ]),
    ])

    const result = lirOptimizeModule(mod)
    const instrs = result.functions[0].instructions

    expect(instrs).toEqual(mod.functions[0].instructions)
  })

  test('runs experimental local-copy rewrite before later LIR passes when explicitly enabled', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
        { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
        { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
        { kind: 'return_value', slot: mkSlot('$out') },
      ]),
    ])

    const result = lirOptimizeModule(mod, { experimentalLocalCopyRewrite: true })
    const instrs = result.functions[0].instructions

    expect(instrs).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])
  })

  test('runs experimental local-copy return collapse when explicitly enabled', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
        { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
        { kind: 'return_value', slot: mkSlot('$tmp') },
      ]),
    ])

    const result = lirOptimizeModule(mod, { experimentalLocalCopyRewrite: true })
    const instrs = result.functions[0].instructions

    expect(instrs).toEqual([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$ret'), src: mkSlot('$rhs') },
    ])
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

  test('pass manager exposes named pass results with tiny stats', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: mkSlot('$dead'), value: 0 },
        { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
        { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$__const_5') },
        { kind: 'score_set', dst: mkSlot('$x'), value: 10 },
        { kind: 'score_set', dst: mkSlot('$x'), value: 11 },
        { kind: 'return_value', slot: mkSlot('$x') },
      ]),
    ])

    const { passes } = runAndCollect(mod)

    expect(passes.map(pass => pass.name)).toEqual([
      'deadSlotElimModule',
      'execStorePeephole',
      'constImmFold',
      'deadSlotElimModule',
    ])

    for (const pass of passes) {
      expect(pass).toMatchObject({
        name: expect.any(String),
        changed: expect.any(Boolean),
        stats: {
          instructionsIn: expect.any(Number),
          instructionsOut: expect.any(Number),
          functionsVisited: 1,
          functionsChanged: expect.any(Number),
        },
      })
      expect(pass.stats.instructionsIn).toBeGreaterThanOrEqual(pass.stats.instructionsOut)
      expect(pass.stats.functionsVisited).toBe(1)
    }
  })

  test('pass output is stable after one additional run (idempotent)', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: mkSlot('$__const_7'), value: 7 },
        { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$__const_7') },
        { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$tmp') },
        { kind: 'score_set', dst: mkSlot('$x'), value: 3 },
        { kind: 'score_set', dst: mkSlot('$x'), value: 4 },
        { kind: 'return_value', slot: mkSlot('$x') },
      ]),
    ])

    const first = runLIRPassManager(mod).module
    const second = runLIRPassManager(first).module

    expect(second).toEqual(first)
  })

  test('second dead-slot cleanup removes materialization exposed by per-function passes', () => {
    const mod = mkModule([
      mkFn('main', [
        // First dead-slot pass cannot drop this const because it is read by a
        // nearby self-copy instruction.
        { kind: 'score_set', dst: mkSlot('$__const_2'), value: 2 },
        { kind: 'score_copy', dst: mkSlot('$__const_2'), src: mkSlot('$__const_2') },
        { kind: 'score_set', dst: mkSlot('$x'), value: 10 },
        { kind: 'score_set', dst: mkSlot('$x'), value: 11 },
        { kind: 'return_value', slot: mkSlot('$x') },
      ]),
    ])

    const result = runLIRPassManager(mod)

    expect(result.passes[0].changed).toBe(false)
    expect(result.passes[result.passes.length - 1].changed).toBe(true)

    const instrs = result.module.functions[0].instructions
    expect(instrs.some(i =>
      i.kind === 'score_set' && i.dst.player === '$__const_2'
    )).toBe(false)
    expect(instrs.some(i =>
      i.kind === 'score_copy' && i.dst.player === '$__const_2'
    )).toBe(false)
    expect(instrs).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 11 },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
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
      i.kind === 'score_delta' && i.dst.player === '$a' && i.value === 10
    )).toBe(true)

    // fn2: const folded
    const fn2 = result.functions[1]
    expect(fn2.instructions.some(i =>
      i.kind === 'score_delta' && i.dst.player === '$b' && i.value === -3
    )).toBe(true)
  })
})
