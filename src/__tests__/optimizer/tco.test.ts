/**
 * Tests for Tail Call Optimization (TCO) — tco.ts
 *
 * 8 tests covering:
 *   1. Detects direct self-tail-call (factorial)
 *   2. Non-tail-call not flagged (result is used after the call)
 *   3. Non-self-call not flagged (calls different function)
 *   4. Tail-call with wrong arg count not flagged
 *   5. Generated MIR has zero recursive call instructions (factorial)
 *   6. Generated MIR has zero recursive call instructions (sum_acc)
 *   7. Fibonacci TCO — tail-recursive accumulator form detected and eliminated
 *   8. Macro functions are skipped entirely
 */

import { tailCallOptimize, findTailCallBlocks } from '../../optimizer/tco'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

function mkFn(
  name: string,
  params: string[],
  blocks: MIRBlock[],
  isMacro = false,
): MIRFunction {
  return {
    name,
    params: params.map(p => ({ name: p, isMacroParam: false })),
    blocks,
    entry: 'entry',
    isMacro,
  }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

/** Count call instructions targeting a given function name. */
function countCalls(fn: MIRFunction, target: string): number {
  return fn.blocks
    .flatMap(b => [...b.instrs, b.term])
    .filter(i => i.kind === 'call' && (i as Extract<MIRInstr, { kind: 'call' }>).fn === target)
    .length
}

// ---------------------------------------------------------------------------
// Sample MIR functions
// ---------------------------------------------------------------------------

/**
 * factorial(n, acc):
 *   entry: cmp n<=1 → branch base/recurse
 *   base: return acc
 *   recurse: t1=acc*n; t2=n-1; t3=factorial(t2,t1); return t3  ← tail call
 */
function factorialFn(): MIRFunction {
  return mkFn('test:factorial', ['n', 'acc'], [
    mkBlock('entry', [
      { kind: 'cmp', dst: 't0', op: 'le', a: t('n'), b: c(1) },
    ], { kind: 'branch', cond: t('t0'), then: 'base', else: 'recurse' }),

    mkBlock('base', [], { kind: 'return', value: t('acc') }),

    mkBlock('recurse', [
      { kind: 'mul', dst: 't1', a: t('acc'), b: t('n') },
      { kind: 'sub', dst: 't2', a: t('n'), b: c(1) },
      { kind: 'call', dst: 't3', fn: 'test:factorial', args: [t('t2'), t('t1')] },
    ], { kind: 'return', value: t('t3') }),
  ])
}

/**
 * Non-tail-call: result of recursive call is post-processed (+1) before return.
 */
function nonTailCallFn(): MIRFunction {
  return mkFn('test:sum', ['n', 'acc'], [
    mkBlock('entry', [
      { kind: 'cmp', dst: 't0', op: 'le', a: t('n'), b: c(0) },
    ], { kind: 'branch', cond: t('t0'), then: 'base', else: 'recurse' }),

    mkBlock('base', [], { kind: 'return', value: t('acc') }),

    mkBlock('recurse', [
      { kind: 'sub', dst: 't1', a: t('n'), b: c(1) },
      { kind: 'call', dst: 't2', fn: 'test:sum', args: [t('t1'), t('acc')] },
      { kind: 'add', dst: 't3', a: t('t2'), b: c(1) },  // post-process
    ], { kind: 'return', value: t('t3') }),
  ])
}

/**
 * Call to a different function — not a self-tail-call.
 */
function foreignCallFn(): MIRFunction {
  return mkFn('test:wrapper', ['x'], [
    mkBlock('entry', [
      { kind: 'call', dst: 't0', fn: 'test:helper', args: [t('x')] },
    ], { kind: 'return', value: t('t0') }),
  ])
}

/**
 * sum_acc(n, acc): accumulate sum from n to 0.
 */
function sumAccFn(): MIRFunction {
  return mkFn('test:sum_acc', ['n', 'acc'], [
    mkBlock('entry', [
      { kind: 'cmp', dst: 't0', op: 'le', a: t('n'), b: c(0) },
    ], { kind: 'branch', cond: t('t0'), then: 'base', else: 'recurse' }),

    mkBlock('base', [], { kind: 'return', value: t('acc') }),

    mkBlock('recurse', [
      { kind: 'add', dst: 't1', a: t('acc'), b: t('n') },
      { kind: 'sub', dst: 't2', a: t('n'), b: c(1) },
      { kind: 'call', dst: 't3', fn: 'test:sum_acc', args: [t('t2'), t('t1')] },
    ], { kind: 'return', value: t('t3') }),
  ])
}

/**
 * fib_acc(n, a, b): CPS fibonacci accumulator — tail-recursive.
 *   recurse: t1=a+b; t2=n-1; t3=fib_acc(t2, b, t1); return t3
 */
function fibAccFn(): MIRFunction {
  return mkFn('test:fib_acc', ['n', 'a', 'b'], [
    mkBlock('entry', [
      { kind: 'cmp', dst: 't0', op: 'le', a: t('n'), b: c(0) },
    ], { kind: 'branch', cond: t('t0'), then: 'base', else: 'recurse' }),

    mkBlock('base', [], { kind: 'return', value: t('a') }),

    mkBlock('recurse', [
      { kind: 'add', dst: 't1', a: t('a'), b: t('b') },
      { kind: 'sub', dst: 't2', a: t('n'), b: c(1) },
      { kind: 'call', dst: 't3', fn: 'test:fib_acc', args: [t('t2'), t('b'), t('t1')] },
    ], { kind: 'return', value: t('t3') }),
  ])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findTailCallBlocks', () => {
  // Test 1
  test('detects self-tail-call in factorial (recurse block)', () => {
    const fn = factorialFn()
    const tailBlocks = findTailCallBlocks(fn)
    expect(tailBlocks).toHaveLength(1)
    expect(tailBlocks[0].blockId).toBe('recurse')
  })

  // Test 2
  test('does not flag non-tail-call where result is post-processed', () => {
    const fn = nonTailCallFn()
    const tailBlocks = findTailCallBlocks(fn)
    expect(tailBlocks).toHaveLength(0)
  })

  // Test 3
  test('does not flag call to a different function', () => {
    const fn = foreignCallFn()
    const tailBlocks = findTailCallBlocks(fn)
    expect(tailBlocks).toHaveLength(0)
  })

  // Test 4
  test('does not flag self-call with mismatched argument count', () => {
    const fn = mkFn('test:bad', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:bad', args: [t('x'), c(1)] }, // 2 args, 1 param
      ], { kind: 'return', value: t('t0') }),
    ])
    const tailBlocks = findTailCallBlocks(fn)
    expect(tailBlocks).toHaveLength(0)
  })
})

describe('tailCallOptimize — factorial', () => {
  // Test 5
  test('eliminates all recursive call instructions from factorial', () => {
    const fn = factorialFn()
    const optimized = tailCallOptimize(fn)
    expect(countCalls(optimized, 'test:factorial')).toBe(0)
  })

  test('new entry is preamble block, not original entry', () => {
    const fn = factorialFn()
    const optimized = tailCallOptimize(fn)
    expect(optimized.entry).not.toBe('entry')
  })
})

describe('tailCallOptimize — sum accumulator', () => {
  // Test 6
  test('eliminates all recursive call instructions from sum_acc', () => {
    const fn = sumAccFn()
    const optimized = tailCallOptimize(fn)
    expect(countCalls(optimized, 'test:sum_acc')).toBe(0)
  })
})

describe('tailCallOptimize — fibonacci accumulator', () => {
  // Test 7
  test('detects tail call in fib_acc', () => {
    const fn = fibAccFn()
    const tailBlocks = findTailCallBlocks(fn)
    expect(tailBlocks).toHaveLength(1)
    expect(tailBlocks[0].blockId).toBe('recurse')
  })

  test('eliminates recursive call from fib_acc after TCO', () => {
    const fn = fibAccFn()
    const optimized = tailCallOptimize(fn)
    expect(countCalls(optimized, 'test:fib_acc')).toBe(0)
  })
})

describe('tailCallOptimize — macro skip', () => {
  // Test 8
  test('returns macro function unchanged (same reference)', () => {
    const fn = mkFn('test:macro_fn', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:macro_fn', args: [t('x')] },
      ], { kind: 'return', value: t('t0') }),
    ], /* isMacro= */ true)

    const result = tailCallOptimize(fn)
    expect(result).toBe(fn) // exact same reference — not touched
  })
})
