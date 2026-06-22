import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { CheckFailedError } from '../../diagnostics'
import { compile } from '../../emit/compile'

function fileExists(files: { path: string; content: string }[], filePath: string): boolean {
  return files.some(file => file.path === filePath)
}

function getFilePaths(files: { path: string }[]): string[] {
  return files.map(file => file.path)
}

describe('emit: declared-function boundary behavior', () => {
  test('declared-only function compiles without emitting an executable definition', () => {
    const ns = 'declared_only'
    const result = compile('declare fn ext(x: int): int;', {
      namespace: ns,
    })

    const paths = getFilePaths(result.files)
    expect(result.success).toBe(true)
    expect(fileExists(result.files, `data/${ns}/function/ext.mcfunction`)).toBe(false)
    expect(paths).toContain(`data/${ns}/function/load.mcfunction`)
  })

  test('declared-only .d.mcrs path import is inlined and callable via namespaced function command', () => {
    const ns = 'declared_imported_path'
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-'))
    const declFile = path.join(tmpDir, 'declared_ext.d.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(declFile, 'declare fn ext(x: int): int;\n')
    fs.writeFileSync(mainFile, 'import "declared_ext.d.mcrs";\nfn main(): int { return ext(10); }\n')

    try {
      const result = compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: ns,
        filePath: mainFile,
      })

      const paths = getFilePaths(result.files)
      expect(result.success).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/main.mcfunction`)).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/ext.mcfunction`)).toBe(false)
      expect(paths).not.toContain(`data/${ns}/function/ext.mcfunction`)

      const mainContent = result.files.find(file => file.path === `data/${ns}/function/main.mcfunction`)?.content ?? ''
      expect(mainContent).toContain(`function ${ns}:ext`)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  test('declared-only function with executable main emits main but not declared stub', () => {
    const ns = 'declared_and_main'
    const result = compile(`
      declare fn ext(x: int): int;
      fn main(): int {
        return 1
      }
    `, {
      namespace: ns,
    })

    const paths = getFilePaths(result.files)
    expect(result.success).toBe(true)
    expect(fileExists(result.files, `data/${ns}/function/main.mcfunction`)).toBe(true)
    expect(fileExists(result.files, `data/${ns}/function/ext.mcfunction`)).toBe(false)
  })

  test('stopAfterCheck accepts call-through declared signatures in Step 4 typecheck path', () => {
    const ns = 'declared_step4_check'
    const result = compile(`
      declare fn ext(x: int): int;
      fn main(): int {
        return ext(1)
      }
    `, {
      namespace: ns,
      stopAfterCheck: true,
    })

    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(0)
  })

  test('full compile keeps declared calls as external namespaced function references', () => {
    const ns = 'declared_external_call'
    const result = compile(`
      declare fn ext(x: int): int;
      fn main(): int {
        return ext(1)
      }
    `, {
      namespace: ns,
    })

    const main = result.files.find(file => file.path === `data/${ns}/function/main.mcfunction`)
    const content = main?.content ?? ''
    expect(fileExists(result.files, `data/${ns}/function/ext.mcfunction`)).toBe(false)
    expect(content).toContain(`function ${ns}:ext`)
    // Preserve this behavior in this slice: declared function calls are treated as external
    // namespaced calls when no implementation is available.
  })

  test('imported declaration argument mismatch fails with declaration-aware type diagnostics', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-bad-'))
    const declFile = path.join(tmpDir, 'bad_ext.d.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(declFile, 'declare fn ext(x: int, y: int): int;\n')
    fs.writeFileSync(mainFile, 'import "bad_ext.d.mcrs";\nfn main(): int { return ext(1); }\n')

    let err: CheckFailedError | undefined
    try {
      compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: 'declared_imported_bad',
        filePath: mainFile,
        stopAfterCheck: true,
      })
    } catch (e) {
      if (e instanceof CheckFailedError) err = e
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }

    expect(err).toBeDefined()
    expect(err!.diagnostics[0].message).toContain("Function 'ext' expects 2 arguments, got 1")
  })
})
