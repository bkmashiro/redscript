/**
 * Branch coverage tests for src/compile.ts
 *
 * Targets uncovered branches in:
 * - preprocessSourceWithMetadata: import without filePath, unresolvable import,
 *   isLibrarySource detection, library vs non-library imports, resolveSourceLine,
 *   offsetRanges, countLines
 * - resolveImportPath: .mcrs extension, relative path, stdlib path, includeDirs
 * - preprocessSource (wrapper)
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  preprocessSourceWithMetadata,
  preprocessSource,
  resolveSourceLine,
} from '../compile'

// ---------------------------------------------------------------------------
// resolveSourceLine
// ---------------------------------------------------------------------------

describe('resolveSourceLine', () => {
  const ranges = [
    { startLine: 1, endLine: 10, filePath: 'a.mcrs' },
    { startLine: 11, endLine: 20, filePath: 'b.mcrs' },
  ]

  test('maps line in first range to first file', () => {
    const result = resolveSourceLine(5, ranges)
    expect(result.filePath).toBe('a.mcrs')
    expect(result.line).toBe(5)
  })

  test('maps line in second range to second file', () => {
    const result = resolveSourceLine(15, ranges)
    expect(result.filePath).toBe('b.mcrs')
    expect(result.line).toBe(5)
  })

  test('line outside ranges uses fallback file', () => {
    const result = resolveSourceLine(99, ranges, 'fallback.mcrs')
    expect(result.filePath).toBe('fallback.mcrs')
    expect(result.line).toBe(99)
  })

  test('line outside ranges with no fallback', () => {
    const result = resolveSourceLine(99, ranges)
    expect(result.filePath).toBeUndefined()
    expect(result.line).toBe(99)
  })

  test('empty ranges uses fallback', () => {
    const result = resolveSourceLine(5, [], 'default.mcrs')
    expect(result.filePath).toBe('default.mcrs')
    expect(result.line).toBe(5)
  })

  test('boundary line (startLine) maps correctly', () => {
    const result = resolveSourceLine(1, ranges)
    expect(result.filePath).toBe('a.mcrs')
    expect(result.line).toBe(1)
  })

  test('boundary line (endLine) maps correctly', () => {
    const result = resolveSourceLine(10, ranges)
    expect(result.filePath).toBe('a.mcrs')
    expect(result.line).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — basic (no imports)
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — no imports', () => {
  test('simple source returns unchanged source', () => {
    const result = preprocessSourceWithMetadata('fn f() { }')
    expect(result.source).toContain('fn f()')
  })

  test('empty source returns empty', () => {
    const result = preprocessSourceWithMetadata('')
    expect(result.source).toBe('')
    expect(result.ranges).toEqual([])
  })

  test('returns no libraryImports when none present', () => {
    const result = preprocessSourceWithMetadata('fn f() { }')
    expect(result.libraryImports).toBeUndefined()
  })

  test('includes filePath in ranges when provided', () => {
    const result = preprocessSourceWithMetadata('fn f() { }', { filePath: 'test.mcrs' })
    expect(result.ranges.length).toBeGreaterThan(0)
    expect(result.ranges[0].filePath).toContain('test.mcrs')
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — import without filePath throws
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — import without filePath', () => {
  test('throws ParseError when import used without filePath', () => {
    const source = `import "stdlib/math";
fn f(): int { return 1; }
`
    expect(() => preprocessSourceWithMetadata(source)).toThrow(/ParseError|Import statements require/)
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — unresolvable import
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — unresolvable import', () => {
  test('throws ParseError when import path cannot be resolved', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-test-'))
    const mainFile = path.join(tmpDir, 'main.mcrs')
    fs.writeFileSync(mainFile, `import "nonexistent_module_xyz";\nfn f(): int { return 1; }\n`)

    try {
      expect(() =>
        preprocessSourceWithMetadata(fs.readFileSync(mainFile, 'utf-8'), { filePath: mainFile })
      ).toThrow(/Cannot import|nonexistent_module_xyz/)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — library source detection
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — library source', () => {
  test('isLibrarySource: module library at top is recognized as library', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-lib-'))
    const libFile = path.join(tmpDir, 'mylib.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(libFile, `module library;\nfn lib_fn(): int { return 42; }\n`)
    fs.writeFileSync(mainFile, `import "mylib";\nfn main(): int { return lib_fn(); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile }
      )
      // Library imports should be collected separately
      expect(result.libraryImports).toBeDefined()
      expect(result.libraryImports!.length).toBeGreaterThan(0)
      expect(result.libraryImports![0].source).toContain('module library')
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  test('isLibrarySource: source with only comments before module library', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-lib2-'))
    const libFile = path.join(tmpDir, 'commented_lib.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    // Comments before module declaration
    fs.writeFileSync(libFile, `// This is a library\n// Usage: import this\n\nmodule library;\nfn helper(): int { return 1; }\n`)
    fs.writeFileSync(mainFile, `import "commented_lib";\nfn main(): int { return helper(); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile }
      )
      expect(result.libraryImports).toBeDefined()
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  test('non-library import is concatenated into source', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-nolib-'))
    const modFile = path.join(tmpDir, 'helpers.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    // No "module library" declaration
    fs.writeFileSync(modFile, `fn helper(): int { return 99; }\n`)
    fs.writeFileSync(mainFile, `import "helpers";\nfn main(): int { return helper(); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile }
      )
      // Should be concatenated (no libraryImports)
      expect(result.libraryImports).toBeUndefined()
      expect(result.source).toContain('fn helper()')
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — stdlib import
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — stdlib imports', () => {
  test('stdlib/math import resolves correctly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-stdlib-'))
    const mainFile = path.join(tmpDir, 'main.mcrs')
    fs.writeFileSync(mainFile, `import "stdlib/math";\nfn f(): int { return abs(-5); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile }
      )
      // math.mcrs is a library, so it goes to libraryImports
      expect(result.libraryImports).toBeDefined()
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — includeDirs
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — includeDirs', () => {
  test('includeDirs resolves imports from extra directories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-extra-'))
    const extraDir = path.join(tmpDir, 'extra')
    fs.mkdirSync(extraDir)
    const mainFile = path.join(tmpDir, 'main.mcrs')
    const libFile = path.join(extraDir, 'custom_lib.mcrs')

    fs.writeFileSync(libFile, `fn custom(): int { return 77; }\n`)
    fs.writeFileSync(mainFile, `import "custom_lib";\nfn f(): int { return custom(); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile, includeDirs: [extraDir] }
      )
      expect(result.source).toContain('fn custom()')
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — duplicate import deduplication
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — deduplication', () => {
  test('same file imported twice is only included once', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-dup-'))
    const libFile = path.join(tmpDir, 'dup.mcrs')
    const mod1File = path.join(tmpDir, 'mod1.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(libFile, `fn shared(): int { return 1; }\n`)
    fs.writeFileSync(mod1File, `import "dup";\nfn from_mod1(): int { return shared(); }\n`)
    fs.writeFileSync(mainFile, `import "dup";\nimport "mod1";\nfn main(): int { return from_mod1(); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile }
      )
      // dup.mcrs should only appear once in source
      const dupCount = (result.source.match(/fn shared\(\)/g) ?? []).length
      expect(dupCount).toBe(1)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — .mcrs extension handling
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — extension handling', () => {
  test('import with explicit .mcrs extension resolves', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-ext-'))
    const libFile = path.join(tmpDir, 'withext.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(libFile, `fn ext_fn(): int { return 5; }\n`)
    fs.writeFileSync(mainFile, `import "withext.mcrs";\nfn f(): int { return ext_fn(); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile }
      )
      expect(result.source).toContain('fn ext_fn()')
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// preprocessSourceWithMetadata — ranges include library transitive imports
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — transitive library imports', () => {
  test('transitive library imports are collected', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-trans-'))
    const innerLib = path.join(tmpDir, 'inner.mcrs')
    const outerLib = path.join(tmpDir, 'outer.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(innerLib, `module library;\nfn inner(): int { return 1; }\n`)
    fs.writeFileSync(outerLib, `module library;\nimport "inner";\nfn outer(): int { return inner(); }\n`)
    fs.writeFileSync(mainFile, `import "outer";\nfn main(): int { return outer(); }\n`)

    try {
      const result = preprocessSourceWithMetadata(
        fs.readFileSync(mainFile, 'utf-8'),
        { filePath: mainFile }
      )
      // Both library files should be collected
      expect(result.libraryImports).toBeDefined()
      expect(result.libraryImports!.length).toBeGreaterThanOrEqual(1)
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// countLines — CRLF normalization
// ---------------------------------------------------------------------------

describe('preprocessSourceWithMetadata — CRLF line ending normalization', () => {
  test('CRLF source produces same line count as LF source', () => {
    const lf = 'fn f() { }\nfn g() { }\nfn h() { }'
    const crlf = 'fn f() { }\r\nfn g() { }\r\nfn h() { }'

    const lfResult = preprocessSourceWithMetadata(lf, { filePath: 'test.mcrs' })
    const crlfResult = preprocessSourceWithMetadata(crlf, { filePath: 'test.mcrs' })

    expect(crlfResult.ranges[0].endLine).toBe(lfResult.ranges[0].endLine)
  })

  test('single CRLF line is counted as two lines, same as LF', () => {
    const lf = 'fn f() { }\nfn g() { }'
    const crlf = 'fn f() { }\r\nfn g() { }'

    const lfResult = preprocessSourceWithMetadata(lf, { filePath: 'test.mcrs' })
    const crlfResult = preprocessSourceWithMetadata(crlf, { filePath: 'test.mcrs' })

    expect(crlfResult.ranges[0].endLine).toBe(lfResult.ranges[0].endLine)
  })

  test('CRLF-only source has correct range line count with imports', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-crlf-'))
    const libFile = path.join(tmpDir, 'crlflib.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(libFile, 'fn lib_fn(): int { return 1; }\n')
    // Write main with CRLF line endings
    fs.writeFileSync(mainFile, 'import "crlflib";\r\nfn main(): int { return lib_fn(); }\r\n')

    try {
      const source = fs.readFileSync(mainFile, 'utf-8')
      const crlfResult = preprocessSourceWithMetadata(source, { filePath: mainFile })

      // Rewrite main with LF to compare
      const lfSource = source.replace(/\r\n/g, '\n')
      const lfResult = preprocessSourceWithMetadata(lfSource, { filePath: mainFile })

      expect(crlfResult.ranges.length).toBe(lfResult.ranges.length)
      crlfResult.ranges.forEach((range, i) => {
        expect(range.endLine).toBe(lfResult.ranges[i].endLine)
      })
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})

// ---------------------------------------------------------------------------
// preprocessSource (wrapper)
// ---------------------------------------------------------------------------

describe('preprocessSource', () => {
  test('returns source string same as preprocessSourceWithMetadata.source', () => {
    const source = 'fn f(): int { return 0; }'
    const result = preprocessSource(source)
    const meta = preprocessSourceWithMetadata(source)
    expect(result).toBe(meta.source)
  })

  test('accepts options', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-wrap-'))
    const libFile = path.join(tmpDir, 'wraplib.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')

    fs.writeFileSync(libFile, `fn wrap(): int { return 7; }\n`)
    fs.writeFileSync(mainFile, `import "wraplib";\nfn f(): int { return wrap(); }\n`)

    try {
      const source = fs.readFileSync(mainFile, 'utf-8')
      const result = preprocessSource(source, { filePath: mainFile })
      expect(result).toContain('fn wrap()')
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})
