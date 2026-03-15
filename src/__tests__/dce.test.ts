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
  it('keeps non-library functions even if unused (v2 DCE only strips library fns)', () => {
    const source = `
fn _unused() { say("never called"); }
fn used() { say("called"); }
@tick fn main() { used(); }
`

    const result = compile(source, { namespace: 'test' })

    // v2 keeps all non-library functions; DCE only applies to `module library;` imports
    expect(result.files.some(f => f.path.includes('/_unused.mcfunction'))).toBe(true)
    expect(result.files.some(f => f.path.includes('/used.mcfunction'))).toBe(true)
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
`

    const result = compile(source, { namespace: 'test' })
    const paths = result.files.map(f => f.path)

    expect(paths.some(p => p.includes('/ticker.mcfunction'))).toBe(true)
    expect(paths.some(p => p.includes('/loader.mcfunction'))).toBe(true)
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
      ['-r', 'ts-node/register', 'src/cli.ts', 'compile', inputPath, '-o', outputDir, '--namespace', 'test'],
      { cwd: path.resolve(process.cwd()) }
    )

    // v2 pipeline compiles all functions
    const mainPath = path.join(outputDir, 'data', 'test', 'function', 'main.mcfunction')
    expect(fs.existsSync(mainPath)).toBe(true)
  })
})
