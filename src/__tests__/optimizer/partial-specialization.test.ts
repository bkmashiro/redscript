import { describe, expect, test } from '@jest/globals'
import { interproceduralConstProp } from '../../optimizer/interprocedural'
import { optimizeModule } from '../../optimizer/pipeline'
import type { MIRFunction, MIRInstr, MIRModule, Operand } from '../../mir/types'

const c = (value: number): Operand => ({ kind: 'const', value })
const t = (name: string): Operand => ({ kind: 'temp', name })
function fn(name: string, params: string[], instrs: MIRInstr[], value: Operand | null = t('result')): MIRFunction {
  return { name, params: params.map(name => ({ name, isMacroParam: false })), isMacro: false, entry: 'entry',
    blocks: [{ id: 'entry', instrs, term: { kind: 'return', value }, preds: [] }] }
}
function mod(...functions: MIRFunction[]): MIRModule {
  return { namespace: 'partial', objective: '__partial', functions }
}
const add = () => fn('add', ['a', 'b'], [{ kind: 'add', dst: 'result', a: t('a'), b: t('b') }])
function caller(args: Operand[], target = 'add') {
  return fn('main', ['input'], [{ kind: 'call', fn: target, args, dst: 'result' }])
}
function callOf(result: MIRModule) {
  return result.functions.find(f => f.name === 'main')!.blocks[0].instrs[0] as Extract<MIRInstr, { kind: 'call' }>
}

describe('bounded partial constant specialization', () => {
  test('binds a constant parameter and keeps the dynamic argument and parameter order', () => {
    const result = interproceduralConstProp(mod(caller([t('input'), c(4)]), add()))
    const call = callOf(result)
    expect(call.fn).not.toBe('add')
    expect(call.args).toEqual([t('input')])
    const specialized = result.functions.find(f => f.name === call.fn)!
    expect(specialized.params.map(p => p.name)).toEqual(['a'])
    expect(specialized.blocks[0].instrs).toContainEqual({ kind: 'add', dst: 'result', a: t('a'), b: c(4) })
  })

  test('handles constants before a dynamic parameter without confusing ABI slots', () => {
    const result = interproceduralConstProp(mod(caller([c(-4), t('input')]), add()))
    const call = callOf(result)
    expect(call.args).toEqual([t('input')])
    expect(result.functions.find(f => f.name === call.fn)!.params.map(p => p.name)).toEqual(['b'])
  })

  test('runs ordinary cleanup after specialization exposes arithmetic identities', () => {
    const scale = fn('scale', ['value', 'factor', 'offset'], [
      { kind: 'mul', dst: 'scaled', a: t('value'), b: t('factor') },
      { kind: 'add', dst: 'result', a: t('scaled'), b: t('offset') },
    ])
    const input = { ...mod(caller([t('input'), c(1), c(0)], 'scale'), scale), noInlineFunctions: new Set(['main', 'scale']) }
    const result = optimizeModule(input)
    const specialized = result.functions.find(f => f.name === callOf(result).fn)!
    expect(specialized.blocks[0].instrs).toHaveLength(0)
    expect(specialized.blocks[0].term).toEqual({ kind: 'return', value: t('value') })
  })

  test('does not substitute a bound parameter after its MIR name is redefined', () => {
    const redefine = fn('add', ['a', 'b'], [
      { kind: 'copy', dst: 'a', src: t('b') },
      { kind: 'add', dst: 'result', a: t('a'), b: c(2) },
    ])
    const result = interproceduralConstProp(mod(caller([c(1), t('input')]), redefine))
    const specialized = result.functions.find(f => f.name === callOf(result).fn)!
    expect(specialized.blocks[0].instrs[1]).toMatchObject({ kind: 'add', a: t('a') })
  })

  test('never treats a user function with a generated-looking name as a specialization', () => {
    const collision = fn('add__const_3_4', [], [], c(999))
    const main = caller([c(3), c(4)])
    main.blocks[0].instrs.push({ kind: 'call', fn: 'add', args: [c(5), c(6)], dst: null })
    const result = interproceduralConstProp(mod(main, add(), collision))
    expect(callOf(result).fn).not.toBe(collision.name)
    expect(result.functions.find(f => f.name === callOf(result).fn)!.blocks[0].instrs)
      .toContainEqual({ kind: 'const', dst: 'result', value: 7 })
  })

  const boundaries: Array<[string, MIRInstr]> = [
    ['raw ABI access', { kind: 'call', fn: '__raw:say $p1', args: [], dst: null }],
    ['unknown calls', { kind: 'call', fn: 'external', args: [], dst: null }],
    ['compiler-owned score reads', { kind: 'score_read', dst: 'abi', player: '$p1', obj: '__partial' }],
    ['division pending broader failure modeling', { kind: 'div', dst: 'result', a: t('a'), b: t('b') }],
    ['modulo pending broader failure modeling', { kind: 'mod', dst: 'result', a: t('a'), b: t('b') }],
  ]
  test.each(boundaries)('leaves partial calls unchanged around %s', (_name, instruction) => {
    const helper = fn('add', ['a', 'b'], [instruction])
    const result = interproceduralConstProp(mod(caller([t('input'), c(4)]), helper))
    expect(callOf(result)).toMatchObject({ fn: 'add', args: [t('input'), c(4)] })
  })

  test('reuses a specialization and bounds code growth across many constant patterns', () => {
    const calls: MIRInstr[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'call', fn: 'add', args: [t('input'), c(i)], dst: null }))
    calls.push({ kind: 'call', fn: 'add', args: [t('input'), c(0)], dst: 'result' })
    const result = interproceduralConstProp(mod(fn('main', ['input'], calls), add()))
    expect(result.functions.length).toBeGreaterThan(2)
    expect(result.functions.length).toBeLessThanOrEqual(10)
    const rewritten = result.functions.find(f => f.name === 'main')!.blocks[0].instrs as Array<Extract<MIRInstr, { kind: 'call' }>>
    expect(rewritten[0].fn).toBe(rewritten[30].fn)
    expect(rewritten.some(call => call.fn === 'add')).toBe(true)
  })

  test('propagates compiler-register and division boundaries through helper calls', () => {
    for (const instruction of [
      { kind: 'score_read', dst: 'result', player: '$p0', obj: '__partial' },
      { kind: 'div', dst: 'result', a: c(-7), b: c(3) },
      { kind: 'score_read', dst: 'result', player: '@e[limit=1]', obj: 'external' },
    ] as MIRInstr[]) {
      const leaf = fn('leaf', [], [instruction])
      const helper = fn('add', ['a', 'b'], [{ kind: 'call', fn: 'leaf', args: [], dst: 'result' }])
      expect(callOf(interproceduralConstProp(mod(caller([t('input'), c(4)]), helper, leaf))).fn).toBe('add')
    }
  })

  test('bounds total module growth across many unrelated helpers', () => {
    const helpers = Array.from({ length: 80 }, (_, i) => ({ ...add(), name: `add_${i}` }))
    const main = fn('main', ['input'], helpers.map(helper => ({ kind: 'call', fn: helper.name, args: [t('input'), c(4)], dst: null })), null)
    expect(interproceduralConstProp(mod(main, ...helpers)).functions.length).toBeLessThanOrEqual(81 + 64)
  })

  test('refuses mutually recursive helpers even for full-constant calls', () => {
    const a = fn('a', ['x'], [{ kind: 'call', fn: 'b', args: [t('x')], dst: 'result' }])
    const b = fn('b', ['x'], [{ kind: 'call', fn: 'a', args: [t('x')], dst: 'result' }])
    expect(interproceduralConstProp(mod(caller([c(1)], 'a'), a, b)).functions).toHaveLength(3)
  })
})
