import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { loadProject } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'
import { makePackageSymbolId, resolvePackageSymbols } from '../../resolver/package-symbols'
import { getTargetProfile } from '../../targets/model'
import { buildSemanticTargetPlan } from '../../targets/capabilities'

function makeProject(files: Record<string, string>, kind: 'datapack' | 'commands' = 'commands'): string {
  const root = mkdtempSync(path.join(tmpdir(), 'redscript-capability-inference-'))
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
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, content)
  }
  return root
}

function planFor(root: string) {
  const project = loadProject(root)!
  const target = project.targets.build
  const linked = resolvePackageSymbols(loadPackageGraph(project, target))
  return buildSemanticTargetPlan(linked, target)
}

describe('target capability inference', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  test('defines immutable datapack and commands capability profiles', () => {
    expect(getTargetProfile('datapack').capabilities).toContain('lifecycle-hooks')
    expect(getTargetProfile('datapack').capabilities).toContain('resource-artifacts')
    expect(getTargetProfile('commands').capabilities).toContain('persistent-state')
    expect(getTargetProfile('commands').capabilities).not.toContain('lifecycle-hooks')
    expect(getTargetProfile('commands').capabilities).not.toContain('scheduled-execution')
  })

  test('computes cross-package reachability and propagates a scheduling requirement with its shortest chain', () => {
    const root = makeProject({
      'src/cmd/main.mcrs': `
package cmd;
import "example.com/app/tools" as tools;
export fn main(): void { tools::later(); }
`,
      'src/tools/tools.mcrs': `
package tools;
export fn later(): void {
  setTimeout(20, () => { raw("say later"); });
}
fn dead_timer(): void {
  setTimeout(40, () => { raw("say dead"); });
}
`,
    })
    roots.push(root)

    const plan = planFor(root)
    const main = makePackageSymbolId('example.com/app/cmd', 'main')
    const later = makePackageSymbolId('example.com/app/tools', 'later')
    const dead = makePackageSymbolId('example.com/app/tools', 'dead_timer')

    expect(plan.entry).toBe(main)
    expect(plan.reachableSymbols).toEqual([main, later])
    expect(plan.reachableSymbols).not.toContain(dead)
    expect(plan.callGraph.get(main)).toEqual([later])
    expect(plan.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capability: 'scheduled-execution',
        symbolId: later,
        origin: 'intrinsic setTimeout',
        callChain: [main, later],
      }),
    ]))
    expect(plan.requirements.some(requirement => requirement.symbolId === dead)).toBe(false)
  })

  test('uses a deterministic shortest call chain independent of source call order', () => {
    const root = makeProject({
      'src/cmd/main.mcrs': `
package cmd;
export fn main(): void { z_path(); a_path(); }
fn z_path(): void { danger(); }
fn a_path(): void { danger(); }
fn danger(): void {
  setTimeout(1, () => { raw("say danger"); });
}
`,
    })
    roots.push(root)

    const plan = planFor(root)
    const packagePath = 'example.com/app/cmd'
    expect(plan.requirements.find(requirement => requirement.origin === 'intrinsic setTimeout')?.callChain).toEqual([
      makePackageSymbolId(packagePath, 'main'),
      makePackageSymbolId(packagePath, 'a_path'),
      makePackageSymbolId(packagePath, 'danger'),
    ])
  })

  test('infers reachable recursion, generated helpers, persistent state, and opaque commands', () => {
    const root = makeProject({
      'src/cmd/main.mcrs': `
package cmd;
let counter: int = 0;
export fn main(): void { recurse_a(); }
fn recurse_a(): void { recurse_b(); }
fn recurse_b(): void {
  if (counter > 0) { recurse_a(); }
  while (counter > 0) { counter -= 1; }
  raw("say opaque");
}
`,
    })
    roots.push(root)

    const plan = planFor(root)
    const capabilities = plan.requirements.map(requirement => requirement.capability)
    expect(capabilities).toContain('recursive-calls')
    expect(capabilities).toContain('generated-helper-functions')
    expect(capabilities).toContain('persistent-state')
    expect(capabilities).toContain('opaque-commands')
    expect(plan.requirements.find(requirement => requirement.capability === 'recursive-calls')?.origin)
      .toMatch(/recurse_a.*recurse_b.*recurse_a/)
  })

  test('distinguishes optimizer-bounded for loops from helper-backed loops', () => {
    const bounded = makeProject({
      'src/cmd/main.mcrs': `
package cmd;
export fn main(): void {
  for (let i: int = 0; i < 3; i = i + 1) { raw("say loop"); }
}
`,
    }, 'commands')
    const dynamic = makeProject({
      'src/cmd/main.mcrs': `
package cmd;
export fn main(): void {
  let limit: int = 3;
  for (let i: int = 0; i < limit; i = i + 1) { raw("say loop"); }
}
`,
    }, 'commands')
    roots.push(bounded, dynamic)

    expect(planFor(bounded).requirements.some(
      requirement => requirement.capability === 'generated-helper-functions',
    )).toBe(false)
    expect(planFor(dynamic).requirements.some(
      requirement => requirement.capability === 'generated-helper-functions',
    )).toBe(true)
  })

  test('does not treat an unimported local dependency lifecycle hook as a target root', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'redscript-capability-unused-dependency-'))
    roots.push(workspace)
    const app = path.join(workspace, 'app')
    const shared = path.join(workspace, 'shared')
    mkdirSync(path.join(app, 'src/cmd'), { recursive: true })
    mkdirSync(path.join(shared, 'src/hooks'), { recursive: true })
    writeFileSync(path.join(app, 'redscript.toml'), `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]

[dependencies]
"example.com/shared" = { path = "../shared" }

[target.build]
kind = "commands"
entry = "example.com/app/cmd::main"
out = "build"
`)
    writeFileSync(path.join(app, 'src/cmd/main.mcrs'), `
package cmd;
export fn main(): void {}
`)
    writeFileSync(path.join(shared, 'redscript.toml'), `
[project]
name = "shared"
module = "example.com/shared"
namespace = "shared"
source-roots = ["src"]
`)
    writeFileSync(path.join(shared, 'src/hooks/hooks.mcrs'), `
package hooks;
@tick
fn unused_tick(): void { raw("say unused"); }
`)

    const plan = planFor(app)
    expect(plan.requirements.some(requirement => requirement.capability === 'lifecycle-hooks')).toBe(false)
    expect(plan.reachableSymbols).toEqual(['example.com/app/cmd::main'])
  })

  test('follows instance-method calls into target-incompatible requirements', () => {
    const root = makeProject({
      'src/cmd/main.mcrs': `
package cmd;
struct Worker { id: int }
impl Worker {
  fn later(self): void {
    setTimeout(1, () => { raw("say later"); });
  }
}
export fn main(): void {
  let worker: Worker = Worker { id: 1 };
  worker.later();
}
`,
    })
    roots.push(root)

    const plan = planFor(root)
    expect(plan.reachableSymbols).toEqual([
      'example.com/app/cmd::Worker.later',
      'example.com/app/cmd::main',
    ])
    expect(plan.requirements).toContainEqual(expect.objectContaining({
      capability: 'scheduled-execution',
      symbolId: 'example.com/app/cmd::Worker.later',
      callChain: [
        'example.com/app/cmd::main',
        'example.com/app/cmd::Worker.later',
      ],
    }))
  })

  test('uses the receiver type to avoid same-name impl false positives', () => {
    const root = makeProject({
      'src/cmd/main.mcrs': `
package cmd;
struct Safe { id: int }
struct Danger { id: int }
impl Safe { fn work(self): void { raw("say safe"); } }
impl Danger {
  fn work(self): void { setTimeout(1, () => { raw("say danger"); }); }
}
export fn main(): void {
  let worker: Safe = Safe { id: 1 };
  worker.work();
}
`,
    })
    roots.push(root)

    const plan = planFor(root)
    expect(plan.reachableSymbols).toContain('example.com/app/cmd::Safe.work')
    expect(plan.reachableSymbols).not.toContain('example.com/app/cmd::Danger.work')
    expect(plan.requirements.some(requirement => requirement.capability === 'scheduled-execution')).toBe(false)
  })
})
