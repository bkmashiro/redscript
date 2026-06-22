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
})
