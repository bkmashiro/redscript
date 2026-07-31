import { DiagnosticError } from '../../diagnostics'
import type { LIRFunction, LIRInstr, LIRModule } from '../../lir/types'
import {
  legalizeCommandProgram,
  renderCommandProgramText,
  serializeCommandManifest,
} from '../../targets/commands'
import { McVersion } from '../../types/mc-version'

function fn(name: string, instructions: LIRInstr[]): LIRFunction {
  return {
    name,
    params: [],
    returnType: 'void',
    instructions,
    isMacro: false,
    macroParams: [],
  }
}

function moduleWith(functions: LIRFunction[]): LIRModule {
  return {
    namespace: 'app',
    objective: '__app_cmd',
    functions,
  }
}

const options = {
  targetName: 'admin',
  namespace: 'app',
  entryFunction: 'app:cmd/main',
  minecraftVersion: '26.2',
  mcVersion: McVersion.v26_2,
}

describe('commands target legalization', () => {
  test('inlines helpers while preserving order, provenance, and expansion trace', () => {
    const program = legalizeCommandProgram([
      moduleWith([
        fn('cmd/main', [
          { kind: 'call', fn: 'app:cmd/helper', sourceLoc: { file: 'src/cmd/main.mcrs', line: 4, col: 3 } },
          { kind: 'raw', cmd: 'say done', sourceLoc: { file: 'src/cmd/main.mcrs', line: 5, col: 3 } },
        ]),
        fn('cmd/helper', [
          { kind: 'raw', cmd: 'say helper', sourceLoc: { file: 'src/cmd/main.mcrs', line: 9, col: 3 } },
        ]),
      ]),
    ], options)

    expect(program.phases.setup.map(step => step.command)).toEqual([
      'scoreboard objectives add __app_cmd dummy',
    ])
    expect(program.phases.invoke.map(step => step.command)).toEqual([
      'say helper',
      'say done',
    ])
    expect(program.phases.cleanup).toEqual([])
    expect(program.phases.invoke[0]).toMatchObject({
      source: { file: 'src/cmd/main.mcrs', line: 9, col: 3 },
      expansionTrace: ['app:cmd/main', 'app:cmd/helper'],
      effect: 'opaque',
    })
    expect(program.commandCount).toBe(3)
    expect(JSON.stringify(program)).not.toContain('function app:')
  })

  test('flattens finite dynamic branch CFG without residual function commands', () => {
    const program = legalizeCommandProgram([
      moduleWith([
        fn('cmd/main', [
          {
            kind: 'raw',
            cmd: 'execute if score $cond __app_cmd matches 1 run return run function app:cmd/then',
            sourceLoc: { file: 'src/cmd/main.mcrs', line: 4, col: 3 },
          },
          { kind: 'call', fn: 'app:cmd/merge' },
        ]),
        fn('cmd/then', [
          { kind: 'raw', cmd: 'say yes' },
          { kind: 'raw', cmd: 'say still' },
          { kind: 'call', fn: 'app:cmd/merge' },
        ]),
        fn('cmd/merge', [
          { kind: 'raw', cmd: 'say done' },
        ]),
      ]),
    ], options)

    const commands = program.phases.invoke.map(step => step.command)
    expect(commands).toEqual(expect.arrayContaining([
      'scoreboard players set $__rs_cmd_guard_0 __app_cmd 0',
      'execute if score $cond __app_cmd matches 1 run scoreboard players set $__rs_cmd_guard_0 __app_cmd 1',
      'execute if score $__rs_cmd_guard_0 __app_cmd matches 1 run say yes',
      'execute if score $__rs_cmd_guard_0 __app_cmd matches 1 run say still',
      'execute if score $__rs_cmd_guard_0 __app_cmd matches 0 run say done',
    ]))
    expect(commands.filter(command => command.endsWith('run say done'))).toHaveLength(2)
    expect(commands.every(command => !/\bfunction\s/.test(command))).toBe(true)
    expect(program.phases.cleanup.map(step => step.command)).toEqual([
      'scoreboard players reset $__rs_cmd_guard_0 __app_cmd',
    ])
  })

  test('serializes canonical JSON and deterministic text projection', () => {
    const program = legalizeCommandProgram([
      moduleWith([fn('cmd/main', [{ kind: 'raw', cmd: 'say ready' }])]),
    ], options)

    const first = serializeCommandManifest(program)
    const second = serializeCommandManifest(program)
    const text = renderCommandProgramText(program)

    expect(first).toBe(second)
    expect(first.endsWith('\n')).toBe(true)
    expect(JSON.parse(first)).toMatchObject({
      schemaVersion: 1,
      target: { name: 'admin', kind: 'commands', entry: 'app:cmd/main' },
      commandCount: 2,
    })
    expect(text).toContain('# phase: setup')
    expect(text).toContain('# phase: invoke')
    expect(text).toContain('say ready')
    expect(text.endsWith('\n')).toBe(true)
  })

  test('rejects residual, recursive, and over-budget command programs with stable diagnostics', () => {
    const residual = () => legalizeCommandProgram([
      moduleWith([fn('cmd/main', [{ kind: 'call', fn: 'app:missing' }])]),
    ], options)
    const recursive = () => legalizeCommandProgram([
      moduleWith([fn('cmd/main', [{ kind: 'call', fn: 'app:cmd/main' }])]),
    ], options)
    const overBudget = () => legalizeCommandProgram([
      moduleWith([
        fn('cmd/main', [{ kind: 'call', fn: 'app:cmd/helper' }]),
        fn('cmd/helper', [{ kind: 'raw', cmd: 'say one' }, { kind: 'raw', cmd: 'say two' }]),
      ]),
    ], { ...options, maxCommands: 2 })

    for (const [operation, code] of [
      [residual, 'RST2101'],
      [recursive, 'RST2101'],
      [overBudget, 'RST2102'],
    ] as Array<[() => void, string]>) {
      try {
        operation()
        throw new Error('expected command legalization to fail')
      } catch (error) {
        expect(error).toBeInstanceOf(DiagnosticError)
        expect((error as DiagnosticError).code).toBe(code)
      }
    }
  })

  test('rejects raw function commands and multiline commands at the final verifier', () => {
    for (const [cmd, code] of [
      ['function app:external', 'RST2101'],
      ['function local_helper', 'RST2101'],
      ['execute as @s run function app:external', 'RST2101'],
      ['say one\nsay two', 'RST2103'],
      ['not_a_real_command arg', 'RST2103'],
    ]) {
      expect(() => legalizeCommandProgram([
        moduleWith([fn('cmd/main', [{ kind: 'raw', cmd }])]),
      ], options)).toThrow(expect.objectContaining({ code }))
    }
  })

  test('does not mistake function-like text for a residual invocation', () => {
    const program = legalizeCommandProgram([
      moduleWith([fn('cmd/main', [
        { kind: 'raw', cmd: 'say run function local_helper' },
        { kind: 'raw', cmd: 'execute as @s run say run function local_helper' },
      ])]),
    ], options)

    expect(program.phases.invoke.map(step => step.command)).toEqual([
      'say run function local_helper',
      'execute as @s run say run function local_helper',
    ])
  })
})
