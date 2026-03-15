import { optimizeFunction, optimizeModule } from '../../optimizer/pipeline'
import type { MIRFunction, MIRBlock, MIRInstr, MIRModule, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[], entry = 'entry'): MIRFunction {
  return { name: 'test', params: [], blocks, entry, isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('optimization pipeline', () => {
  test('constant fold + branch simplify + DCE removes dead branch', () => {
    // cmp(lt, 1, 2) → 1 → branch(1, then, else) → jump(then) → else is dead
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'cmp', dst: 't0', op: 'lt', a: c(1), b: c(2) },
      ], { kind: 'branch', cond: t('t0'), then: 'then', else: 'else' }),
      mkBlock('then', [], { kind: 'return', value: c(1) }, ['entry']),
      mkBlock('else', [], { kind: 'return', value: c(0) }, ['entry']),
    ])

    const result = optimizeFunction(fn)

    // After optimization: entry should return 1 directly, else block removed
    // The cmp folds to const 1, branch simplifies to jump(then),
    // else block becomes unreachable and is removed,
    // then block merges into entry
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].term).toEqual({ kind: 'return', value: c(1) })
  })

  test('copy prop + const fold + DCE eliminates dead copy and folds', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'a', value: 5 },
        { kind: 'copy', dst: 'b', src: t('a') },
        { kind: 'add', dst: 'c', a: t('b'), b: c(1) },
      ], { kind: 'return', value: t('c') }),
    ])

    const result = optimizeFunction(fn)

    // const a=5 propagated into copy and add, add(5,1) folded to 6
    // all dead defs removed, returns const 6
    expect(result.blocks[0].term).toEqual({ kind: 'return', value: c(6) })
  })

  test('full pipeline: fold + simplify + merge + dce', () => {
    // if (3 > 2) { return 10 + 20; } else { return 0; }
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'cmp', dst: 't0', op: 'gt', a: c(3), b: c(2) },
      ], { kind: 'branch', cond: t('t0'), then: 'then', else: 'else' }),
      mkBlock('then', [
        { kind: 'add', dst: 't1', a: c(10), b: c(20) },
      ], { kind: 'return', value: t('t1') }, ['entry']),
      mkBlock('else', [], { kind: 'return', value: c(0) }, ['entry']),
    ])

    const result = optimizeFunction(fn)

    // Everything folds away: single block returning const 30
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].term).toEqual({ kind: 'return', value: c(30) })
  })

  test('optimizeModule applies to all functions', () => {
    const mod: MIRModule = {
      namespace: 'test',
      objective: '__test',
      functions: [
        mkFn([
          mkBlock('entry', [
            { kind: 'add', dst: 't0', a: c(1), b: c(2) },
          ], { kind: 'return', value: t('t0') }),
        ]),
        mkFn([
          mkBlock('entry', [
            { kind: 'mul', dst: 't0', a: c(3), b: c(4) },
          ], { kind: 'return', value: t('t0') }),
        ]),
      ],
    }

    const result = optimizeModule(mod)
    // Both functions should have their constants folded
    for (const fn of result.functions) {
      const instrs = fn.blocks[0].instrs
      const hasArith = instrs.some(i => i.kind === 'add' || i.kind === 'mul')
      expect(hasArith).toBe(false)
    }
  })

  test('fixpoint: multiple iterations needed', () => {
    // First iteration: fold add → const, fold cmp → const
    // Second iteration: branch simplify on newly-const cond
    // Third iteration: DCE removes dead block, merge
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: c(1), b: c(1) },
        { kind: 'cmp', dst: 't1', op: 'eq', a: t('t0'), b: c(2) },
      ], { kind: 'branch', cond: t('t1'), then: 'yes', else: 'no' }),
      mkBlock('yes', [], { kind: 'return', value: c(1) }, ['entry']),
      mkBlock('no', [], { kind: 'return', value: c(0) }, ['entry']),
    ])

    const result = optimizeFunction(fn)
    // 1+1=2, 2==2 → 1, branch(1) → jump(yes), dead block removed, merged
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].term).toEqual({ kind: 'return', value: c(1) })
  })
})
