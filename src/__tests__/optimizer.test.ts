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
      { op: 'assign', dst: '$unused', src: { kind: 'const', value: 99 } },
      { op: 'assign', dst: '$used', src: { kind: 'const', value: 1 } },
    ], { op: 'return', value: { kind: 'var', name: '$used' } })
    const opt = deadCodeElimination(fn)
    expect(opt.blocks[0].instrs).toHaveLength(1)
    expect((opt.blocks[0].instrs[0] as any).dst).toBe('$used')
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

describe('optimize pipeline', () => {
  it('combines all passes', () => {
    // t0 = 2 + 3  (→ constant fold → t0 = 5)
    // x = t0      (→ copy prop → x = 5)
    // unused = 0  (→ DCE → removed)
    // return x
    const fn = makeFn([
      { op: 'binop', dst: '$t0', lhs: { kind: 'const', value: 2 }, bop: '+', rhs: { kind: 'const', value: 3 } },
      { op: 'assign', dst: '$x', src: { kind: 'var', name: '$t0' } },
      { op: 'assign', dst: '$unused', src: { kind: 'const', value: 0 } },
    ], { op: 'return', value: { kind: 'var', name: '$x' } })

    const opt = optimize(fn)
    const instrs = opt.blocks[0].instrs
    // $unused should be gone
    expect(instrs.some((i: any) => i.dst === '$unused')).toBe(false)
    // $x should be const 5 (after folding + propagation)
    const xInstr = instrs.find((i: any) => i.dst === '$x') as any
    expect(xInstr?.src).toEqual({ kind: 'const', value: 5 })
  })
})
