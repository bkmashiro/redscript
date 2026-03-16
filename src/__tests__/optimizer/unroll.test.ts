/**
 * Tests for the small constant loop unrolling pass.
 *
 * We test through the full compiler pipeline (source → MIR → optimize)
 * to verify realistic unroll behavior, and also test the pass directly
 * with synthetic MIR for edge cases.
 */
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { optimizeFunction } from '../../optimizer/pipeline'
import { loopUnroll } from '../../optimizer/unroll'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function compileToMIR(source: string): MIRFunction[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  const mir = lowerToMIR(hir)
  return mir.functions
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

// ---------------------------------------------------------------------------
// Synthetic MIR tests
// ---------------------------------------------------------------------------

describe('loopUnroll — synthetic MIR', () => {
  /**
   * Build a minimal for(i=0; i<N; i++) loop in MIR form:
   *   entry: const i 0; jump → loop_header
   *   loop_header: cmp t_cmp lt i N; branch t_cmp → loop_body / loop_exit
   *   loop_body: [body instrs]; jump → loop_latch
   *   loop_latch: add i i 1; jump → loop_header
   *   loop_exit: return null
   */
  function buildLoop(N: number, bodyInstrs: MIRInstr[]): MIRFunction {
    return mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'i', value: 0 },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mkBlock('loop_header_0', [
        { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(N) },
      ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
      mkBlock('loop_body_0', bodyInstrs, { kind: 'jump', target: 'loop_latch_0' }),
      mkBlock('loop_latch_0', [
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mkBlock('loop_exit_0', [], { kind: 'return', value: null }),
    ])
  }

  test('for(i=0; i<3; i++) unrolls to 3 copies of body', () => {
    const bodyInstrs: MIRInstr[] = [
      { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
    ]
    const fn = buildLoop(3, bodyInstrs)
    const result = loopUnroll(fn)

    // loop_header, loop_body, loop_latch should be gone
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
    expect(result.blocks.some(b => b.id.startsWith('loop_latch'))).toBe(false)
    expect(result.blocks.some(b => b.id.startsWith('loop_body'))).toBe(false)

    // loop_exit should still be there
    expect(result.blocks.some(b => b.id.startsWith('loop_exit'))).toBe(true)

    // entry block should contain 3 call instructions with substituted i values
    const entry = result.blocks.find(b => b.id === 'entry')!
    const calls = entry.instrs.filter(instr => instr.kind === 'call')
    expect(calls).toHaveLength(3)

    // Each call should have i substituted as 0, 1, 2
    expect((calls[0] as Extract<MIRInstr, { kind: 'call' }>).args[0]).toEqual(c(0))
    expect((calls[1] as Extract<MIRInstr, { kind: 'call' }>).args[0]).toEqual(c(1))
    expect((calls[2] as Extract<MIRInstr, { kind: 'call' }>).args[0]).toEqual(c(2))
  })

  test('for(i=0; i<1; i++) unrolls to 1 copy', () => {
    const bodyInstrs: MIRInstr[] = [
      { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
    ]
    const fn = buildLoop(1, bodyInstrs)
    const result = loopUnroll(fn)

    const entry = result.blocks.find(b => b.id === 'entry')!
    const calls = entry.instrs.filter(instr => instr.kind === 'call')
    expect(calls).toHaveLength(1)
    expect((calls[0] as Extract<MIRInstr, { kind: 'call' }>).args[0]).toEqual(c(0))
  })

  test('for(i=0; i<8; i++) unrolls to 8 copies (at limit)', () => {
    const bodyInstrs: MIRInstr[] = [
      { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
    ]
    const fn = buildLoop(8, bodyInstrs)
    const result = loopUnroll(fn)

    const entry = result.blocks.find(b => b.id === 'entry')!
    const calls = entry.instrs.filter(instr => instr.kind === 'call')
    expect(calls).toHaveLength(8)
  })

  test('for(i=0; i<9; i++) does NOT unroll (exceeds limit)', () => {
    const bodyInstrs: MIRInstr[] = [
      { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
    ]
    const fn = buildLoop(9, bodyInstrs)
    const result = loopUnroll(fn)

    // Should not have changed — loop blocks remain
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(true)
    expect(result).toBe(fn)
  })

  test('for(i=0; i<10; i++) does NOT unroll', () => {
    const bodyInstrs: MIRInstr[] = [
      { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
    ]
    const fn = buildLoop(10, bodyInstrs)
    const result = loopUnroll(fn)
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(true)
  })

  test('variable substitution replaces i in arithmetic', () => {
    // Body: x = i * 2
    const bodyInstrs: MIRInstr[] = [
      { kind: 'mul', dst: 'x', a: t('i'), b: c(2) },
      { kind: 'call', dst: null, fn: 'test:use', args: [t('x')] },
    ]
    const fn = buildLoop(3, bodyInstrs)
    const result = loopUnroll(fn)

    const entry = result.blocks.find(b => b.id === 'entry')!
    const muls = entry.instrs.filter(instr => instr.kind === 'mul') as Extract<MIRInstr, { kind: 'mul' }>[]
    expect(muls).toHaveLength(3)
    expect(muls[0].a).toEqual(c(0))
    expect(muls[1].a).toEqual(c(1))
    expect(muls[2].a).toEqual(c(2))
  })

  test('init must be 0 — does not unroll if initialized to non-zero', () => {
    // entry: const i 1 (not 0)
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'i', value: 1 },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mkBlock('loop_header_0', [
        { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(3) },
      ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
      mkBlock('loop_body_0', [
        { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
      ], { kind: 'jump', target: 'loop_latch_0' }),
      mkBlock('loop_latch_0', [
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mkBlock('loop_exit_0', [], { kind: 'return', value: null }),
    ])
    const result = loopUnroll(fn)
    expect(result).toBe(fn)
  })

  test('non-lt comparison does not unroll', () => {
    // loop_header: cmp le (not lt)
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'i', value: 0 },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mkBlock('loop_header_0', [
        { kind: 'cmp', dst: 't_cmp', op: 'le', a: t('i'), b: c(3) },
      ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
      mkBlock('loop_body_0', [
        { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
      ], { kind: 'jump', target: 'loop_latch_0' }),
      mkBlock('loop_latch_0', [
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mkBlock('loop_exit_0', [], { kind: 'return', value: null }),
    ])
    const result = loopUnroll(fn)
    expect(result).toBe(fn)
  })
})

// ---------------------------------------------------------------------------
// End-to-end tests via full compiler pipeline
// ---------------------------------------------------------------------------

describe('loopUnroll — end-to-end via optimizeFunction', () => {
  test('for(0..3) loop is unrolled after full optimization', () => {
    const fns = compileToMIR(`
      fn f(): void {
        for (let i: int = 0; i < 3; i = i + 1) {
          cmd("say " + i);
        }
      }
    `)
    const fn = fns[0]
    const optimized = optimizeFunction(fn)

    // After optimization, loop blocks should be gone
    expect(optimized.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
    expect(optimized.blocks.some(b => b.id.startsWith('loop_latch'))).toBe(false)
  })

  test('for(0..10) loop is NOT unrolled', () => {
    const fns = compileToMIR(`
      fn f(): void {
        for (let i: int = 0; i < 10; i = i + 1) {
          cmd("say " + i);
        }
      }
    `)
    const fn = fns[0]
    const optimized = optimizeFunction(fn)

    // Loop blocks should remain (N=10 > limit)
    expect(optimized.blocks.some(b => b.id.startsWith('loop_header'))).toBe(true)
  })
})
