import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { DiagnosticError } from '../../diagnostics'
import { createCompilerSession } from '../../emit/compile'
import { MCCommandValidator } from '../../mc-validator'
import { loadProject } from '../../project/manifest'

const COMMANDS_FIXTURE = path.join(__dirname, '..', '..', 'mc-validator', 'commands-1.21.4.json')

describe('project multi-target command backend', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  test('compiles one project to datapack artifacts and a finite commands manifest', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'redscript-commands-e2e-'))
    roots.push(root)
    mkdirSync(path.join(root, 'src/cmd'), { recursive: true })
    writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]
mc-version = "26.2"

[target.pack]
kind = "datapack"
entry = "example.com/app/cmd::main"
out = "build/pack"

[target.admin]
kind = "commands"
entry = "example.com/app/cmd::main"
out = "build/admin.commands.json"
max-commands = 64

[target.tiny]
kind = "commands"
entry = "example.com/app/cmd::main"
out = "build/tiny.commands.json"
max-commands = 2
`)
    writeFileSync(path.join(root, 'src/cmd/main.mcrs'), `
package cmd;

struct Greeter { value: int }
impl Greeter {
  fn greet(self): void { raw("say method"); }
}

export fn main(): void {
  helper();
  let greeter: Greeter = Greeter { value: 0 };
  greeter.greet();
  for (let i: int = 0; i < 3; i = i + 1) { raw("say loop"); }
  let enabled: int = scoreboard_get("#enabled", #admin);
  if (enabled == 1) {
    raw("say enabled");
    raw("say still-enabled");
  }
}

fn helper(): void { raw("say helper"); }
`)

    const project = loadProject(root)!
    const datapack = createCompilerSession({ project, target: project.targets.pack }).compileProject()
    const commands = createCompilerSession({ project, target: project.targets.admin }).compileProject()
    try {
      createCompilerSession({ project, target: project.targets.tiny }).compileProject()
      throw new Error('expected tiny command budget to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(DiagnosticError)
      expect((error as DiagnosticError).code).toBe('RST2102')
    }

    expect(datapack.kind).toBe('datapack')
    expect(datapack.files.some(file => file.path === 'data/app/function/cmd/main.mcfunction')).toBe(true)
    expect(datapack.files.find(file => file.path.endsWith('/cmd/main.mcfunction'))?.content)
      .toContain('function app:cmd/helper')
    expect(datapack.files.some(file => /^data\/app\/function\/cmd\/greeter\/greet.*\.mcfunction$/.test(file.path)))
      .toBe(true)

    expect(commands.kind).toBe('commands')
    if (commands.kind !== 'commands') throw new Error('expected commands result')
    const invoke = commands.commandProgram.phases.invoke.map(step => step.command)
    expect(invoke).toContain('say helper')
    expect(invoke).toContain('say method')
    expect(invoke.filter(command => command.endsWith('say loop'))).toHaveLength(3)
    expect(invoke.some(command => command.endsWith('run say enabled'))).toBe(true)
    expect(invoke.some(command => command.endsWith('run say still-enabled'))).toBe(true)
    expect(invoke.every(command => !/\bfunction\s/.test(command))).toBe(true)
    expect(commands.files).toEqual([])
    expect(commands.manifestJson).toBe(`${JSON.stringify(commands.commandProgram, null, 2)}\n`)
    expect(commands.textProjection).toContain('# phase: invoke')
    expect(commands.manifestJson).not.toContain(root)
    expect(commands.commandProgram.phases.invoke[0].source?.file).toBe('example.com/app/cmd/main.mcrs')

    const validator = new MCCommandValidator(COMMANDS_FIXTURE)
    const invalid = [
      ...commands.commandProgram.phases.setup,
      ...commands.commandProgram.phases.invoke,
      ...commands.commandProgram.phases.cleanup,
    ].map(step => ({ command: step.command, result: validator.validate(step.command) }))
      .filter(entry => !entry.result.valid)
    expect(invalid).toEqual([])

    const recompiled = createCompilerSession({ project, target: project.targets.admin }).compileProject()
    expect(recompiled.kind).toBe('commands')
    if (recompiled.kind !== 'commands') throw new Error('expected commands result')
    expect(commands.commandProgram).toEqual(recompiled.commandProgram)
  })
})
