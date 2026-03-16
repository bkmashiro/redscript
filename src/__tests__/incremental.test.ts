/**
 * Tests for incremental compilation: FileCache, DependencyGraph, and
 * compileIncremental.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { FileCache, hashFile } from '../cache/index'
import { DependencyGraph, parseImports } from '../cache/deps'
import { compileIncremental, resetCompileCache } from '../cache/incremental'

/** Create a temp directory for test files. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-test-'))
}

/** Write a .mcrs file and return its absolute path. */
function writeFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

// ---------------------------------------------------------------------------
// FileCache
// ---------------------------------------------------------------------------

describe('FileCache', () => {
  let tmpDir: string
  let cacheDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cacheDir = path.join(tmpDir, '.redscript-cache')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('hashFile returns consistent SHA-256 hex', () => {
    const f = writeFile(tmpDir, 'a.mcrs', 'fn main() {}')
    const h1 = hashFile(f)
    const h2 = hashFile(f)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  test('hashFile changes when file content changes', () => {
    const f = writeFile(tmpDir, 'a.mcrs', 'fn main() {}')
    const h1 = hashFile(f)
    fs.writeFileSync(f, 'fn main() { let x: int = 1; }')
    const h2 = hashFile(f)
    expect(h1).not.toBe(h2)
  })

  test('hasChanged returns true for unknown file', () => {
    const cache = new FileCache(cacheDir)
    const f = writeFile(tmpDir, 'a.mcrs', 'fn main() {}')
    expect(cache.hasChanged(f)).toBe(true)
  })

  test('hasChanged returns false after update', () => {
    const cache = new FileCache(cacheDir)
    const f = writeFile(tmpDir, 'a.mcrs', 'fn main() {}')
    cache.update(f)
    expect(cache.hasChanged(f)).toBe(false)
  })

  test('hasChanged returns true after file modification', () => {
    const cache = new FileCache(cacheDir)
    const f = writeFile(tmpDir, 'a.mcrs', 'fn main() {}')
    cache.update(f)
    // Modify file (need to change mtime)
    const now = Date.now()
    fs.utimesSync(f, new Date(now + 2000), new Date(now + 2000))
    fs.writeFileSync(f, 'fn main() { let x: int = 42; }')
    expect(cache.hasChanged(f)).toBe(true)
  })

  test('save and load persists hashes', () => {
    const cache = new FileCache(cacheDir)
    const f = writeFile(tmpDir, 'a.mcrs', 'fn main() {}')
    cache.update(f)
    cache.save()

    const cache2 = new FileCache(cacheDir)
    cache2.load()
    // File hasn't changed — should still be cached
    expect(cache2.hasChanged(f)).toBe(false)
  })

  test('load handles missing cache gracefully', () => {
    const cache = new FileCache(cacheDir)
    cache.load() // no file — should not throw
    expect(cache.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// DependencyGraph
// ---------------------------------------------------------------------------

describe('DependencyGraph', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('parseImports extracts import paths', () => {
    const f = writeFile(tmpDir, 'main.mcrs', [
      'import "lib.mcrs";',
      'import "util.mcrs";',
      '',
      'fn main() {}',
    ].join('\n'))
    const imports = parseImports(f)
    expect(imports).toHaveLength(2)
    expect(imports[0]).toBe(path.resolve(tmpDir, 'lib.mcrs'))
    expect(imports[1]).toBe(path.resolve(tmpDir, 'util.mcrs'))
  })

  test('parseImports stops at non-import line', () => {
    const f = writeFile(tmpDir, 'main.mcrs', [
      'import "lib.mcrs";',
      'fn main() {}',
      'import "late.mcrs";',  // should NOT be parsed
    ].join('\n'))
    const imports = parseImports(f)
    expect(imports).toHaveLength(1)
  })

  test('parseImports skips comments and blank lines in header', () => {
    const f = writeFile(tmpDir, 'main.mcrs', [
      '// Main file',
      '',
      'import "lib.mcrs";',
      '',
      'fn main() {}',
    ].join('\n'))
    const imports = parseImports(f)
    expect(imports).toHaveLength(1)
  })

  test('getDirectDeps returns direct imports', () => {
    writeFile(tmpDir, 'lib.mcrs', 'fn helper() {}')
    const main = writeFile(tmpDir, 'main.mcrs', 'import "lib.mcrs";\nfn main() {}')
    const graph = new DependencyGraph()
    graph.addFile(main)
    const deps = graph.getDirectDeps(main)
    expect(deps.size).toBe(1)
    expect(deps.has(path.resolve(tmpDir, 'lib.mcrs'))).toBe(true)
  })

  test('getTransitiveDeps follows transitive imports', () => {
    const c = writeFile(tmpDir, 'c.mcrs', 'fn c() {}')
    const b = writeFile(tmpDir, 'b.mcrs', 'import "c.mcrs";\nfn b() {}')
    const a = writeFile(tmpDir, 'a.mcrs', 'import "b.mcrs";\nfn a() {}')

    const graph = new DependencyGraph()
    graph.addFile(a)
    graph.addFile(b)
    graph.addFile(c)

    const deps = graph.getTransitiveDeps(a)
    expect(deps.has(path.resolve(tmpDir, 'b.mcrs'))).toBe(true)
    expect(deps.has(path.resolve(tmpDir, 'c.mcrs'))).toBe(true)
  })

  test('getDependents returns reverse dependents', () => {
    writeFile(tmpDir, 'lib.mcrs', 'fn helper() {}')
    const main1 = writeFile(tmpDir, 'main1.mcrs', 'import "lib.mcrs";\nfn main1() {}')
    const main2 = writeFile(tmpDir, 'main2.mcrs', 'import "lib.mcrs";\nfn main2() {}')

    const graph = new DependencyGraph()
    graph.addFile(main1)
    graph.addFile(main2)

    const dependents = graph.getDependents(path.resolve(tmpDir, 'lib.mcrs'))
    expect(dependents.has(path.resolve(tmpDir, 'main1.mcrs'))).toBe(true)
    expect(dependents.has(path.resolve(tmpDir, 'main2.mcrs'))).toBe(true)
  })

  test('computeDirtySet includes changed files and their dependents', () => {
    const lib = writeFile(tmpDir, 'lib.mcrs', 'fn helper() {}')
    const main = writeFile(tmpDir, 'main.mcrs', 'import "lib.mcrs";\nfn main() {}')
    const other = writeFile(tmpDir, 'other.mcrs', 'fn other() {}')

    const graph = new DependencyGraph()
    graph.addFile(main)
    graph.addFile(other)

    const dirty = graph.computeDirtySet(new Set([lib]))
    expect(dirty.has(path.resolve(tmpDir, 'lib.mcrs'))).toBe(true)
    expect(dirty.has(path.resolve(tmpDir, 'main.mcrs'))).toBe(true)
    expect(dirty.has(path.resolve(tmpDir, 'other.mcrs'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// compileIncremental (end-to-end)
// ---------------------------------------------------------------------------

describe('compileIncremental', () => {
  let tmpDir: string
  let cacheDir: string
  let outDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cacheDir = path.join(tmpDir, '.redscript-cache')
    outDir = path.join(tmpDir, 'out')
    resetCompileCache()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('first compile: all files compiled (cache miss)', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a_func() { let x: int = 1; }')
    const b = writeFile(tmpDir, 'b.mcrs', 'fn b_func() { let y: int = 2; }')

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    const result = compileIncremental([a, b], cache, depGraph, {
      output: outDir,
    })

    expect(result.recompiled).toBe(2)
    expect(result.cached).toBe(0)
    expect(result.errors.size).toBe(0)
  })

  test('second compile (no changes): all files cached', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a_func() { let x: int = 1; }')
    const b = writeFile(tmpDir, 'b.mcrs', 'fn b_func() { let y: int = 2; }')

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile
    compileIncremental([a, b], cache, depGraph, { output: outDir })

    // Second compile — no changes
    const result = compileIncremental([a, b], cache, depGraph, { output: outDir })

    expect(result.recompiled).toBe(0)
    expect(result.cached).toBe(2)
    expect(result.errors.size).toBe(0)
  })

  test('modify one file: only that file recompiled', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a_func() { let x: int = 1; }')
    const b = writeFile(tmpDir, 'b.mcrs', 'fn b_func() { let y: int = 2; }')

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile
    compileIncremental([a, b], cache, depGraph, { output: outDir })

    // Modify file a
    fs.writeFileSync(a, 'fn a_func() { let x: int = 42; }')
    // Ensure mtime changes
    const now = Date.now()
    fs.utimesSync(a, new Date(now + 2000), new Date(now + 2000))

    const result = compileIncremental([a, b], cache, depGraph, { output: outDir })

    expect(result.recompiled).toBe(1)
    expect(result.cached).toBe(1)
    expect(result.errors.size).toBe(0)
  })

  test('modify dependency: all dependent files recompiled', () => {
    const lib = writeFile(tmpDir, 'lib.mcrs', 'fn helper() { let h: int = 0; }')
    const main1 = writeFile(tmpDir, 'main1.mcrs', 'import "lib.mcrs";\nfn main1() { helper(); }')
    const main2 = writeFile(tmpDir, 'main2.mcrs', 'import "lib.mcrs";\nfn main2() { helper(); }')
    const other = writeFile(tmpDir, 'other.mcrs', 'fn other() { let o: int = 0; }')

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile
    compileIncremental([main1, main2, other], cache, depGraph, { output: outDir })
    expect(cache.get(path.resolve(main1))).toBeDefined()

    // Modify lib (a dependency, not an entry file itself)
    fs.writeFileSync(lib, 'fn helper() { let h: int = 99; }')
    const now = Date.now()
    fs.utimesSync(lib, new Date(now + 2000), new Date(now + 2000))

    const result = compileIncremental([main1, main2, other], cache, depGraph, { output: outDir })

    // main1 and main2 depend on lib → recompiled; other is unrelated → cached
    expect(result.recompiled).toBe(2)
    expect(result.cached).toBe(1)
    expect(result.errors.size).toBe(0)
  })

  test('output files are written to disk', () => {
    writeFile(tmpDir, 'a.mcrs', 'fn a_func() { let x: int = 1; }')
    const a = path.join(tmpDir, 'a.mcrs')

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    compileIncremental([a], cache, depGraph, { output: outDir })

    // Output directory should exist with generated files
    expect(fs.existsSync(outDir)).toBe(true)
    const files = fs.readdirSync(outDir, { recursive: true }) as string[]
    expect(files.length).toBeGreaterThan(0)
  })

  test('compile errors are captured without crashing', () => {
    // Invalid syntax
    const bad = writeFile(tmpDir, 'bad.mcrs', 'fn { broken syntax !!!!')

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    const result = compileIncremental([bad], cache, depGraph, { output: outDir })

    expect(result.errors.size).toBe(1)
    expect(result.recompiled).toBe(0)
  })
})
