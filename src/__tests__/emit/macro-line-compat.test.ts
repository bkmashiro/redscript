/**
 * Version gating for Minecraft function macros.
 *
 * Function macros require Minecraft 1.20.2+. Older targets fail hard instead
 * of emitting best-effort placeholder syntax or silently dropping macro args.
 */

import { emit } from '../../emit'
import type { LIRModule, LIRInstr } from '../../lir/types'
import { McVersion } from '../../types/mc-version'

const macroError = /Minecraft function macros require target Minecraft 1\.20\.2 or newer/

function makeModule(instructions: LIRInstr[], macroParams: string[] = []): LIRModule {
  return {
    namespace: 'compat',
    objective: '__compat',
    functions: [
      {
        name: 'Main',
        isMacro: macroParams.length > 0,
        macroParams,
        instructions,
      },
    ],
  }
}

function emitMain(module: LIRModule, mcVersion: McVersion): string {
  const files = emit(module, {
    namespace: 'compat',
    mcVersion,
  })
  const file = files.find(f => f.path === 'data/compat/function/main.mcfunction')
  if (!file) throw new Error('Missing main.mcfunction')
  return file.content.trim()
}

describe('macro version gating', () => {
  test('macro_line emits for Minecraft 1.20.2+', () => {
    const mod = makeModule([
      { kind: 'macro_line', template: 'tp @s $(x) ~ ~' },
    ])

    expect(emitMain(mod, McVersion.v1_20_2)).toBe('$tp @s $(x) ~ ~')
  })

  test('macro_line fails hard before Minecraft 1.20.2', () => {
    const mod = makeModule([
      { kind: 'macro_line', template: 'tp @s $(x) ~ ~' },
    ])

    expect(() => emitMain(mod, McVersion.v1_20)).toThrow(macroError)
  })

  test('call_macro fails hard before Minecraft 1.20.2 instead of dropping storage args', () => {
    const mod = makeModule([
      { kind: 'call_macro', fn: 'compat:helper', storage: 'rs:macro_args' },
    ])

    expect(() => emitMain(mod, McVersion.v1_20)).toThrow(macroError)
  })

  test('function macro params fail hard before Minecraft 1.20.2 even before body emission', () => {
    const mod = makeModule([
      { kind: 'raw', cmd: 'say body' },
    ], ['x'])

    expect(() => emitMain(mod, McVersion.v1_20)).toThrow(macroError)
  })

  test('nested store command macro syntax is version-gated', () => {
    const mod = makeModule([
      {
        kind: 'store_cmd_to_score',
        dst: { player: '$out', obj: '__compat' },
        cmd: { kind: 'call_macro', fn: 'compat:helper', storage: 'rs:macro_args' },
      },
    ])

    expect(() => emitMain(mod, McVersion.v1_20)).toThrow(macroError)
  })
})
