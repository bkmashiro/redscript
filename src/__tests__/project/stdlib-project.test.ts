import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createCompilerSession } from '../../emit/compile'
import { loadProject, resolveBuildTarget } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'

function withProject(source: string, check: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-stdlib-project-'))
  try {
    fs.mkdirSync(path.join(root, 'src'))
    fs.writeFileSync(path.join(root, 'redscript.toml'), `[project]
name = "demo"
module = "local/demo"
namespace = "demo"
source-roots = ["src"]
mc-version = "1.21.4"
[target.pack]
kind = "datapack"
entry = "local/demo::main"
out = "dist"
`)
    fs.writeFileSync(path.join(root, 'src/main.mcrs'), `package demo;\n${source}`)
    check(root)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

test.each([
  'import math; export fn main(): int { return math::sin_fixed(30); }',
  'import math::sin_fixed; export fn main(): int { return sin_fixed(30); }',
  'import math::*; export fn main(): int { return sin_fixed(30); }',
  'import "stdlib/math" as trig; export fn main(): int { return trig::sin_fixed(30); }',
  'import math; export fn main(): int { return sin_fixed(30); }',
  'import cooldown; export fn main(): int { return cooldown::cooldown_start(10, 3); }',
])('project consumers can use shipped stdlib without a manifest dependency: %s', source => {
  withProject(source, root => {
    const project = loadProject(root)!
    const result = createCompilerSession({ project, target: resolveBuildTarget(project) }).compileProject()
    expect(result.kind).toBe('datapack')
    if (result.kind === 'datapack') expect(result.files.length).toBeGreaterThan(0)
  })
})

test('transitive stdlib dependencies have a single canonical package identity', () => {
  withProject('import math; import vec; export fn main(): int { return vec::dot2d(1,2,3,4); }', root => {
    const graph = loadPackageGraph(loadProject(root)!)
    expect([...graph.packages.keys()].filter(key => key === 'stdlib/math')).toHaveLength(1)
    expect(graph.packages.has('stdlib/vec')).toBe(true)
  })
})
