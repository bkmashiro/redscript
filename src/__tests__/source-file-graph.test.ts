import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { loadStandaloneSourceGraph } from '../compiler/source-graph'
import { resolvePackageSymbols } from '../resolver/package-symbols'
import { typecheckResolvedPackageProgram } from '../compiler/package-typecheck'

function withRoot(check: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-source-graph-'))
  try { check(root) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

test('file-backed unsaved buffers bind selected runtime implementations through the shared frontend', () => withRoot(root => {
  fs.writeFileSync(path.join(root, 'lib.mcrs'), 'module lib; export fn helper(): int { return secret(); } fn secret(): int { return 7; }')
  const graph = loadStandaloneSourceGraph({ filePath: path.join(root, 'main.mcrs'), source: 'import lib::helper; fn main(): int { return helper(); }' })
  const linked = resolvePackageSymbols(graph)
  expect(linked.packages.get(graph.entry.id.path)!.references[0].symbolId).toBe('source/lib::helper')
  expect(typecheckResolvedPackageProgram(linked).errors).toEqual([])
  expect(fs.existsSync(path.join(root, 'main.mcrs'))).toBe(false)
  expect(fs.existsSync(path.join(root, 'redscript.toml'))).toBe(false)
}))

test('aliases and symlinks to one file share one package identity', () => withRoot(root => {
  fs.writeFileSync(path.join(root, 'lib.mcrs'), 'module lib; export fn helper(): int { return 7; }')
  fs.symlinkSync('lib.mcrs', path.join(root, 'alias.mcrs'))
  const graph = loadStandaloneSourceGraph({ filePath: path.join(root, 'main.mcrs'), source: 'import "./lib.mcrs" as a; import "./alias.mcrs" as b; fn main(): int { return a::helper() + b::helper(); }' })
  expect(graph.packages.size).toBe(2)
  expect(new Set(graph.entry.imports.map(imported => imported.path)).size).toBe(1)
  expect(typecheckResolvedPackageProgram(resolvePackageSymbols(graph)).errors).toEqual([])
}))

test('standalone graph discovery closes stdlib transitive imports without inlining source', () => withRoot(root => {
  const graph = loadStandaloneSourceGraph({ filePath: path.join(root, 'main.mcrs'), source: 'import vec; fn main(): int { return vec::dot2d(1, 2, 3, 4); }' })
  expect(graph.packages.has('stdlib/vec')).toBe(true)
  expect(graph.packages.has('stdlib/math')).toBe(true)
  expect(graph.entry.programs[0].declarations.map(fn => fn.name)).toEqual(['main'])
  expect(typecheckResolvedPackageProgram(resolvePackageSymbols(graph)).errors).toEqual([])
}))

test('an unsaved entry beneath a symlinked parent shares canonical roots with imported files', () => withRoot(root => {
  const real = path.join(root, 'real')
  const alias = path.join(root, 'workspace')
  fs.mkdirSync(real)
  fs.symlinkSync(real, alias)
  fs.writeFileSync(path.join(real, 'lib.mcrs'), 'module lib; export fn helper(): int { return 7; }')
  const graph = loadStandaloneSourceGraph({ filePath: path.join(alias, 'main.mcrs'), source: 'import lib::helper; fn main(): int { return helper(); }' })
  expect(resolvePackageSymbols(graph).packages.get(graph.entry.id.path)!.references[0].symbolId).toBe('source/lib::helper')
}))

test('a directory beside a module file does not capture the import', () => withRoot(root => {
  fs.mkdirSync(path.join(root, 'lib'))
  fs.writeFileSync(path.join(root, 'lib.mcrs'), 'module lib; export fn helper(): int { return 7; }')
  const graph = loadStandaloneSourceGraph({ filePath: path.join(root, 'main.mcrs'), source: 'import lib::helper; fn main(): int { return helper(); }' })
  expect(typecheckResolvedPackageProgram(resolvePackageSymbols(graph)).errors).toEqual([])
}))

test('reverse imports deduplicate an unsaved entry buffer in a source cycle', () => withRoot(root => {
  fs.writeFileSync(path.join(root, 'lib.mcrs'), 'import main; fn helper(): int { return 7; }')
  const graph = loadStandaloneSourceGraph({ filePath: path.join(root, 'main.mcrs'), source: 'import lib; fn main(): int { return helper(); }' })
  expect(graph.packages.size).toBe(2)
  expect(graph.topologicalOrder).toHaveLength(2)
  expect(typecheckResolvedPackageProgram(resolvePackageSymbols(graph)).errors).toEqual([])
}))

test('file-backed cycles complete discovery before binding each source once', () => withRoot(root => {
  fs.writeFileSync(path.join(root, 'main.mcrs'), 'import lib; fn main(): int { return helper(); }')
  fs.writeFileSync(path.join(root, 'lib.mcrs'), 'import main; fn helper(): int { return 7; }')
  const graph = loadStandaloneSourceGraph({ filePath: path.join(root, 'main.mcrs'), source: fs.readFileSync(path.join(root, 'main.mcrs'), 'utf8') })
  expect(graph.packages.size).toBe(2)
  expect(graph.topologicalOrder).toHaveLength(2)
  expect(typecheckResolvedPackageProgram(resolvePackageSymbols(graph)).errors).toEqual([])
}))
