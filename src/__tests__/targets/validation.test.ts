import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { DiagnosticError } from '../../diagnostics'
import { createCompilerSession } from '../../emit/compile'
import { analyzeProjectTarget } from '../../compiler/project-target-analysis'
import { loadProject } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'
import { resolvePackageSymbols } from '../../resolver/package-symbols'
import { buildSemanticTargetPlan } from '../../targets/capabilities'
import { validateTargetPlan } from '../../targets/validate'

function makeProject(source: string, kind: 'datapack' | 'commands'): string {
  const root = mkdtempSync(path.join(tmpdir(), 'redscript-target-validation-'))
  writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]
mc-version = "26.2"

[target.build]
kind = "${kind}"
entry = "example.com/app/cmd::main"
out = "build"
`)
  mkdirSync(path.join(root, 'src/cmd'), { recursive: true })
  writeFileSync(path.join(root, 'src/cmd/main.mcrs'), source)
  return root
}

function planFor(root: string) {
  const project = loadProject(root)!
  const target = project.targets.build
  const linked = resolvePackageSymbols(loadPackageGraph(project, target))
  return buildSemanticTargetPlan(linked, target)
}

function diagnosticsFor(root: string, lenient = false): DiagnosticError[] {
  return validateTargetPlan(planFor(root), { lenient })
}

describe('target capability validation', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  test('accepts lifecycle hooks for the datapack profile', () => {
    const root = makeProject(`
package cmd;
export fn main(): void {}
@tick
fn heartbeat(): void { raw("say tick"); }
`, 'datapack')
    roots.push(root)

    expect(diagnosticsFor(root)).toEqual([])
  })

  test('rejects a forged target kind or entry that only reuses a manifest target name', () => {
    const root = makeProject('package cmd; export fn main(): void {}', 'datapack')
    roots.push(root)
    const project = loadProject(root)!
    const target = project.targets.build

    expect(() => analyzeProjectTarget(project, { ...target, kind: 'commands' })).toThrow(
      "does not match its manifest declaration",
    )
    expect(() => analyzeProjectTarget(project, { ...target, entry: 'example.com/app/cmd::other' })).toThrow(
      "does not match its manifest declaration",
    )
  })

  test('rejects lifecycle hooks for commands with stable RST2001 provenance', () => {
    const root = makeProject(`
package cmd;
export fn main(): void {}
@tick
fn heartbeat(): void { raw("say tick"); }
`, 'commands')
    roots.push(root)

    const diagnostics = diagnosticsFor(root)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe('RST2001')
    expect(diagnostics[0].message).toContain("Target 'build' (commands) does not support 'lifecycle-hooks'")
    expect(diagnostics[0].message).toContain('@tick on example.com/app/cmd::heartbeat')
    expect(diagnostics[0].message).toContain('Alternative: invoke this behavior explicitly')
    expect(diagnostics[0].location.file).toMatch(/src\/cmd\/main\.mcrs$/)
    expect(diagnostics[0].format()).toContain('[TypeError RST2001]')
  })

  test('treats declaration-surface registry resources as target-neutral references', () => {
    const root = makeProject(`
package cmd;
resource item minecraft:diamond;
export fn main(): void {}
`, 'commands')
    roots.push(root)

    const plan = planFor(root)
    expect(plan.requirements).toContainEqual(expect.objectContaining({
      capability: 'resource-references',
      origin: 'resource item minecraft:diamond',
    }))
    expect(validateTargetPlan(plan)).toEqual([])
  })

  test('allows an unreachable scheduling helper but rejects it once reachable with the shortest chain', () => {
    const unreachable = makeProject(`
package cmd;
export fn main(): void {}
fn later(): void { setTimeout(1, () => { raw("say later"); }); }
`, 'commands')
    roots.push(unreachable)
    expect(diagnosticsFor(unreachable)).toEqual([])

    const reachable = makeProject(`
package cmd;
export fn main(): void { later(); }
fn later(): void { setTimeout(1, () => { raw("say later"); }); }
`, 'commands')
    roots.push(reachable)
    const [diagnostic] = diagnosticsFor(reachable)
    expect(diagnostic.code).toBe('RST2002')
    expect(diagnostic.message).toContain(
      'Call chain: example.com/app/cmd::main → example.com/app/cmd::later',
    )
  })

  test('does not let lenient validation downgrade target incompatibility', () => {
    const root = makeProject(`
package cmd;
export fn main(): void { later(); }
fn later(): void { setTimeout(1, () => { raw("say later"); }); }
`, 'commands')
    roots.push(root)

    expect(diagnosticsFor(root, true).map(diagnostic => diagnostic.code)).toEqual(['RST2002'])
  })

  test('fails a commands CompilerSession at capability validation before backend emission', () => {
    const root = makeProject(`
package cmd;
export fn main(): void {}
@tick
fn heartbeat(): void { raw("say tick"); }
`, 'commands')
    roots.push(root)
    const project = loadProject(root)!
    const session = createCompilerSession({ project, target: project.targets.build })

    const analysis = session.analyzeProject()
    expect(analysis.plan.entry).toBe('example.com/app/cmd::main')
    expect(analysis.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['RST2001'])

    expect(() => session.compileProject())
      .toThrow(expect.objectContaining({ code: 'RST2001' }))
    expect(existsSync(path.join(root, 'build'))).toBe(false)
  })

  test('reports frontend type errors before target capability errors', () => {
    const root = makeProject(`
package cmd;
export fn main(): int { return "wrong"; }
@tick
fn heartbeat(): void { raw("say tick"); }
`, 'commands')
    roots.push(root)
    const project = loadProject(root)!

    try {
      createCompilerSession({ project, target: project.targets.build }).compileProject()
      throw new Error('expected compileProject() to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(DiagnosticError)
      expect((error as DiagnosticError).code).toBeUndefined()
      expect((error as DiagnosticError).message).toContain('Return type mismatch')
    }
    expect(existsSync(path.join(root, 'build'))).toBe(false)
  })

  test('emits function tags for datapack and rejects the same target contribution for commands', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'redscript-target-function-tag-'))
    roots.push(root)
    mkdirSync(path.join(root, 'src/cmd'), { recursive: true })
    mkdirSync(path.join(root, 'src/hooks'), { recursive: true })
    writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]

[target.pack]
kind = "datapack"
entry = "example.com/app/cmd::main"
out = "build/pack"

[target.shell]
kind = "commands"
entry = "example.com/app/cmd::main"
out = "build/shell.json"
`)
    writeFileSync(path.join(root, 'src/cmd/main.mcrs'), `
package cmd;
import "example.com/app/hooks" as hooks;
export @function_tag("app:hooks")
fn main(): void { raw("say hello"); }
`)
    writeFileSync(path.join(root, 'src/hooks/hooks.mcrs'), `
package hooks;
@function_tag("app:hooks")
fn secondary(): void { raw("say secondary"); }
`)
    const project = loadProject(root)!

    const datapack = createCompilerSession({ project, target: project.targets.pack }).compileProject()
    const tagFile = datapack.files.find(file => file.path === 'data/app/tags/function/hooks.json')
    expect(tagFile).toBeDefined()
    expect(JSON.parse(tagFile!.content)).toEqual({ values: ['app:hooks/secondary', 'app:cmd/main'] })

    const commandsSession = createCompilerSession({ project, target: project.targets.shell })
    expect(commandsSession.analyzeProject().diagnostics.map(diagnostic => diagnostic.code)).toEqual([
      'RST2008',
      'RST2008',
    ])
    expect(() => commandsSession.compileProject()).toThrow(expect.objectContaining({ code: 'RST2008' }))
    expect(existsSync(path.join(root, 'build'))).toBe(false)
  })

  test.each([
    ['@on_trigger("ready")', 'RST2009'],
    ['@profile', 'RST2010'],
    ['@require_on_load("init")', 'RST2011'],
  ])('rejects unsupported project decorator %s before datapack emission', (decorator, code) => {
    const root = makeProject(`
package cmd;
export ${decorator}
fn main(): void { raw("say hello"); }
`, 'datapack')
    roots.push(root)
    const project = loadProject(root)!
    const session = createCompilerSession({ project, target: project.targets.build })

    expect(session.analyzeProject().diagnostics).toEqual([expect.objectContaining({ code })])
    expect(() => session.compileProject()).toThrow(expect.objectContaining({ code }))
    expect(existsSync(path.join(root, 'build'))).toBe(false)
  })
})
