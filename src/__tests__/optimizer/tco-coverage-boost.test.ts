/**
 * tco-coverage-boost.test.ts
 * Covers the remaining uncovered branch in tco.ts:
 *   - `case 'return'` where value is null (line 233, null path)
 */
import { tailCallOptimize } from '../../optimizer/tco'
import type { MIRBlock, MIRFunction, MIRInstr, Operand } from '../../mir/types'

const c = (value: number): Operand => ({ kind: 'const', value })
const t = (name: string): Operand => ({ kind: 'temp', name })

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

function mkFn(name: string, params: string[], blocks: MIRBlock[]): MIRFunction {
  return {
    name,
    params: params.map(param => ({ name: param, isMacroParam: false })),
    blocks,
    entry: 'entry',
    isMacro: false,
  }
}

function getBlock(fn: MIRFunction, id: string): MIRBlock {
  const block = fn.blocks.find(b => b.id === id)
  expect(block).toBeDefined()
  return block!
}

describe('tco-coverage-boost', () => {
  /**
   * Cover the `return` with value=null path in substituteInstr.
   *
   * Build a function that has a self-tail-call (so TCO fires) AND a base-case
   * block whose terminator is `{ kind: 'return', value: null }`.  When the
   * non-tail-call block is rewritten, substituteInstr hits the `case 'return'`
   * branch with a null value, exercising the previously-uncovered null path.
   */
  test('handles return null in a non-tail block during TCO rewrite', () => {
    const fn = mkFn('test:void_loop', ['n'], [
      // entry: if n <= 0, go to base (returns void), else recurse
      mkBlock('entry', [
        { kind: 'cmp', dst: 'done', op: 'le', a: t('n'), b: c(0) },
      ], { kind: 'branch', cond: t('done'), then: 'base', else: 'recur' }),

      // base: return void (value: null) — this hits the null branch
      mkBlock('base', [], { kind: 'return', value: null }),

      // recur: tail call — this is what triggers TCO
      mkBlock('recur', [
        { kind: 'sub', dst: 'n1', a: t('n'), b: c(1) },
        { kind: 'call', dst: 'res', fn: 'test:void_loop', args: [t('n1')] },
      ], { kind: 'return', value: t('res') }),
    ])

    const optimized = tailCallOptimize(fn)

    // TCO must have fired (new entry block created)
    expect(optimized.entry).toBe('__tco_entry')

    // The base block must still have a return with null value after rewrite
    const base = getBlock(optimized, 'base')
    expect(base.term).toEqual({ kind: 'return', value: null })

    // The recur block must now be a loop-back jump
    const recur = getBlock(optimized, 'recur')
    expect(recur.term).toEqual({ kind: 'jump', target: 'entry' })

    // Parameters in entry are substituted with loop param __lp0
    const entry = getBlock(optimized, 'entry')
    expect((entry.instrs[0] as Extract<MIRInstr, { kind: 'cmp' }>).a).toEqual(
      t('__lp0'),
    )
  })
})
