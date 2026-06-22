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

  test('module-library .d.mcrs path import preserves declaredFunctions and does not emit declaration file', () => {
    const ns = 'declared_imported_module_library'
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-lib-'))
    const declFile = path.join(tmpDir, 'declared_ext.d.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(
      declFile,
      'module library;\n' +
      'declare fn ext(x: int): int;\n',
    )
    fs.writeFileSync(
      mainFile,
      'import "declared_ext.d.mcrs";\nfn main(): int { return ext(1); }\n',
    )

    try {
      const result = compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: ns,
        filePath: mainFile,
      })

      const paths = getFilePaths(result.files)
      const main = result.files.find(file => file.path === `data/${ns}/function/main.mcfunction`)
      const mainContent = main?.content ?? ''

      expect(result.success).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/main.mcfunction`)).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/ext.mcfunction`)).toBe(false)
      expect(paths).not.toContain(`data/${ns}/function/ext.mcfunction`)
      expect(mainContent).toContain(`function ${ns}:ext`)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  test('symbol import from module file injects declaration signatures for arity/type checking', () => {
    const ns = 'declared_imported_symbol'
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-symbol-ok-'))
    const declFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(
      declFile,
      'module api;\n' +
      'declare fn ext(x: int, y: int): int;\n',
    )
    fs.writeFileSync(
      mainFile,
      'import api::ext;\n' +
      'fn main(): int { return ext(1, 2); }\n',
    )

    try {
      const result = compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: ns,
        filePath: mainFile,
        includeDirs: [tmpDir],
      })

      expect(result.success).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/main.mcfunction`)).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/ext.mcfunction`)).toBe(false)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  test('symbol import arity mismatch against module declaration is reported as type error', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-symbol-bad-'))
    const declFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(
      declFile,
      'module api;\n' +
      'declare fn ext(x: int, y: int): int;\n',
    )
    fs.writeFileSync(
      mainFile,
      'import api::ext;\n' +
      'fn main(): int { return ext(1); }\n',
    )

    let err: CheckFailedError | undefined
    try {
      compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: 'declared_imported_symbol_bad',
        filePath: mainFile,
        includeDirs: [tmpDir],
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

  test('wildcard module import from module file injects declaration signatures for arity/type checking', () => {
    const ns = 'declared_imported_wildcard'
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-wildcard-ok-'))
    const declFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(
      declFile,
      'module api;\n' +
      'declare fn ext(x: int, y: int): int;\n',
    )
    fs.writeFileSync(
      mainFile,
      'import api::*;\n' +
      'fn main(): int { return ext(1, 2); }\n',
    )

    try {
      const result = compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: ns,
        filePath: mainFile,
        includeDirs: [tmpDir],
      })

      expect(result.success).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/main.mcfunction`)).toBe(true)
      expect(fileExists(result.files, `data/${ns}/function/ext.mcfunction`)).toBe(false)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  test('wildcard module declaration import arity mismatch is reported as type error', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-wildcard-bad-'))
    const declFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(
      declFile,
      'module api;\n' +
      'declare fn ext(x: int, y: int): int;\n',
    )
    fs.writeFileSync(
      mainFile,
      'import api::*;\n' +
      'fn main(): int { return ext(1); }\n',
    )

    let err: CheckFailedError | undefined
    try {
      compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: 'declared_imported_wildcard_bad',
        filePath: mainFile,
        includeDirs: [tmpDir],
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

  test('module-library imported declaration arity mismatch fails with declaration-aware diagnostics', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-lib-bad-'))
    const declFile = path.join(tmpDir, 'bad_ext.d.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(declFile, 'module library;\ndeclare fn ext(x: int, y: int): int;\n')
    fs.writeFileSync(mainFile, 'import "bad_ext.d.mcrs";\nfn main(): int { return ext(1); }\n')

    let err: CheckFailedError | undefined
    try {
      compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: 'declared_imported_library_bad',
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

  test('whole-module imported declaration arity mismatch fails with declaration-aware diagnostics', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-bad-'))
    const declFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(declFile, 'module api;\ndeclare fn ext(x: int, y: int): int;\n')
    fs.writeFileSync(mainFile, 'import api;\nfn main(): int { return ext(1); }\n')

    let err: CheckFailedError | undefined
    try {
      compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: 'declared_imported_whole_bad',
        filePath: mainFile,
        includeDirs: [tmpDir],
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

  test('nested whole-module imports propagate declared function signatures for arity validation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-nested-bad-'))
    const apiPath = path.join(tmpDir, 'api.mcrs')
    const utilPath = path.join(tmpDir, 'util.mcrs')
    const mainPath = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(apiPath, 'module api;\ndeclare fn ext(x: int, y: int): int;\n')
    fs.writeFileSync(utilPath, 'module util;\nimport api;\n')
    fs.writeFileSync(mainPath, 'import util;\nfn main(): int { return ext(1); }\n')

    let err: CheckFailedError | undefined
    try {
      compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'declared_imported_nested_bad',
        filePath: mainPath,
        includeDirs: [tmpDir],
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

  test('executable signature wins over declaration stub in whole-module import graph', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-precedence-'))
    const apiPath = path.join(tmpDir, 'api.mcrs')
    const utilPath = path.join(tmpDir, 'util.mcrs')
    const mainPath = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(apiPath, 'module api;\ndeclare fn ext(x: int): int;\n')
    fs.writeFileSync(utilPath, 'module util;\nimport api;\nfn ext(x: string): int { return 1; }\n')
    fs.writeFileSync(mainPath, 'import util;\nfn main(): int { return ext("ok"); }\n')

    let result: ReturnType<typeof compile>
    try {
      result = compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'declared_imported_precedence_ok',
        filePath: mainPath,
        includeDirs: [tmpDir],
        stopAfterCheck: true,
      })
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }

    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(0)
  })

  test('declared function stub imported before executable whole-module implementation wins for later import', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-precedence-ordered-'))
    const apiDeclPath = path.join(tmpDir, 'api_decl.mcrs')
    const apiImplPath = path.join(tmpDir, 'api_impl.mcrs')
    const mainPath = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(apiDeclPath, 'module api_decl;\ndeclare fn ext(x: int): int;\n')
    fs.writeFileSync(apiImplPath, 'module api_impl;\nfn ext(x: string): int { return 1; }\n')
    fs.writeFileSync(mainPath, 'import api_decl;\nimport api_impl;\nfn main(): int { return ext("ok"); }\n')

    let result: ReturnType<typeof compile>
    try {
      result = compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'declared_imported_precedence_ordered_ok',
        filePath: mainPath,
        includeDirs: [tmpDir],
        stopAfterCheck: true,
      })
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }

    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(0)
  })

  test('declared function stub imported before executable whole-module implementation uses executable signature in diagnostics', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-precedence-ordered-bad-'))
    const apiDeclPath = path.join(tmpDir, 'api_decl.mcrs')
    const apiImplPath = path.join(tmpDir, 'api_impl.mcrs')
    const mainPath = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(apiDeclPath, 'module api_decl;\ndeclare fn ext(x: int): int;\n')
    fs.writeFileSync(apiImplPath, 'module api_impl;\nfn ext(x: string): int { return 1; }\n')
    fs.writeFileSync(mainPath, 'import api_decl;\nimport api_impl;\nfn main(): int { return ext(1); }\n')

    let err: CheckFailedError | undefined
    try {
      compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'declared_imported_precedence_ordered_bad',
        filePath: mainPath,
        includeDirs: [tmpDir],
        stopAfterCheck: true,
      })
    } catch (e) {
      if (e instanceof CheckFailedError) err = e
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }

    expect(err).toBeDefined()
    expect(err!.diagnostics[0].message).toContain('Argument 1 of \'ext\' expects string, got int')
  })

  test('whole-module imported declaration typechecks and emits only call sites, never the declaration body', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-decl-import-ok-'))
    const declFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(declFile, 'module api;\ndeclare fn ext(x: int): int;\n')
    fs.writeFileSync(mainFile, 'import api;\nfn main(): int { return ext(1); }\n')

    try {
      const result = compile(fs.readFileSync(mainFile, 'utf-8'), {
        namespace: 'declared_imported_whole_ok',
        filePath: mainFile,
        includeDirs: [tmpDir],
      })

      const main = result.files.find(file => file.path === `data/declared_imported_whole_ok/function/main.mcfunction`)
      const mainContent = main?.content ?? ''

      expect(result.success).toBe(true)
      expect(fileExists(result.files, `data/declared_imported_whole_ok/function/main.mcfunction`)).toBe(true)
      expect(fileExists(result.files, `data/declared_imported_whole_ok/function/ext.mcfunction`)).toBe(false)
      expect(mainContent).toContain(`function declared_imported_whole_ok:ext`)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})
