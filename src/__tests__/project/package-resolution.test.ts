import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { createCompilerSession } from '../../emit/compile'
import { loadProject } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'
import { makePackageSymbolId, resolvePackageSymbols } from '../../resolver/package-symbols'

function parse(source: string, filePath = '/project/src/cmd/pack/main.mcrs') {
  const parser = new Parser(new Lexer(source, filePath).tokenize(), source, filePath)
  const program = parser.parse('castle')
  if (parser.parseErrors.length > 0) throw parser.parseErrors[0]
  return program
}

function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'redscript-package-resolution-'))
  writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "castle"
module = "example.com/castle"
namespace = "castle"
source-roots = ["src"]
mc-version = "1.21.4"

[target.pack]
kind = "datapack"
entry = "example.com/castle/cmd/pack::main"
out = "build"
`)
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content)
  }
  return root
}

describe('package syntax and symbol resolution', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  test('parses package declarations and canonical imports with an alias', () => {
    const program = parse(`
package pack;
import "example.com/castle/combat" as combat;
export fn main(): void { combat::start_round(); }
`)

    expect(program.packageName).toBe('pack')
    expect(program.imports).toHaveLength(1)
    expect(program.imports[0]).toMatchObject({
      packagePath: 'example.com/castle/combat',
      alias: 'combat',
    })
    expect(program.imports[0].span?.file).toBe('/project/src/cmd/pack/main.mcrs')
  })

  test('resolves qualified calls to exported stable symbol IDs', () => {
    const root = makeProject({
      'src/combat/combat.mcrs': 'package combat; export fn start_round(): void {}',
      'src/cmd/pack/main.mcrs': `
package pack;
import "example.com/castle/combat" as arena;
export fn main(): void { arena::start_round(); }
`,
    })
    roots.push(root)

    const graph = loadPackageGraph(loadProject(root)!)
    const linked = resolvePackageSymbols(graph)
    const main = linked.packages.get('example.com/castle/cmd/pack')

    expect(linked.symbols.get(makePackageSymbolId('example.com/castle/combat', 'start_round'))?.exported).toBe(true)
    expect(main?.references.map(ref => ref.symbolId)).toEqual([
      'example.com/castle/combat::start_round',
    ])
  })

  test('resolves qualified calls inside implementation methods', () => {
    const root = makeProject({
      'src/combat/combat.mcrs': 'package combat; export fn start(): void {}',
      'src/cmd/pack/main.mcrs': `
package pack;
import "example.com/castle/combat" as combat;
struct Runner {}
impl Runner {
  fn start_runner(): void { combat::start(); }
}
export fn main(): void {}
`,
    })
    roots.push(root)

    const linked = resolvePackageSymbols(loadPackageGraph(loadProject(root)!))
    expect(linked.packages.get('example.com/castle/cmd/pack')?.references.map(ref => ref.symbolId)).toEqual([
      'example.com/castle/combat::start',
    ])
  })

  test('rejects qualified references to non-exported symbols at the importing file', () => {
    const root = makeProject({
      'src/combat/combat.mcrs': 'package combat; fn internal(): void {}',
      'src/cmd/pack/main.mcrs': `
package pack;
import "example.com/castle/combat" as combat;
export fn main(): void { combat::internal(); }
`,
    })
    roots.push(root)

    try {
      resolvePackageSymbols(loadPackageGraph(loadProject(root)!))
      throw new Error('expected resolver failure')
    } catch (error) {
      expect((error as Error).message).toMatch(/does not export 'internal'/i)
      expect((error as { location?: { file?: string } }).location?.file).toBe(
        realpathSync(path.join(root, 'src/cmd/pack/main.mcrs')),
      )
    }
  })

  test('type-checks calls against imported executable function signatures', () => {
    const root = makeProject({
      'src/combat/combat.mcrs': 'package combat; export fn start(round: int): void {}',
      'src/cmd/pack/main.mcrs': `
package pack;
import "example.com/castle/combat" as combat;
export fn main(): void { combat::start(); }
`,
    })
    roots.push(root)

    const project = loadProject(root)!
    const session = createCompilerSession({ project, target: project.targets[project.defaultTarget!] })
    expect(() => session.compileProject()).toThrow(/expects 1 arguments, got 0/)
  })

  test('keeps type diagnostics attached to the original file in a multi-file package', () => {
    const root = makeProject({
      'src/cmd/pack/a_main.mcrs': 'package pack; export fn main(): void {}',
      'src/cmd/pack/z_bad.mcrs': 'package pack; fn bad(): void { let value: int = "wrong"; }',
    })
    roots.push(root)

    const project = loadProject(root)!
    const session = createCompilerSession({
      project,
      target: project.targets[project.defaultTarget!],
    })
    try {
      session.compileProject()
      throw new Error('expected type failure')
    } catch (error) {
      const diagnostics = (error as { diagnostics?: Array<{ location?: { file?: string } }> }).diagnostics
      const diagnostic = diagnostics?.[0] ?? (error as { location?: { file?: string } })
      expect(diagnostic.location?.file).toBe(
        realpathSync(path.join(root, 'src/cmd/pack/z_bad.mcrs')),
      )
    }
  })

  test('compiles a package graph through CompilerSession with package-qualified output', () => {
    const root = makeProject({
      'src/combat/combat.mcrs': `
package combat;
export fn start_round(): void { say("Fight!"); }
`,
      'src/combat/damage.mcrs': 'package combat; fn helper(): int { return 1; }',
      'src/cmd/pack/main.mcrs': `
package pack;
import "example.com/castle/combat" as combat;
export fn main(): void { combat::start_round(); }
`,
    })
    roots.push(root)

    const project = loadProject(root)!
    const session = createCompilerSession({
      project,
      target: project.targets[project.defaultTarget!],
    })
    const result = session.compileProject()
    const paths = result.files.map(file => file.path)

    expect(paths).toContain('data/castle/function/combat/start_round.mcfunction')
    expect(paths).toContain('data/castle/function/cmd/pack/main.mcfunction')
    const main = result.files.find(file => file.path.endsWith('/cmd/pack/main.mcfunction'))
    expect(main?.content).toContain('function castle:combat/start_round')

    const repeated = session.compileProject()
    expect(repeated.files).toEqual(result.files)
  })
})
