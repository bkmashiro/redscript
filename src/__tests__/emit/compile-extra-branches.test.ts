/**
 * Extra targeted tests to push compile.ts branch coverage above 85%.
 *
 * Targets remaining uncovered branches:
 * - B9: default-arg (options = {} when called with no second arg)
 * - B10: default-arg (namespace = 'redscript' when not provided)
 * - B24/B25: mergeWholeModuleImport parse error (file import with bad syntax)
 * - B32/B33: libraryImports parse error (library import with bad syntax)
 * - B63: budget diagnostic level === 'error'
 * - B69: stopAfterCheck + caught CheckFailedError → re-throw as-is
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { compile } from '../../emit/compile'
import { CheckFailedError } from '../../diagnostics'

// ---------------------------------------------------------------------------
// B9 + B10: call compile() with no second arg / without namespace
// ---------------------------------------------------------------------------

describe('compile.ts default arg branches', () => {
  test('B9: compile called with no options arg uses default {} → succeeds', () => {
    // Branch 9: the default `options = {}` is used (i.e. no second arg)
    const result = compile('fn f(): int { return 1; }')
    expect(result.success).toBe(true)
    expect(result.files.length).toBeGreaterThan(0)
    // default namespace is 'redscript'
    expect(result.files.some(f => f.path.includes('redscript'))).toBe(true)
  })

  test('B10: compile called without namespace uses default "redscript"', () => {
    // Branch 10: namespace defaults to 'redscript' when not provided
    // We provide options but omit namespace
    const result = compile('fn f(): int { return 2; }', { stopAfterCheck: false })
    expect(result.success).toBe(true)
    expect(result.files.some(f => f.path.includes('redscript'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// B24/B25: mergeWholeModuleImport parse error
//   When a whole-module import file has invalid syntax, the parse error is thrown
//   Branch 24: if (modParser.parseErrors.length > 0) → true
//   Branch 25: throw stopAfterCheck ? DiagnosticBundleError : parseErrors[0]
//     - B25 arm 0 (stopAfterCheck=true): throws DiagnosticBundleError → wrapped in CheckFailedError
//     - B25 arm 1 (stopAfterCheck=false): throws parseErrors[0]
// ---------------------------------------------------------------------------

describe('compile.ts mergeWholeModuleImport parse error (B24/B25)', () => {
  let tempDir: string
  let mainPath: string
  let badModPath: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-b24-'))
    mainPath = path.join(tempDir, 'main.mcrs')
    badModPath = path.join(tempDir, 'bad_mod.mcrs')

    // Write a bad module (invalid syntax)
    fs.writeFileSync(badModPath, 'fn broken_syntax( { return 1; }\n')

    // Write main that imports the bad module with whole-module import
    // `import bad_mod;` (no ::) → symbol=undefined → mergeWholeModuleImport
    fs.writeFileSync(mainPath, 'import bad_mod;\nfn main(): int { return 0; }\n')
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('B24+B25 arm1: whole-module import parse error (no stopAfterCheck) → throws raw parse error', () => {
    // Branch 24: true path (parse errors > 0)
    // Branch 25: arm 1 (stopAfterCheck=false) → throws parseErrors[0]
    expect(() =>
      compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'b24_nosac',
        filePath: mainPath,
      })
    ).toThrow()
  })

  test('B24+B25 arm0: whole-module import parse error (stopAfterCheck=true) → throws CheckFailedError', () => {
    // Branch 24: true path (parse errors > 0)
    // Branch 25: arm 0 (stopAfterCheck=true) → throws DiagnosticBundleError → wrapped in CheckFailedError
    expect(() =>
      compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'b24_sac',
        filePath: mainPath,
        stopAfterCheck: true,
      })
    ).toThrow(CheckFailedError)
  })
})

// ---------------------------------------------------------------------------
// B32/B33: libraryImports parse error
//   When a file referenced via file-system `import "file.mcrs";` has:
//     `module library;` declaration → goes to libraryImports array
//   Then if that library file has parse errors → Branch 32/33 fires
//   Branch 32: if (libParser.parseErrors.length > 0)
//   Branch 33: throw stopAfterCheck ? DiagnosticBundleError : parseErrors[0]
// ---------------------------------------------------------------------------

describe('compile.ts libraryImports parse error (B32/B33)', () => {
  let tempDir: string
  let mainPath: string
  let badLibPath: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-b32-'))
    mainPath = path.join(tempDir, 'main.mcrs')
    badLibPath = path.join(tempDir, 'mylib.mcrs')

    // Write a library file with module library; but broken syntax
    fs.writeFileSync(badLibPath, 'module library;\nfn broken( { return 1; }\n')

    // Write main that imports the library file (file-path import triggers libraryImports path)
    // The preprocessor finds `module library;` in the imported file → puts it in libraryImports
    fs.writeFileSync(mainPath, 'import "mylib";\nfn main(): int { return 0; }\n')
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('B32+B33 arm1: library import parse error (no stopAfterCheck) → throws raw parse error', () => {
    expect(() =>
      compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'b32_nosac',
        filePath: mainPath,
      })
    ).toThrow()
  })

  test('B32+B33 arm0: library import parse error (stopAfterCheck=true) → throws CheckFailedError', () => {
    expect(() =>
      compile(fs.readFileSync(mainPath, 'utf-8'), {
        namespace: 'b32_sac',
        filePath: mainPath,
        stopAfterCheck: true,
      })
    ).toThrow(CheckFailedError)
  })
})

// ---------------------------------------------------------------------------
// B63: budget diagnostic with level 'error' → throws DiagnosticError
// ---------------------------------------------------------------------------

describe('compile.ts budget error level (B63) via mock', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  afterEach(() => {
    jest.resetModules()
  })

  test('B63: analyzeBudget returning error level throws DiagnosticError', () => {
    jest.isolateModules(() => {
      jest.doMock('../../lir/budget', () => ({
        analyzeBudget: jest.fn(() => [
          { level: 'error', message: 'tick budget exceeded' },
        ]),
      }))

      const { compile: compileFresh } = require('../../emit/compile')
      let thrown: unknown
      try {
        compileFresh('fn f(): int { return 0; }', { namespace: 'b63_budget' })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeDefined()
      expect((thrown as Error).name).toBe('DiagnosticError')
    })
  })
})

// ---------------------------------------------------------------------------
// B69: stopAfterCheck + CheckFailedError in catch → re-throw as-is
//   This fires when err instanceof CheckFailedError in the catch block AND stopAfterCheck=true
//   A CheckFailedError can only arrive here if something inside the try block throws it.
//   lowerToHIR, lowerToMIR, etc. can throw one if mocked to do so.
// ---------------------------------------------------------------------------

describe('compile.ts catch block: B69 stopAfterCheck + CheckFailedError re-throw', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  afterEach(() => {
    jest.resetModules()
  })

  test('B69: stopAfterCheck + CheckFailedError thrown inside → re-throw unchanged', () => {
    jest.isolateModules(() => {
      jest.doMock('../../hir/lower', () => ({
        lowerToHIR: jest.fn(() => {
          const { CheckFailedError: CFE, DiagnosticError: DE } = require('../../diagnostics')
          throw new CFE(
            [new DE('LoweringError', 'injected check-failed error', { line: 1, col: 1 })],
            ['prior warning'],
          )
        }),
      }))

      const { compile: compileFresh } = require('../../emit/compile')
      let thrown: unknown
      try {
        compileFresh('fn f(): int { return 0; }', {
          namespace: 'b69_cfe',
          stopAfterCheck: true,
        })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeDefined()
      expect((thrown as Error).name).toBe('CheckFailedError')
      // The original CheckFailedError is re-thrown unchanged (B69 path)
      // vs. a new CheckFailedError being created (B70/B71 paths)
      // We can verify it has the original warnings
      expect((thrown as CheckFailedError).warnings).toEqual(['prior warning'])
    })
  })
})
