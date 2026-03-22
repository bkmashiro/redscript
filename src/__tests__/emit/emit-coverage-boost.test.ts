/**
 * Boost coverage for src/emit/index.ts
 *
 * Target: cover cmpToMC branches for 'le' (<=) and 'gt' (>)
 * which appear on lines 605-606 and were not exercised by prior tests.
 */

import { emit } from '../../emit'
import type { LIRModule, LIRFunction, LIRInstr } from '../../lir/types'

function getFile(files: { path: string; content: string }[], path: string): string {
  const file = files.find(f => f.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(f => f.path).join('\n')}`)
  }
  return file.content
}

function makeModule(instructions: LIRInstr[]): LIRModule {
  const fn: LIRFunction = {
    name: 'cov/run',
    instructions,
    isMacro: false,
    macroParams: [],
  }
  return {
    namespace: 'covns',
    functions: [fn],
    objective: '__cov',
  }
}

const defaultOpts = {
  namespace: 'covns',
}

describe('emit/index.ts: cmpToMC le and gt branch coverage', () => {
  const sourceLoc = { file: 'src/cov.mcrs', line: 1, col: 1 }

  test('call_if_score with op=le emits <= operator', () => {
    const instructions: LIRInstr[] = [
      {
        kind: 'call_if_score',
        fn: 'covns:le_test',
        a: { player: '$x', obj: '__cov' },
        op: 'le',
        b: { player: '$y', obj: '__cov' },
        sourceLoc,
      },
    ]
    const files = emit(makeModule(instructions), defaultOpts)
    const main = getFile(files, 'data/covns/function/cov/run.mcfunction')
    expect(main).toContain('execute if score $x __cov <= $y __cov run function covns:le_test')
  })

  test('call_if_score with op=gt emits > operator', () => {
    const instructions: LIRInstr[] = [
      {
        kind: 'call_if_score',
        fn: 'covns:gt_test',
        a: { player: '$x', obj: '__cov' },
        op: 'gt',
        b: { player: '$y', obj: '__cov' },
        sourceLoc,
      },
    ]
    const files = emit(makeModule(instructions), defaultOpts)
    const main = getFile(files, 'data/covns/function/cov/run.mcfunction')
    expect(main).toContain('execute if score $x __cov > $y __cov run function covns:gt_test')
  })

  test('call_unless_score with op=le emits <= operator', () => {
    const instructions: LIRInstr[] = [
      {
        kind: 'call_unless_score',
        fn: 'covns:unless_le',
        a: { player: '$a', obj: '__cov' },
        op: 'le',
        b: { player: '$b', obj: '__cov' },
        sourceLoc,
      },
    ]
    const files = emit(makeModule(instructions), defaultOpts)
    const main = getFile(files, 'data/covns/function/cov/run.mcfunction')
    expect(main).toContain('execute unless score $a __cov <= $b __cov run function covns:unless_le')
  })

  test('call_unless_score with op=gt emits > operator', () => {
    const instructions: LIRInstr[] = [
      {
        kind: 'call_unless_score',
        fn: 'covns:unless_gt',
        a: { player: '$a', obj: '__cov' },
        op: 'gt',
        b: { player: '$b', obj: '__cov' },
        sourceLoc,
      },
    ]
    const files = emit(makeModule(instructions), defaultOpts)
    const main = getFile(files, 'data/covns/function/cov/run.mcfunction')
    expect(main).toContain('execute unless score $a __cov > $b __cov run function covns:unless_gt')
  })

  test('call_context with if_score op=le and op=gt', () => {
    const instructions: LIRInstr[] = [
      {
        kind: 'call_context',
        fn: 'covns:ctx_le_gt',
        subcommands: [
          { kind: 'if_score', a: '$p __cov', op: 'le', b: '$q __cov' },
          { kind: 'if_score', a: '$p __cov', op: 'gt', b: '$q __cov' },
        ],
        sourceLoc,
      },
    ]
    const files = emit(makeModule(instructions), defaultOpts)
    const main = getFile(files, 'data/covns/function/cov/run.mcfunction')
    expect(main).toContain('if score $p __cov <= $q __cov')
    expect(main).toContain('if score $p __cov > $q __cov')
  })

  test('call_context with unless_score op=le and op=gt', () => {
    const instructions: LIRInstr[] = [
      {
        kind: 'call_context',
        fn: 'covns:unless_ctx',
        subcommands: [
          { kind: 'unless_score', a: '$p __cov', op: 'le', b: '$q __cov' },
          { kind: 'unless_score', a: '$p __cov', op: 'gt', b: '$q __cov' },
        ],
        sourceLoc,
      },
    ]
    const files = emit(makeModule(instructions), defaultOpts)
    const main = getFile(files, 'data/covns/function/cov/run.mcfunction')
    expect(main).toContain('unless score $p __cov <= $q __cov')
    expect(main).toContain('unless score $p __cov > $q __cov')
  })
})
