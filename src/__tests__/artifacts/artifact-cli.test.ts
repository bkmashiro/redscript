import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const cliPath = path.resolve(__dirname, '..', '..', 'cli.ts')
const cliRunner = [require.resolve('ts-node/register/transpile-only')]

function write(root: string, relativePath: string, content: string | Buffer): void {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['-r', ...cliRunner, cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      REDSCRIPT_NO_UPDATE_CHECK: '1',
      TS_NODE_PROJECT: path.resolve(__dirname, '..', '..', '..', 'tsconfig.json'),
    },
  })
}

describe('artifact graph CLI projections', () => {
  let root: string
  let sourceFile: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-artifact-cli-'))
    sourceFile = path.join(root, 'src/cmd/pack/main.mcrs')
    write(root, 'redscript.toml', `
[project]
name = "demo"
module = "example.com/demo"
namespace = "demo"
mc-version = "26.2"
source-roots = ["src"]

[assets]
roots = ["assets"]
include = ["**/*.json", "**/*.nbt"]

[target.pack]
kind = "datapack"
entry = "example.com/demo/cmd/pack::main"
out = "dist"
default = true

[target.shell]
kind = "commands"
entry = "example.com/demo/cmd/pack::main"
out = "dist/shell.commands.json"
`)
    write(root, 'src/cmd/pack/main.mcrs', `
package pack;
resource recipe demo:toast from "recipes/toast.json";
resource structure demo:hut from "structures/hut.nbt";
export fn main(): void {}
`)
    write(root, 'assets/recipes/toast.json', JSON.stringify({
      type: 'minecraft:crafting_shapeless',
      ingredients: [],
      result: { id: 'minecraft:bread' },
    }))
    write(root, 'assets/structures/hut.nbt', Buffer.from([10, 0, 0, 0]))
  })

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  test('compile atomically replaces the complete strict project output', () => {
    write(root, 'dist/stale.txt', 'stale')

    const result = run(root, 'compile', sourceFile, '--target', 'pack')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(fs.existsSync(path.join(root, 'dist/stale.txt'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'dist/data/demo/recipe/toast.json'))).toBe(true)
    expect(fs.readFileSync(path.join(root, 'dist/data/demo/structure/hut.nbt'))).toEqual(Buffer.from([10, 0, 0, 0]))
  })

  test('failed resource validation leaves the prior strict output untouched', () => {
    write(root, 'dist/sentinel.txt', 'keep')
    write(root, 'assets/recipes/toast.json', '{')

    const result = run(root, 'compile', sourceFile, '--target', 'pack')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/invalid JSON/i)
    expect(fs.readFileSync(path.join(root, 'dist/sentinel.txt'), 'utf8')).toBe('keep')
  })

  test('publish produces deterministic mixed JSON/NBT archives from the selected project target', () => {
    const first = path.join(root, 'first.zip')
    const second = path.join(root, 'second.zip')

    const firstResult = run(root, 'publish', sourceFile, '--target', 'pack', '-o', first)
    const secondResult = run(root, 'publish', sourceFile, '--target', 'pack', '-o', second)

    expect(firstResult.status).toBe(0)
    expect(secondResult.status).toBe(0)
    const firstBytes = fs.readFileSync(first)
    expect(firstBytes).toEqual(fs.readFileSync(second))
    expect(firstBytes.includes(Buffer.from('data/demo/recipe/toast.json'))).toBe(true)
    expect(firstBytes.includes(Buffer.from('data/demo/structure/hut.nbt'))).toBe(true)
  })

  test('commands target rejects resource emission before mutating its manifest/text outputs', () => {
    write(root, 'dist/shell.commands.json', 'old manifest\n')
    write(root, 'dist/shell.commands.txt', 'old text\n')

    const result = run(root, 'compile', sourceFile, '--target', 'shell')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/resource-artifacts|RST2003/i)
    expect(fs.readFileSync(path.join(root, 'dist/shell.commands.json'), 'utf8')).toBe('old manifest\n')
    expect(fs.readFileSync(path.join(root, 'dist/shell.commands.txt'), 'utf8')).toBe('old text\n')
  })
})
