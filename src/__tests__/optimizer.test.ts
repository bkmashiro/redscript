import { constantFolding, copyPropagation, deadCodeElimination, optimize } from '../optimizer/passes'
import type { IRFunction } from '../ir/types'

function makeFn(instrs: any[], term: any = { op: 'return' }): IRFunction {
  return {
    name: 'test',
    params: [],
    locals: [],
    blocks: [{ label: 'entry', instrs, term }],
  }
}

describe('constantFolding', () => {
  it('folds 2 + 3 → 5', () => {
    const fn = makeFn([
      { op: 'binop', dst: '$x', lhs: { kind: 'const', value: 2 }, bop: '+', rhs: { kind: 'const', value: 3 } },
    ])
    const opt = constantFolding(fn)
    expect(opt.blocks[0].instrs[0]).toEqual({
      op: 'assign', dst: '$x', src: { kind: 'const', value: 5 },
    })
  })

  it('folds 10 / 3 → 3 (truncated int division)', () => {
    const fn = makeFn([
      { op: 'binop', dst: '$x', lhs: { kind: 'const', value: 10 }, bop: '/', rhs: { kind: 'const', value: 3 } },
    ])
    const opt = constantFolding(fn)
    expect((opt.blocks[0].instrs[0] as any).src.value).toBe(3)
  })

  it('folds cmp 5 == 5 → 1', () => {
    const fn = makeFn([
      { op: 'cmp', dst: '$r', lhs: { kind: 'const', value: 5 }, cop: '==', rhs: { kind: 'const', value: 5 } },
    ])
    const opt = constantFolding(fn)
    expect((opt.blocks[0].instrs[0] as any).src.value).toBe(1)
  })

  it('folds cmp 5 > 10 → 0', () => {
    const fn = makeFn([
      { op: 'cmp', dst: '$r', lhs: { kind: 'const', value: 5 }, cop: '>', rhs: { kind: 'const', value: 10 } },
    ])
    const opt = constantFolding(fn)
    expect((opt.blocks[0].instrs[0] as any).src.value).toBe(0)
  })

  it('does not fold division by zero', () => {
    const fn = makeFn([
      { op: 'binop', dst: '$x', lhs: { kind: 'const', value: 5 }, bop: '/', rhs: { kind: 'const', value: 0 } },
    ])
    const opt = constantFolding(fn)
    expect(opt.blocks[0].instrs[0].op).toBe('binop')
  })
})

describe('copyPropagation', () => {
  it('propagates simple copy', () => {
    const fn = makeFn([
      { op: 'assign', dst: '$t0', src: { kind: 'var', name: '$x' } },
      { op: 'binop', dst: '$y', lhs: { kind: 'var', name: '$t0' }, bop: '+', rhs: { kind: 'const', value: 1 } },
    ])
    const opt = copyPropagation(fn)
    const binop = opt.blocks[0].instrs[1] as any
    expect(binop.lhs).toEqual({ kind: 'var', name: '$x' })
  })

  it('propagates constant copies', () => {
    const fn = makeFn([
      { op: 'assign', dst: '$t0', src: { kind: 'const', value: 42 } },
      { op: 'assign', dst: '$y', src: { kind: 'var', name: '$t0' } },
    ])
    const opt = copyPropagation(fn)
    const second = opt.blocks[0].instrs[1] as any
    expect(second.src).toEqual({ kind: 'const', value: 42 })
  })
})

describe('deadCodeElimination', () => {
  it('removes unused assignment', () => {
    const fn = makeFn([
      { op: 'assign', dst: '$t0', src: { kind: 'const', value: 99 } },  // unused temp
      { op: 'assign', dst: '$t1', src: { kind: 'const', value: 1 } },   // used temp
    ], { op: 'return', value: { kind: 'var', name: '$t1' } })
    const opt = deadCodeElimination(fn)
    expect(opt.blocks[0].instrs).toHaveLength(1)
    expect((opt.blocks[0].instrs[0] as any).dst).toBe('$t1')
  })

  it('keeps call even if return value unused (side effects)', () => {
    const fn = makeFn([
      { op: 'call', fn: 'foo', args: [], dst: '$unused' },
    ])
    const opt = deadCodeElimination(fn)
    expect(opt.blocks[0].instrs).toHaveLength(1)
  })

  it('keeps assignments referenced by raw commands', () => {
    const fn = makeFn([
      { op: 'assign', dst: '$used_by_raw', src: { kind: 'const', value: 7 } },
      { op: 'raw', cmd: 'execute store result score player obj run scoreboard players get $used_by_raw rs' },
    ])
    const opt = deadCodeElimination(fn)
    expect(opt.blocks[0].instrs).toHaveLength(2)
    expect((opt.blocks[0].instrs[0] as any).dst).toBe('$used_by_raw')
  })
})

describe('copyPropagation – stale alias invalidation', () => {
  it('does not propagate $tmp = $y after $y is overwritten (swap pattern)', () => {
    // Simulates: let tmp = y; y = x % y; x = tmp
    // The copy $tmp = $y must be invalidated when $y is reassigned.
    // Before fix: x = tmp was propagated to x = y (new y, wrong value).
    const fn = makeFn([
      { op: 'assign',  dst: '$tmp', src: { kind: 'var', name: '$y' } },          // tmp = y
      { op: 'binop',   dst: '$r',   lhs: { kind: 'var', name: '$x' }, bop: '%', rhs: { kind: 'var', name: '$y' } }, // r = x%y
      { op: 'assign',  dst: '$y',   src: { kind: 'var', name: '$r' } },           // y = r  ← stale: tmp still points to OLD y
      { op: 'assign',  dst: '$x',   src: { kind: 'var', name: '$tmp' } },         // x = tmp (should NOT be x = y)
    ])
    const opt = copyPropagation(fn)
    const instrs = opt.blocks[0].instrs
    const xAssign = instrs.find((i: any) => i.dst === '$x') as any
    // x = tmp must NOT be optimised to x = $y (stale) or x = $r (new y).
    // It should stay as x = $tmp (the original copy).
    expect(xAssign.src).toEqual({ kind: 'var', name: '$tmp' })
  })

  it('still propagates simple non-conflicting copies', () => {
    // a = 5; b = a; c = b → after propagation b and c should both be const 5
    const fn = makeFn([
      { op: 'assign', dst: '$a', src: { kind: 'const', value: 5 } },
      { op: 'assign', dst: '$b', src: { kind: 'var', name: '$a' } },
      { op: 'assign', dst: '$c', src: { kind: 'var', name: '$b' } },
    ])
    const opt = copyPropagation(fn)
    const instrs = opt.blocks[0].instrs
    const cAssign = instrs.find((i: any) => i.dst === '$c') as any
    expect(cAssign.src).toEqual({ kind: 'const', value: 5 })
  })
})

describe('optimize pipeline', () => {
  it('combines all passes', () => {
    // t0 = 2 + 3  (→ constant fold → t0 = 5)
    // x = t0      (→ copy prop → x = 5)
    // unused = 0  (→ DCE → removed)
    // return x
    const fn = makeFn([
      { op: 'binop', dst: '$t0', lhs: { kind: 'const', value: 2 }, bop: '+', rhs: { kind: 'const', value: 3 } },
      { op: 'assign', dst: '$x', src: { kind: 'var', name: '$t0' } },
      { op: 'assign', dst: '$t1', src: { kind: 'const', value: 0 } },  // unused temp, should be removed
    ], { op: 'return', value: { kind: 'var', name: '$x' } })

    const opt = optimize(fn)
    const instrs = opt.blocks[0].instrs
    // $t1 (unused temp) should be gone
    expect(instrs.some((i: any) => i.dst === '$t1')).toBe(false)
    // $x should be const 5 (after folding + propagation)
    const xInstr = instrs.find((i: any) => i.dst === '$x') as any
    expect(xInstr?.src).toEqual({ kind: 'const', value: 5 })
  })
})
