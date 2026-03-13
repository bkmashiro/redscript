import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'

import { compile } from '../index'

function getFileContent(files: ReturnType<typeof compile>['files'], suffix: string): string {
  const file = files.find(candidate => candidate.path.endsWith(suffix))
  if (!file) {
    throw new Error(`Missing file: ${suffix}`)
  }
  return file.content
}

describe('AST dead code elimination', () => {
  it('removes private unused functions (prefixed with _)', () => {
    const source = `
fn _unused() { say("never called"); }
fn used() { say("called"); }
@tick fn main() { used(); }
`

    const result = compile(source, { namespace: 'test' })

    // _unused is removed because it starts with _ (private) and is not called
    expect(result.ast.declarations.map(fn => fn.name)).toEqual(['used', 'main'])
    expect(result.ir.functions.some(fn => fn.name === '_unused')).toBe(false)
  })

  it('removes unused local variables from the AST body', () => {
    const source = `
fn helper() {
  let unused: int = 10;
  let used: int = 20;
  say_int(used);
}
@tick fn main() { helper(); }
`

    const result = compile(source, { namespace: 'test' })
    const helper = result.ast.declarations.find(fn => fn.name === 'helper')

    expect(helper?.body.filter(stmt => stmt.kind === 'let')).toHaveLength(1)
    expect(helper?.body.some(stmt => stmt.kind === 'let' && stmt.name === 'unused')).toBe(false)
  })

  it('removes unused constants', () => {
    const source = `
const UNUSED: int = 10;
const USED: int = 20;

@tick fn main() {
  say_int(USED);
}
`

    const result = compile(source, { namespace: 'test' })

    expect(result.ast.consts.map(constDecl => constDecl.name)).toEqual(['USED'])
  })

  it('eliminates dead branches with constant conditions', () => {
    const source = `
@tick fn main() {
  if (false) {
    say("dead code");
  } else {
    say("live code");
  }
}
`

    const result = compile(source, { namespace: 'test' })
    const output = getFileContent(result.files, 'data/test/function/main.mcfunction')

    expect(output).not.toContain('dead code')
    expect(output).toContain('live code')
  })

  it('keeps decorated entry points', () => {
    const source = `
@tick fn ticker() { }
@load fn loader() { }
@on(PlayerDeath) fn handler(player: Player) { say("event"); }
`

    const result = compile(source, { namespace: 'test' })
    const names = result.ast.declarations.map(fn => fn.name)

    expect(names).toContain('ticker')
    expect(names).toContain('loader')
    expect(names).toContain('handler')
  })

  it('can disable AST DCE through the compile API', () => {
    const source = `
fn unused() { say("never called"); }
@tick fn main() { say("live"); }
`

    const result = compile(source, { namespace: 'test', dce: false })

    expect(result.ast.declarations.map(fn => fn.name)).toEqual(['unused', 'main'])
    expect(result.ir.functions.some(fn => fn.name === 'unused')).toBe(true)
  })
})

describe('CLI --no-dce', () => {
  it('preserves unused functions when requested', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-dce-cli-'))
    const inputPath = path.join(tempDir, 'main.mcrs')
    const outputDir = path.join(tempDir, 'out')

    fs.writeFileSync(inputPath, [
      'fn unused() { say("keep me"); }',
      '@tick fn main() { say("live"); }',
      '',
    ].join('\n'))

    execFileSync(
      process.execPath,
      ['-r', 'ts-node/register', 'src/cli.ts', 'compile', inputPath, '-o', outputDir, '--namespace', 'test', '--no-dce'],
      { cwd: path.resolve(process.cwd()) }
    )

    const unusedPath = path.join(outputDir, 'data', 'test', 'function', 'unused.mcfunction')
    expect(fs.existsSync(unusedPath)).toBe(true)
  })
})
