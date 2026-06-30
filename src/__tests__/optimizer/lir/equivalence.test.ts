import { constImmFold } from '../../../optimizer/lir/const_imm'
import { deadSlotElim, deadSlotElimModule } from '../../../optimizer/lir/dead_slot'
import { lirOptimizeModule } from '../../../optimizer/lir/pipeline'
import { execStorePeephole } from '../../../optimizer/lir/peephole'
import { scoreboardRmwPassModule } from '../../../optimizer/lir/rmw'
import { SCORE_INT_MAX, SCORE_INT_MIN, type LIRFunction, type LIRInstr, type LIRModule, type Slot } from '../../../lir/types'
import { makeScoreboardState, projectState, runLIRFunction, type ScoreboardState } from '../../../optimizer/lir/testing/interpreter'

const obj = '__eq'

function slot(player: string): Slot {
  return { player, obj }
}

function constSlot(value: number, suffix = ''): Slot {
  return slot(`$__const_${value}${suffix}`)
}

function mkFn(name: string, instructions: LIRInstr[]): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function mkModule(functions: LIRFunction[]): LIRModule {
  return { namespace: 'eq', objective: obj, functions }
}

function expectFunctionEquivalent(
  before: LIRFunction,
  after: LIRFunction,
  observed: readonly Slot[],
  initial: ScoreboardState = makeScoreboardState(),
): void {
  const beforeState = runLIRFunction(before, initial)
  const afterState = runLIRFunction(after, initial)
  expect(projectState(afterState, observed)).toEqual(projectState(beforeState, observed))
}

function expectModuleEquivalent(
  before: LIRModule,
  after: LIRModule,
  observed: readonly Slot[],
  initial: ScoreboardState = makeScoreboardState(),
): void {
  expectFunctionEquivalent(before.functions[0], after.functions[0], observed, initial)
}

describe('LIR optimizer semantic equivalence', () => {
  test.each([
    { value: -17, op: 'score_add' as const },
    { value: -1, op: 'score_add' as const },
    { value: 0, op: 'score_add' as const },
    { value: 1, op: 'score_sub' as const },
    { value: 19, op: 'score_sub' as const },
    { value: SCORE_INT_MAX, op: 'score_add' as const },
  ])('constImmFold preserves observable state for $op with $value', ({ value, op }) => {
    const c = constSlot(value)
    const before = mkFn('const_imm', [
      { kind: 'score_set', dst: slot('$x'), value: -3 },
      { kind: 'score_set', dst: c, value },
      { kind: op, dst: slot('$x'), src: c },
      { kind: 'return_value', slot: slot('$x') },
    ])
    const after = constImmFold(before)

    expectFunctionEquivalent(before, after, [slot('$x'), slot('$ret')])
  })

  test('constImmFold preserves copy, multiply-by-zero, modulo-by-one, and min/max folds', () => {
    const before = mkFn('const_patterns', [
      { kind: 'score_set', dst: constSlot(42), value: 42 },
      { kind: 'score_copy', dst: slot('$copied'), src: constSlot(42) },
      { kind: 'score_set', dst: slot('$mul'), value: SCORE_INT_MIN },
      { kind: 'score_set', dst: constSlot(0), value: 0 },
      { kind: 'score_mul', dst: slot('$mul'), src: constSlot(0) },
      { kind: 'score_set', dst: slot('$mod'), value: SCORE_INT_MAX },
      { kind: 'score_set', dst: constSlot(1), value: 1 },
      { kind: 'score_mod', dst: slot('$mod'), src: constSlot(1) },
      { kind: 'score_set', dst: slot('$minmax'), value: 7 },
      { kind: 'score_set', dst: constSlot(-1), value: -1 },
      { kind: 'score_min', dst: slot('$minmax'), src: constSlot(-1) },
      { kind: 'score_max', dst: slot('$minmax'), src: slot('$copied') },
      { kind: 'return_value', slot: slot('$minmax') },
    ])
    const after = constImmFold(before)

    expectFunctionEquivalent(before, after, [
      slot('$copied'),
      slot('$mul'),
      slot('$mod'),
      slot('$minmax'),
      slot('$ret'),
    ])
  })

  test('deadSlotElim preserves observable slots when removed writes are truly unobservable', () => {
    const before = mkFn('dead_slot', [
      { kind: 'score_set', dst: slot('$dead'), value: 99 },
      { kind: 'score_set', dst: slot('$live'), value: 4 },
      { kind: 'score_set', dst: slot('$also_dead'), value: SCORE_INT_MAX },
      { kind: 'return_value', slot: slot('$live') },
    ])
    const after = deadSlotElim(before)

    expect(after.instructions.some(instr => instr.kind === 'score_set' && instr.dst.player === '$dead')).toBe(false)
    expect(after.instructions.some(instr => instr.kind === 'score_set' && instr.dst.player === '$also_dead')).toBe(false)
    expectFunctionEquivalent(before, after, [slot('$live'), slot('$ret')])
  })

  test('deadSlotElim preserves ABI slots while removing only unobservable materialization', () => {
    const before = mkFn('dead_slot_abi', [
      { kind: 'score_set', dst: slot('$ret_saved'), value: -5 },
      { kind: 'score_set', dst: slot('$p12'), value: 12 },
      { kind: 'score_set', dst: slot('$dead'), value: 99 },
      { kind: 'score_copy', dst: slot('$out'), src: slot('$p12') },
      { kind: 'return_value', slot: slot('$out') },
    ])
    const after = deadSlotElim(before)

    expect(after.instructions.some(instr => instr.kind === 'score_set' && instr.dst.player === '$dead')).toBe(false)
    expectFunctionEquivalent(before, after, [slot('$ret_saved'), slot('$p12'), slot('$ret')])
  })

  test('deadSlotElim overwritten-temp cleanup observes only visible result slots', () => {
    const before = mkFn('dead_slot_overwrite', [
      { kind: 'score_set', dst: slot('$t0'), value: SCORE_INT_MIN },
      { kind: 'score_set', dst: slot('$t0'), value: SCORE_INT_MAX },
      { kind: 'score_copy', dst: slot('$out'), src: slot('$t0') },
      { kind: 'return_value', slot: slot('$out') },
    ])
    const after = deadSlotElim(before)

    expect(after.instructions).toHaveLength(3)
    expectFunctionEquivalent(before, after, [slot('$out'), slot('$ret')])
  })

  test('deadSlotElimModule preserves observable state across supported functions', () => {
    const before = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: slot('$dead'), value: 12 },
        { kind: 'score_set', dst: slot('$x'), value: 6 },
        { kind: 'score_set', dst: slot('$y'), value: -2 },
        { kind: 'score_add', dst: slot('$x'), src: slot('$y') },
        { kind: 'return_value', slot: slot('$x') },
      ]),
    ])
    const after = deadSlotElimModule(before)

    expectModuleEquivalent(before, after, [slot('$x'), slot('$y'), slot('$ret')])
  })

  test.each([SCORE_INT_MIN, -1, 0, 1, SCORE_INT_MAX])('execStorePeephole preserves typed score_delta zero no-op with initial value %p', value => {
    const before = mkFn('delta_zero', [
      { kind: 'score_set', dst: slot('$x'), value },
      { kind: 'score_delta', dst: slot('$x'), value: 0 },
      { kind: 'return_value', slot: slot('$x') },
    ])
    const after = execStorePeephole(before)

    expect(after.instructions).toEqual([
      { kind: 'score_set', dst: slot('$x'), value },
      { kind: 'return_value', slot: slot('$x') },
    ])
    expectFunctionEquivalent(before, after, [slot('$x'), slot('$ret')])
  })

  test('scoreboardRmwPassModule preserves local-copy/RMW behavior when explicitly run', () => {
    const before = mkModule([
      mkFn('main', [
        { kind: 'score_copy', dst: slot('$main_t0'), src: slot('$src') },
        { kind: 'score_add', dst: slot('$main_t0'), src: slot('$rhs') },
        { kind: 'score_mul', dst: slot('$main_t0'), src: slot('$scale') },
        { kind: 'score_copy', dst: slot('$out'), src: slot('$main_t0') },
        { kind: 'return_value', slot: slot('$out') },
      ]),
    ])
    const after = scoreboardRmwPassModule(before)
    const initial = makeScoreboardState([
      { slot: slot('$src'), value: -11 },
      { slot: slot('$rhs'), value: 7 },
      { slot: slot('$scale'), value: -3 },
    ])

    expectModuleEquivalent(before, after, [slot('$src'), slot('$rhs'), slot('$scale'), slot('$out'), slot('$ret')], initial)
  })

  test('pass manager is idempotent by default and equivalent with experimental local-copy enabled', () => {
    const before = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: slot('$dead'), value: 1 },
        { kind: 'score_set', dst: slot('$x'), value: 10 },
        { kind: 'score_set', dst: constSlot(5), value: 5 },
        { kind: 'score_add', dst: slot('$x'), src: constSlot(5) },
        { kind: 'score_copy', dst: slot('$main_t0'), src: slot('$x') },
        { kind: 'score_sub', dst: slot('$main_t0'), src: slot('$rhs') },
        { kind: 'score_copy', dst: slot('$out'), src: slot('$main_t0') },
        { kind: 'return_value', slot: slot('$out') },
      ]),
    ])
    const initial = makeScoreboardState([{ slot: slot('$rhs'), value: -4 }])
    const optimizedDefault = lirOptimizeModule(before)
    const optimizedDefaultAgain = lirOptimizeModule(optimizedDefault)
    const optimizedExperimental = lirOptimizeModule(before, { experimentalLocalCopyRewrite: true })
    const optimizedExperimentalAgain = lirOptimizeModule(optimizedExperimental, { experimentalLocalCopyRewrite: true })

    expect(optimizedDefaultAgain).toEqual(optimizedDefault)
    expectModuleEquivalent(before, optimizedDefault, [slot('$x'), slot('$rhs'), slot('$out'), slot('$ret')], initial)
    expectModuleEquivalent(before, optimizedExperimental, [slot('$x'), slot('$rhs'), slot('$out'), slot('$ret')], initial)
    // A second experimental pass can rematerialize the final return directly into $ret.
    expectModuleEquivalent(before, optimizedExperimentalAgain, [slot('$x'), slot('$rhs'), slot('$ret')], initial)
  })

  test('fixed generated scoreboard fixtures remain equivalent through the pass manager', () => {
    for (const fixture of generatedFixtures()) {
      const before = mkModule([fixture])
      const optimized = lirOptimizeModule(before, { experimentalLocalCopyRewrite: true })
      expectModuleEquivalent(before, optimized, [slot('$x'), slot('$y'), slot('$out'), slot('$ret')])
    }
  })
})

type RmwKind = 'score_add' | 'score_sub' | 'score_mul' | 'score_div' | 'score_mod' | 'score_min' | 'score_max'

function generatedFixtures(): LIRFunction[] {
  const values = [SCORE_INT_MIN, -97, -11, -1, 0, 1, 2, 13, 89, SCORE_INT_MAX]
  const ops: RmwKind[] = ['score_add', 'score_sub', 'score_mul', 'score_div', 'score_mod', 'score_min', 'score_max']
  let seed = 0x5eed1234
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed
  }
  const pick = <T>(items: readonly T[]): T => items[next() % items.length]
  const nonZero = (value: number): number => value === 0 ? 1 : value

  const fixtures: LIRFunction[] = []
  for (let index = 0; index < 32; index += 1) {
    const opA = pick(ops)
    const opB = pick(ops)
    const xValue = pick(values)
    const yValue = (opB === 'score_div' || opB === 'score_mod') ? nonZero(pick(values)) : pick(values)
    const constValue = (opA === 'score_div' || opA === 'score_mod') ? nonZero(pick(values)) : pick(values)
    const c = constSlot(constValue, `_${index}`)
    fixtures.push(mkFn(`generated_${index}`, [
      { kind: 'score_set', dst: slot('$x'), value: xValue },
      { kind: 'score_set', dst: slot('$y'), value: yValue },
      { kind: 'score_set', dst: c, value: constValue },
      { kind: opA, dst: slot('$x'), src: c },
      { kind: 'score_copy', dst: slot('$generated_t0'), src: slot('$x') },
      { kind: opB, dst: slot('$generated_t0'), src: slot('$y') },
      { kind: 'score_copy', dst: slot('$out'), src: slot('$generated_t0') },
      { kind: 'return_value', slot: slot('$out') },
    ]))
  }
  return fixtures
}
