import { licm } from '../../optimizer/licm'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[], entry = 'entry'): MIRFunction {
  return { name: 'test', params: [], blocks, entry, isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

// ---------------------------------------------------------------------------
// Helper: find a block by id in result
// ---------------------------------------------------------------------------
function getBlock(fn: MIRFunction, id: string): MIRBlock {
  const b = fn.blocks.find(b => b.id === id)
  if (!b) throw new Error(`block ${id} not found`)
  return b
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loop-invariant code motion (LICM)', () => {

  // Test 1: constant computation inside loop body is hoisted
  test('hoists pure constant computation from loop body', () => {
    // Loop structure:
    //   entry  → loop_header
    //   loop_header: branch cond → loop_body / loop_exit
    //   loop_body: t_inv = 3 * 4  (invariant — both operands are constants)
    //              i = i + 1
    //              jump → loop_latch
    //   loop_latch: jump → loop_header
    //   loop_exit: return t_inv
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'i', value: 0 },
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      mkBlock('loop_body', [
        { kind: 'mul', dst: 't_inv', a: c(3), b: c(4) },   // invariant
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },      // variant (modifies i)
      ], { kind: 'jump', target: 'loop_latch' }, ['loop_header']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: t('t_inv') }, ['loop_header']),
    ])

    const result = licm(fn)

    // A preheader must exist
    const preheader = result.blocks.find(b => b.id === 'loop_preheader')
    expect(preheader).toBeDefined()

    // The hoisted mul must be in the preheader
    const mulInPreheader = preheader!.instrs.some(
      i => i.kind === 'mul' && i.dst === 't_inv',
    )
    expect(mulInPreheader).toBe(true)

    // The loop_body must no longer contain the mul
    const body = getBlock(result, 'loop_body')
    const mulInBody = body.instrs.some(i => i.kind === 'mul' && i.dst === 't_inv')
    expect(mulInBody).toBe(false)
  })

  // Test 2: instruction using only loop-external temps is hoisted
  test('hoists instruction whose operands are defined outside the loop', () => {
    // x and y are defined before the loop, so `add t_xy x y` is invariant
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'x', value: 5 },
        { kind: 'const', dst: 'y', value: 7 },
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      mkBlock('loop_body', [
        { kind: 'add', dst: 't_xy', a: t('x'), b: t('y') },   // invariant
        { kind: 'add', dst: 'z', a: t('z'), b: c(1) },         // variant
      ], { kind: 'jump', target: 'loop_latch' }, ['loop_header']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: t('t_xy') }, ['loop_header']),
    ])

    const result = licm(fn)

    const preheader = result.blocks.find(b => b.id === 'loop_preheader')
    expect(preheader).toBeDefined()
    expect(preheader!.instrs.some(i => i.kind === 'add' && i.dst === 't_xy')).toBe(true)

    const body = getBlock(result, 'loop_body')
    expect(body.instrs.some(i => i.kind === 'add' && i.dst === 't_xy')).toBe(false)
  })

  // Test 3: variant instruction (uses a loop-modified temp) is NOT hoisted
  test('does not hoist instruction that uses a loop-variant temp', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'i', value: 0 },
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      mkBlock('loop_body', [
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },         // defines i (variant)
        { kind: 'mul', dst: 't_v', a: t('i'), b: c(2) },        // uses i — NOT invariant
      ], { kind: 'jump', target: 'loop_latch' }, ['loop_header']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: t('t_v') }, ['loop_header']),
    ])

    const result = licm(fn)

    // No preheader should be inserted (nothing to hoist)
    const preheader = result.blocks.find(b => b.id === 'loop_preheader')
    expect(preheader).toBeUndefined()

    // Original structure preserved
    const body = getBlock(result, 'loop_body')
    expect(body.instrs).toHaveLength(2)
  })

  // Test 4: side-effectful instruction is NOT hoisted
  test('does not hoist side-effectful instructions', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      mkBlock('loop_body', [
        // call has side effects — must stay in the loop
        { kind: 'call', dst: 't_r', fn: 'some_fn', args: [c(1)] },
      ], { kind: 'jump', target: 'loop_latch' }, ['loop_header']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: null }, ['loop_header']),
    ])

    const result = licm(fn)

    const preheader = result.blocks.find(b => b.id === 'loop_preheader')
    expect(preheader).toBeUndefined()

    const body = getBlock(result, 'loop_body')
    expect(body.instrs).toHaveLength(1)
  })

  // Test 5: score_write inside loop is NOT hoisted
  test('does not hoist score_write (side-effectful)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      mkBlock('loop_body', [
        { kind: 'score_write', player: '@s', obj: 'score', src: c(42) },
      ], { kind: 'jump', target: 'loop_latch' }, ['loop_header']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: null }, ['loop_header']),
    ])

    const result = licm(fn)

    const preheader = result.blocks.find(b => b.id === 'loop_preheader')
    expect(preheader).toBeUndefined()
  })

  // Test 6: multiple invariant instructions are all hoisted
  test('hoists multiple independent invariant instructions', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'a', value: 10 },
        { kind: 'const', dst: 'b', value: 20 },
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      mkBlock('loop_body', [
        { kind: 'add', dst: 't1', a: t('a'), b: t('b') },   // invariant
        { kind: 'mul', dst: 't2', a: t('a'), b: c(3) },      // invariant
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },       // variant
      ], { kind: 'jump', target: 'loop_latch' }, ['loop_header']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: t('t1') }, ['loop_header']),
    ])

    const result = licm(fn)

    const preheader = result.blocks.find(b => b.id === 'loop_preheader')
    expect(preheader).toBeDefined()
    expect(preheader!.instrs).toHaveLength(2)
    expect(preheader!.instrs.some(i => i.kind === 'add' && i.dst === 't1')).toBe(true)
    expect(preheader!.instrs.some(i => i.kind === 'mul' && i.dst === 't2')).toBe(true)

    const body = getBlock(result, 'loop_body')
    expect(body.instrs).toHaveLength(1)  // only the variant add remains
  })

  // Test 7: chained invariants (t2 depends on t1; both should be hoisted)
  test('hoists chained invariant instructions (iterative)', () => {
    // t1 = a + b  (invariant)
    // t2 = t1 * c  (invariant once t1 is hoisted)
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'a', value: 2 },
        { kind: 'const', dst: 'b', value: 3 },
        { kind: 'const', dst: 'cv', value: 4 },
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      mkBlock('loop_body', [
        { kind: 'add', dst: 't1', a: t('a'), b: t('b') },    // invariant
        { kind: 'mul', dst: 't2', a: t('t1'), b: t('cv') },  // invariant after t1 hoisted
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },       // variant
      ], { kind: 'jump', target: 'loop_latch' }, ['loop_header']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: t('t2') }, ['loop_header']),
    ])

    const result = licm(fn)

    const preheader = result.blocks.find(b => b.id === 'loop_preheader')
    expect(preheader).toBeDefined()
    // Both t1 and t2 computations hoisted
    expect(preheader!.instrs.some(i => i.kind === 'add' && i.dst === 't1')).toBe(true)
    expect(preheader!.instrs.some(i => i.kind === 'mul' && i.dst === 't2')).toBe(true)

    const body = getBlock(result, 'loop_body')
    expect(body.instrs).toHaveLength(1)  // only variant i increment remains
  })

  // Test 8: nested loops — inner invariant hoisted to inner preheader,
  //         outer invariant hoisted to outer preheader
  test('correctly handles nested loops', () => {
    // Outer loop: loop_header / loop_body_outer / loop_latch
    // Inner loop inside loop_body_outer: loop_header_inner / loop_body_inner / loop_latch_inner
    //
    // t_outer = a + b  — invariant in both loops
    // t_inner = t_outer * c — invariant in inner loop (t_outer defined outside inner loop)
    // j = j + 1 — variant in inner loop
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'a', value: 1 },
        { kind: 'const', dst: 'b', value: 2 },
        { kind: 'const', dst: 'cv', value: 5 },
        { kind: 'const', dst: 'cond', value: 1 },
      ], { kind: 'jump', target: 'loop_header' }),

      // Outer header
      mkBlock('loop_header', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'loop_exit' },
        ['entry', 'loop_latch']),

      // Outer body: contains the inner loop header
      mkBlock('loop_body', [],
        { kind: 'jump', target: 'loop_header_inner' }, ['loop_header']),

      // Inner header
      mkBlock('loop_header_inner', [],
        { kind: 'branch', cond: t('cond'), then: 'loop_body_inner', else: 'loop_body_inner_exit' },
        ['loop_body', 'loop_latch_inner']),

      // Inner body
      mkBlock('loop_body_inner', [
        { kind: 'add', dst: 't_outer', a: t('a'), b: t('b') },   // invariant in inner loop (a,b external)
        { kind: 'add', dst: 'j', a: t('j'), b: c(1) },            // variant
      ], { kind: 'jump', target: 'loop_latch_inner' }, ['loop_header_inner']),

      mkBlock('loop_latch_inner', [],
        { kind: 'jump', target: 'loop_header_inner' }, ['loop_body_inner']),

      mkBlock('loop_body_inner_exit', [],
        { kind: 'jump', target: 'loop_latch' }, ['loop_header_inner']),

      mkBlock('loop_latch', [],
        { kind: 'jump', target: 'loop_header' }, ['loop_body_inner_exit']),

      mkBlock('loop_exit', [],
        { kind: 'return', value: t('t_outer') }, ['loop_header']),
    ])

    const result = licm(fn)

    // At least one preheader should be inserted for the inner loop
    const preheaders = result.blocks.filter(b => b.id.includes('preheader'))
    expect(preheaders.length).toBeGreaterThanOrEqual(1)

    // t_outer should have been hoisted (no longer in loop_body_inner)
    const innerBody = result.blocks.find(b => b.id === 'loop_body_inner')
    expect(innerBody).toBeDefined()
    expect(innerBody!.instrs.some(i => i.kind === 'add' && i.dst === 't_outer')).toBe(false)

    // The hoisted instruction should appear in some preheader
    const hoistedInPreheader = preheaders.some(ph =>
      ph.instrs.some(i => i.kind === 'add' && i.dst === 't_outer'),
    )
    expect(hoistedInPreheader).toBe(true)
  })

})
