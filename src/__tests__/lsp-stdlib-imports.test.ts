import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { getImportedPrograms, getImportedFunctions, resolveImportPath } from '../lsp/import-resolver'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-lsp-stdlib-'))
const uri = pathToFileURL(path.join(root, 'main.mcrs')).href

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

test.each(['math', 'stdlib/math'])('LSP resolves compiler-owned stdlib outside the checkout: %s', name => {
  expect(resolveImportPath(name, uri)?.endsWith('/math.mcrs')).toBe(true)
})

test('definition targets preserve the editor workspace URI spelling across symlinked parents', () => {
  const real = path.join(root, 'real_workspace')
  const alias = path.join(root, 'workspace_alias')
  fs.mkdirSync(real)
  fs.symlinkSync(real, alias)
  fs.writeFileSync(path.join(real, 'lib.mcrs'), 'module lib; export fn helper(): int { return 7; }')
  const source = 'import lib::helper; fn main(): int { return helper(); }'
  const ast = new Parser(new Lexer(source).tokenize(), source).parse('test')
  const imported = getImportedPrograms(source, pathToFileURL(path.join(alias, 'main.mcrs')).href, ast)
  expect(imported[0].filePath).toBe(path.join(alias, 'lib.mcrs'))
  expect(getImportedFunctions(imported[0]).map(fn => fn.name)).toEqual(['helper'])
})

test('untitled documents resolve selected stdlib signatures without a fabricated file path', () => {
  const source = 'import math::sin_fixed; fn main(): int { return sin_fixed(30); }'
  const ast = new Parser(new Lexer(source).tokenize(), source).parse('test')
  const imported = getImportedPrograms(source, 'untitled:Scratch-1', ast)
  expect(getImportedFunctions(imported[0]).map(fn => fn.name)).toEqual(['sin_fixed'])
})

test('LSP selected runtime imports expose the executable function signature', () => {
  const source = 'import math::sin_fixed; fn main(): int { return sin_fixed(30); }'
  const ast = new Parser(new Lexer(source).tokenize(), source).parse('test')
  const imported = getImportedPrograms(source, uri, ast)
  expect(getImportedFunctions(imported[0]).map(fn => fn.name)).toEqual(['sin_fixed'])
})

test('LSP wildcard imports do not expose private functions from named modules', () => {
  fs.writeFileSync(path.join(root, 'hidden.mcrs'), 'module hidden; export fn public_fn(): int { return 1; } fn secret(): int { return 2; }')
  const source = 'import hidden::*; fn main() {}'
  const ast = new Parser(new Lexer(source).tokenize(), source).parse('test')
  const imported = getImportedPrograms(source, uri, ast)
  expect(getImportedFunctions(imported[0]).map(fn => fn.name)).toEqual(['public_fn'])
})

test('LSP keeps valid stdlib imports available beside an unresolved import', () => {
  const source = 'import math; import not_created_yet; fn main() {}'
  const ast = new Parser(new Lexer(source).tokenize(), source).parse('test')
  const imported = getImportedPrograms(source, uri, ast)
  expect(imported.some(entry => getImportedFunctions(entry).some(fn => fn.name === 'sin_fixed'))).toBe(true)
})

test('LSP runtime wildcard import exposes the same function as compilation', () => {
  const source = 'import math::*; fn main(): int { return sin_fixed(30); }'
  const ast = new Parser(new Lexer(source).tokenize(), source).parse('test')
  const imported = getImportedPrograms(source, uri, ast)
  expect(imported).toHaveLength(1)
  expect(getImportedFunctions(imported[0]).some(fn => fn.name === 'sin_fixed')).toBe(true)
})
