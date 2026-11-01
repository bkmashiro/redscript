import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { SourceManager } from '../compiler/source-manager'
import { typecheckResolvedPackageProgram } from '../compiler/package-typecheck'
import { packageId, type PackageBindingGraph, type LoadedPackage } from '../project/package-graph'
import { resolvePackageSymbols } from '../resolver/package-symbols'

function withLinked(source: string, check: (linked: ReturnType<typeof resolvePackageSymbols<PackageBindingGraph>>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-bound-imports-'))
  try {
    const manager = new SourceManager({ cwd: root })
    const programs: LoadedPackage[] = [
      ['main', 'standalone', source],
      ['lib', 'dep', 'package lib; export fn helper(): int { return secret(); } fn secret(): int { return 7; } export fn other(): int { return 9; }'],
    ].map(([name, owner, text]) => {
      const filePath = path.join(root, `${name}.mcrs`)
      fs.writeFileSync(filePath, text)
      const file = manager.readFile(filePath)
      const parser = new Parser(new Lexer(text, filePath).tokenize(), text, filePath)
      const program = parser.parse('test')
      expect(parser.parseErrors).toEqual([])
      for (const imported of program.imports) imported.packagePath = 'dep/lib'
      return {
        id: packageId(owner, name), name, dir: root, programs: [program],
        sourceFiles: [{ id: file.id, absolutePath: filePath, text }],
        imports: program.imports.map(imported => ({ path: 'dep/lib', modulePath: 'dep', alias: imported.moduleName, sourceFile: file.id })),
      }
    })
    const graph: PackageBindingGraph = {
      modulePath: 'standalone', rootPackages: [programs[0].id],
      packages: new Map(programs.map(pkg => [pkg.id.path, pkg])),
      topologicalOrder: [programs[1].id, programs[0].id],
    }
    check(resolvePackageSymbols(graph))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

test('selected runtime imports bind the real exported definition and keep its private dependencies local', () => {
  withLinked('package main; import lib::helper; export fn main(): int { return helper(); }', linked => {
    expect(linked.packages.get('standalone/main')!.references.map(ref => ref.symbolId)).toEqual(['dep/lib::helper'])
    expect([...linked.packages.get('dep/lib')!.bindings.values()]).toContain('dep/lib::secret')
    expect(typecheckResolvedPackageProgram(linked).errors).toEqual([])
  })
})

test('selected imports do not expose other public definitions', () => {
  expect(() => withLinked('package main; import lib::helper; export fn main(): int { return other(); }', () => {})).toThrow(/Unknown function 'other'/)
})

test('unimported global calls are rejected even in a generic body before instantiation', () => {
  expect(() => withLinked('package main; import lib::helper; fn generic<T>(value: T): T { other(); return value; } export fn main(): int { return generic(3); }', () => {})).toThrow(/Unknown function 'other'/)
})

test('a private function cannot be selected for import', () => {
  expect(() => withLinked('package main; import lib::secret; export fn main(): int { return secret(); }', () => {})).toThrow(/does not export 'secret'/)
})

test('receiver methods are not rebound to a selected global function with the same name', () => {
  withLinked('package main; import lib::helper; struct Counter { n: int } impl Counter { fn helper(self): int { return self.n; } } export fn main(): int { let c: Counter = Counter { n: 5 }; return c.helper(); }', linked => {
    expect(linked.packages.get('standalone/main')!.references).toHaveLength(0)
    expect(typecheckResolvedPackageProgram(linked).errors).toEqual([])
  })
})

test('local lambda bindings shadow imported names', () => {
  withLinked('package main; import lib::helper; export fn main(): int { let helper: (int) -> int = (x: int) => x + 1; return helper(3); }', linked => {
    expect(linked.packages.get('standalone/main')!.references).toHaveLength(0)
    expect(typecheckResolvedPackageProgram(linked).errors).toEqual([])
  })
})
