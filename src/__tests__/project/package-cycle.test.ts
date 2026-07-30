import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { loadProject } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'

function makeCycleProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'redscript-package-cycle-'))
  writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "cycle"
module = "example.com/cycle"
namespace = "cycle"
source-roots = ["src"]

[target.pack]
kind = "datapack"
entry = "example.com/cycle/a::main"
out = "build"
`)
  const files: Record<string, string> = {
    'src/a/a.mcrs': `package a; import "example.com/cycle/b" as b; export fn main(): void { b::b(); }`,
    'src/b/b.mcrs': `package b; import "example.com/cycle/c" as c; export fn b(): void { c::c(); }`,
    'src/c/c.mcrs': `package c; import "example.com/cycle/a" as a; export fn c(): void { a::main(); }`,
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content)
  }
  return root
}

describe('package cycle diagnostics', () => {
  test('reports the complete deterministic package cycle', () => {
    const root = makeCycleProject()
    try {
      expect(() => loadPackageGraph(loadProject(root)!)).toThrow(
        /example\.com\/cycle\/a → example\.com\/cycle\/b → example\.com\/cycle\/c → example\.com\/cycle\/a/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
