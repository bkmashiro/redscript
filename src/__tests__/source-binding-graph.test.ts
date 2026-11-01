import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { SourceManager } from '../compiler/source-manager'
import { loadSourceGraph } from '../compiler/source-graph'
import { typecheckResolvedPackageProgram } from '../compiler/package-typecheck'
import { packageId, type PackageBindingGraph, type LoadedPackage } from '../project/package-graph'
import { StdlibPackageProvider } from '../project/stdlib-provider'
import { resolvePackageSymbols } from '../resolver/package-symbols'

test('virtual source uses the real loader and binder without fabricated filesystem provenance', () => {
  const graph = loadSourceGraph({ source: 'import "stdlib/math" as trig; fn main(): int { return trig::sin_fixed(30); }', uri: 'untitled:Scratch-1' })
  expect('dir' in graph.entry).toBe(false)
  expect('sourceFiles' in graph.entry).toBe(false)
  expect(graph.sourceManager.list().filter(unit => unit.origin === 'virtual')).toHaveLength(1)
  expect(typecheckResolvedPackageProgram(resolvePackageSymbols(graph)).errors).toEqual([])
})

test('standalone discovery can use the actual package binder/typechecker without a project manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-binding-graph-'))
  try {
    const filePath = path.join(root, 'main.mcrs')
    const text = 'package main; import "stdlib/math" as trig; export fn main(): int { return trig::sin_fixed(30); }'
    fs.writeFileSync(filePath, text)
    const sources = new SourceManager({ cwd: root })
    const source = sources.readFile(filePath)
    const parser = new Parser(new Lexer(text, filePath).tokenize(), text, filePath)
    const program = parser.parse('standalone')
    expect(parser.parseErrors).toEqual([])
    const stdlib = new StdlibPackageProvider(sources)
    const math = stdlib.load('math')
    const id = packageId('standalone', '')
    const main: LoadedPackage = {
      id, name: 'main', dir: root, programs: [program],
      sourceFiles: [{ id: source.id, absolutePath: filePath, text }],
      imports: [{ path: math.id.path, modulePath: 'stdlib', alias: 'trig', sourceFile: source.id }],
    }
    const graph: PackageBindingGraph = {
      modulePath: 'standalone', rootPackages: [id],
      packages: new Map([...stdlib.packages, [id.path, main]]),
      topologicalOrder: [math.id, id],
    }
    const linked = resolvePackageSymbols(graph)
    expect(linked.packages.get(id.path)!.references.map(reference => reference.symbolId)).toEqual(['stdlib/math::sin_fixed'])
    expect(typecheckResolvedPackageProgram(linked).errors).toEqual([])
    expect(fs.existsSync(path.join(root, 'redscript.toml'))).toBe(false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
