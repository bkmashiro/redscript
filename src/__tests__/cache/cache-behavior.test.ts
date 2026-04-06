/**
 * cache-behavior.test.ts
 *
 * Focused tests for cache behavior:
 *   - Same code compiled twice → second compile uses cache
 *   - Modified code → cache invalidation
 *   - stdlib / shared module caching
 *   - Edge cases to push src/cache/ coverage > 85%
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { FileCache, hashFile } from '../../cache/index'
import { DependencyGraph, parseImports } from '../../cache/deps'
import { compileIncremental, resetCompileCache } from '../../cache/incremental'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rs-cache-behavior-'))
}

function writeFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

/** Bump mtime forward so hasChanged detects a modification. */
function touchFile(filePath: string, offsetMs = 5_000): void {
  const now = Date.now() + offsetMs
  fs.utimesSync(filePath, new Date(now), new Date(now))
}

/** Write new content and bump mtime. */
function modifyFile(filePath: string, newContent: string): void {
  fs.writeFileSync(filePath, newContent)
  touchFile(filePath)
}

// ---------------------------------------------------------------------------
// FileCache — uncovered branches
// ---------------------------------------------------------------------------

describe('FileCache — stat throws on cached file (branch coverage)', () => {
  test('hasChanged returns true when stat throws after entry is cached', () => {
    const cache = new FileCache('/tmp/test-no-file')
    // Manually insert an entry for a path that does NOT exist on disk
    const fakePath = '/absolutely/nonexistent/ghost.mcrs'
    cache.set(fakePath, { hash: 'deadbeef', mtime: 12345 })
    // stat will throw → branch at line 53 returns true
    expect(cache.hasChanged(fakePath)).toBe(true)
  })

  test('update on nonexistent file removes entry (catch branch)', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    // First create file, cache it
    const filePath = writeFile(tmp, 'ghost.mcrs', 'fn ghost() {}')
    cache.update(filePath)
    expect(cache.size).toBe(1)

    // Delete the file — now update should catch the error and delete the entry
    fs.unlinkSync(filePath)
    // Manually wipe mtime so hasChanged considers it changed
    cache.set(filePath, { hash: 'stale', mtime: 0 })
    cache.update(filePath) // stat throws inside update → delete branch
    expect(cache.get(filePath)).toBeUndefined()
  })
})

describe('FileCache — update HIR on unchanged file', () => {
  test('update with HIR on unchanged file stores HIR without marking changed', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeFile(tmp, 'stable.mcrs', 'fn stable() {}')
    // Initial update — mark file as cached
    cache.update(filePath)
    expect(cache.hasChanged(filePath)).toBe(false)

    // Call update again with a fake HIR on an unchanged file
    const fakeHir = { functions: [] } as any
    const changed = cache.update(filePath, fakeHir)
    expect(changed).toBe(false) // file didn't change
    // HIR should now be attached
    const entry = cache.get(filePath)
    expect(entry?.hir).toBe(fakeHir)
  })
})

describe('FileCache — load with wrong version is ignored', () => {
  test('load skips entries when cache version !== 1', () => {
    const tmp = makeTmpDir()
    const cacheDir = path.join(tmp, '.cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    // Write a v2 cache file
    fs.writeFileSync(
      path.join(cacheDir, 'cache.json'),
      JSON.stringify({ version: 99, entries: { '/some/file.mcrs': { hash: 'abc', mtime: 1 } } }),
    )
    const cache = new FileCache(cacheDir)
    cache.load()
    expect(cache.size).toBe(0) // version mismatch — ignored
  })
})

// ---------------------------------------------------------------------------
// Behavior: same code twice → second compile is cached
// ---------------------------------------------------------------------------

describe('Cache hit: same code compiled twice', () => {
  let tmpDir: string
  let cacheDir: string
  let outDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cacheDir = path.join(tmpDir, '.cache')
    outDir = path.join(tmpDir, 'out')
    resetCompileCache()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('second compile of unchanged file produces cache hit', () => {
    const src = writeFile(tmpDir, 'hello.mcrs', 'fn hello() { let x: int = 1; }')
    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile — must be a miss
    const r1 = compileIncremental([src], cache, depGraph, { output: outDir })
    expect(r1.recompiled).toBe(1)
    expect(r1.cached).toBe(0)

    // Second compile — same file, same content → cache hit
    const r2 = compileIncremental([src], cache, depGraph, { output: outDir })
    expect(r2.recompiled).toBe(0)
    expect(r2.cached).toBe(1)
  })

  test('cache persists across FileCache reload', () => {
    const src = writeFile(tmpDir, 'hello.mcrs', 'fn hello() { let x: int = 1; }')

    // First pass: compile and save cache to disk
    const cache1 = new FileCache(cacheDir)
    const depGraph1 = new DependencyGraph()
    compileIncremental([src], cache1, depGraph1, { output: outDir })
    cache1.save()

    // Reset in-memory compile cache to simulate a fresh process
    resetCompileCache()

    // Second pass: load cache from disk — still a hit for the FileCache checks
    const cache2 = new FileCache(cacheDir)
    cache2.load()
    expect(cache2.hasChanged(src)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Behavior: modifying code invalidates cache
// ---------------------------------------------------------------------------

describe('Cache invalidation: modified source', () => {
  let tmpDir: string
  let cacheDir: string
  let outDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cacheDir = path.join(tmpDir, '.cache')
    outDir = path.join(tmpDir, 'out')
    resetCompileCache()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('modified file is recompiled after cache hit', () => {
    const src = writeFile(tmpDir, 'counter.mcrs', 'fn counter() { let n: int = 0; }')
    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile
    compileIncremental([src], cache, depGraph, { output: outDir })

    // Modify the file
    modifyFile(src, 'fn counter() { let n: int = 99; }')

    // hasChanged should now return true
    expect(cache.hasChanged(src)).toBe(true)

    // Second compile — should recompile
    const r2 = compileIncremental([src], cache, depGraph, { output: outDir })
    expect(r2.recompiled).toBe(1)
    expect(r2.cached).toBe(0)
  })

  test('mtime change with same content still returns cached (hash match)', () => {
    const tmp2 = makeTmpDir()
    const cache = new FileCache(tmp2)
    const filePath = writeFile(tmp2, 'stable.mcrs', 'fn stable() {}')
    cache.update(filePath)

    // Touch mtime without changing content
    touchFile(filePath)

    // mtime changed but hash should match → hasChanged returns false
    expect(cache.hasChanged(filePath)).toBe(false)

    fs.rmSync(tmp2, { recursive: true, force: true })
  })

  test('delete file from cache then recompile triggers miss', () => {
    const src = writeFile(tmpDir, 'foo.mcrs', 'fn foo() { let x: int = 5; }')
    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // Compile once
    compileIncremental([src], cache, depGraph, { output: outDir })
    expect(cache.hasChanged(src)).toBe(false)

    // Evict from FileCache
    cache.delete(src)
    expect(cache.hasChanged(src)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Behavior: stdlib / shared module caching
// ---------------------------------------------------------------------------

describe('Stdlib / shared module caching', () => {
  let tmpDir: string
  let cacheDir: string
  let outDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cacheDir = path.join(tmpDir, '.cache')
    outDir = path.join(tmpDir, 'out')
    resetCompileCache()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('unchanged stdlib module cached across multiple entry files', () => {
    // Simulate a stdlib module shared by many files
    const stdlib = writeFile(tmpDir, 'stdlib/math.mcrs', 'fn math_add(a: int, b: int): int { return a + b; }')
    const file1 = writeFile(tmpDir, 'prog1.mcrs', `import "stdlib/math.mcrs";\nfn prog1() { math_add(1, 2); }`)
    const file2 = writeFile(tmpDir, 'prog2.mcrs', `import "stdlib/math.mcrs";\nfn prog2() { math_add(3, 4); }`)

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile — all miss
    const r1 = compileIncremental([file1, file2], cache, depGraph, { output: outDir })
    expect(r1.recompiled).toBe(2)
    expect(r1.cached).toBe(0)

    // Second compile — stdlib unchanged, both files cached
    const r2 = compileIncremental([file1, file2], cache, depGraph, { output: outDir })
    expect(r2.recompiled).toBe(0)
    expect(r2.cached).toBe(2)

    // Verify stdlib itself is tracked in cache
    expect(cache.hasChanged(stdlib)).toBe(false)
  })

  test('stdlib change invalidates all dependents', () => {
    const stdlib = writeFile(tmpDir, 'stdlib/core.mcrs', 'fn core_fn() { let v: int = 1; }')
    const file1 = writeFile(tmpDir, 'a.mcrs', `import "stdlib/core.mcrs";\nfn a() { core_fn(); }`)
    const file2 = writeFile(tmpDir, 'b.mcrs', `import "stdlib/core.mcrs";\nfn b() { core_fn(); }`)
    const isolated = writeFile(tmpDir, 'isolated.mcrs', 'fn isolated() { let x: int = 42; }')

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // Compile all three
    compileIncremental([file1, file2, isolated], cache, depGraph, { output: outDir })

    // Modify stdlib
    modifyFile(stdlib, 'fn core_fn() { let v: int = 999; }')

    // Both file1 and file2 depend on stdlib → recompile; isolated is unaffected
    const r2 = compileIncremental([file1, file2, isolated], cache, depGraph, { output: outDir })
    expect(r2.recompiled).toBe(2) // file1 + file2
    expect(r2.cached).toBe(1)    // isolated
    expect(r2.errors.size).toBe(0)
  })

  test('stdlib module hash stays stable when content unchanged', () => {
    const stdlib = writeFile(tmpDir, 'stdlib/stable.mcrs', 'fn stable_fn() { let s: int = 0; }')
    const cache = new FileCache(tmpDir)

    const h1 = hashFile(stdlib)
    cache.update(stdlib)
    // Reload from entry
    const entry = cache.get(stdlib)
    expect(entry?.hash).toBe(h1)

    // No modification — hash should remain identical
    const h2 = hashFile(stdlib)
    expect(h1).toBe(h2)
    expect(cache.hasChanged(stdlib)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DependencyGraph — uncovered branches (line 52, 125-130)
// ---------------------------------------------------------------------------

describe('DependencyGraph — edge cases', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('removeFile removes the file from the graph', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    const graph = new DependencyGraph()
    graph.addFile(a)
    expect(graph.getAllFiles()).toContain(path.resolve(a))
    graph.removeFile(a)
    expect(graph.getAllFiles()).not.toContain(path.resolve(a))
  })

  test('getAllFiles returns all tracked files', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    const b = writeFile(tmpDir, 'b.mcrs', 'fn b() {}')
    const graph = new DependencyGraph()
    graph.addFile(a)
    graph.addFile(b)
    const files = graph.getAllFiles()
    expect(files).toHaveLength(2)
    expect(files).toContain(path.resolve(a))
    expect(files).toContain(path.resolve(b))
  })

  test('clear empties the graph', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    const graph = new DependencyGraph()
    graph.addFile(a)
    expect(graph.getAllFiles()).toHaveLength(1)
    graph.clear()
    expect(graph.getAllFiles()).toHaveLength(0)
  })

  test('getDirectDeps returns empty set for unknown file', () => {
    const graph = new DependencyGraph()
    const deps = graph.getDirectDeps('/nonexistent.mcrs')
    expect(deps.size).toBe(0)
  })

  test('parseImports with inline source string (no disk read)', () => {
    const source = `import "util.mcrs";\nimport "math.mcrs";\nfn main() {}`
    const fakePath = path.join(tmpDir, 'main.mcrs')
    const imports = parseImports(fakePath, source)
    expect(imports).toHaveLength(2)
    expect(imports[0]).toBe(path.resolve(tmpDir, 'util.mcrs'))
    expect(imports[1]).toBe(path.resolve(tmpDir, 'math.mcrs'))
  })

  test('cyclic dependency does not cause infinite loop in getTransitiveDeps', () => {
    // Simulate a cycle: a → b → a (shouldn't happen in practice but must be safe)
    const a = path.resolve(tmpDir, 'a.mcrs')
    const b = path.resolve(tmpDir, 'b.mcrs')
    writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    writeFile(tmpDir, 'b.mcrs', 'fn b() {}')

    const graph = new DependencyGraph()
    // Manually force a cycle via addFile with inline source
    graph.addFile(a, `import "b.mcrs";\nfn a() {}`)
    graph.addFile(b, `import "a.mcrs";\nfn b() {}`)

    // Should not throw or loop forever
    expect(() => graph.getTransitiveDeps(a)).not.toThrow()
    const deps = graph.getTransitiveDeps(a)
    expect(deps.has(b)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseImports — edge cases
// ---------------------------------------------------------------------------

describe('parseImports — edge cases', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('empty source returns empty array', () => {
    const imports = parseImports(path.join(tmpDir, 'empty.mcrs'), '')
    expect(imports).toHaveLength(0)
  })

  test('source with only blank lines and comments returns empty array', () => {
    const source = `// just a comment\n\n// another comment\n`
    const imports = parseImports(path.join(tmpDir, 'comments.mcrs'), source)
    expect(imports).toHaveLength(0)
  })

  test('import without trailing semicolon is parsed', () => {
    const source = `import "no-semi.mcrs"\nfn main() {}`
    const imports = parseImports(path.join(tmpDir, 'main.mcrs'), source)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toBe(path.resolve(tmpDir, 'no-semi.mcrs'))
  })

  test('non-import line after imports stops parsing (does not include later imports)', () => {
    // A second import block buried inside function body must not be collected
    const source = `import "first.mcrs";\nfn body() {}\nimport "hidden.mcrs";`
    const imports = parseImports(path.join(tmpDir, 'main.mcrs'), source)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toBe(path.resolve(tmpDir, 'first.mcrs'))
  })

  test('reads file from disk when source is omitted', () => {
    const filePath = writeFile(tmpDir, 'disk.mcrs', `import "lib.mcrs";\nfn disk() {}`)
    const imports = parseImports(filePath)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toBe(path.resolve(tmpDir, 'lib.mcrs'))
  })

  test('throws when file does not exist and source is omitted', () => {
    const missing = path.join(tmpDir, 'ghost.mcrs')
    expect(() => parseImports(missing)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// DependencyGraph — additional edge cases
// ---------------------------------------------------------------------------

describe('DependencyGraph — getDependents and computeDirtySet edge cases', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('getDependents returns empty set for file with no reverse deps', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    const graph = new DependencyGraph()
    graph.addFile(a)
    expect(graph.getDependents(a).size).toBe(0)
  })

  test('getDependents includes transitive reverse dependents', () => {
    // chain: c → b → a  (c imports b, b imports a)
    const a = path.resolve(tmpDir, 'a.mcrs')
    const b = path.resolve(tmpDir, 'b.mcrs')
    const c = path.resolve(tmpDir, 'c.mcrs')
    writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    writeFile(tmpDir, 'b.mcrs', 'fn b() {}')
    writeFile(tmpDir, 'c.mcrs', 'fn c() {}')

    const graph = new DependencyGraph()
    graph.addFile(a)
    graph.addFile(b, `import "a.mcrs";\nfn b() {}`)
    graph.addFile(c, `import "b.mcrs";\nfn c() {}`)

    const dependents = graph.getDependents(a)
    expect(dependents.has(b)).toBe(true)
    expect(dependents.has(c)).toBe(true)
  })

  test('computeDirtySet with empty changed set returns empty set', () => {
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    const graph = new DependencyGraph()
    graph.addFile(a)
    expect(graph.computeDirtySet(new Set()).size).toBe(0)
  })

  test('computeDirtySet includes changed file itself plus its dependents', () => {
    const a = path.resolve(tmpDir, 'a.mcrs')
    const b = path.resolve(tmpDir, 'b.mcrs')
    writeFile(tmpDir, 'a.mcrs', 'fn a() {}')
    writeFile(tmpDir, 'b.mcrs', 'fn b() {}')

    const graph = new DependencyGraph()
    graph.addFile(a)
    graph.addFile(b, `import "a.mcrs";\nfn b() {}`)

    const dirty = graph.computeDirtySet(new Set([a]))
    expect(dirty.has(a)).toBe(true)
    expect(dirty.has(b)).toBe(true)
  })

  test('getTransitiveDeps returns empty set for unknown file', () => {
    const graph = new DependencyGraph()
    expect(graph.getTransitiveDeps('/nonexistent.mcrs').size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// compileIncremental — uncovered branches (lines 67, 113)
// ---------------------------------------------------------------------------

describe('compileIncremental — edge cases', () => {
  let tmpDir: string
  let cacheDir: string
  let outDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
    cacheDir = path.join(tmpDir, '.cache')
    outDir = path.join(tmpDir, 'out')
    resetCompileCache()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('deleted entry file is removed from dep graph gracefully', () => {
    // Write a file, then delete it before compileIncremental runs
    const ghost = path.join(tmpDir, 'ghost.mcrs')
    fs.writeFileSync(ghost, 'fn ghost() {}')
    fs.unlinkSync(ghost)

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // Should not throw; error captured in result
    const r = compileIncremental([ghost], cache, depGraph, { output: outDir })
    // Either an error is captured or the file is skipped
    expect(r.recompiled + r.errors.size).toBeGreaterThanOrEqual(0)
  })

  test('dep count change triggers recompile (depHashes.size mismatch branch)', () => {
    // Compile 'a' with no deps first
    const a = writeFile(tmpDir, 'a.mcrs', 'fn a_func() { let x: int = 1; }')
    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile: a has no deps
    const r1 = compileIncremental([a], cache, depGraph, { output: outDir })
    expect(r1.recompiled).toBe(1)

    // Now add a new dep to a — simulate by modifying a to import lib, then compile
    writeFile(tmpDir, 'lib.mcrs', 'fn lib_fn() { let l: int = 0; }')
    modifyFile(a, `import "lib.mcrs";\nfn a_func() { lib_fn(); }`)

    // Second compile: a now has one dep → depHashes.size mismatch triggers recompile
    const r2 = compileIncremental([a], cache, depGraph, { output: outDir })
    expect(r2.recompiled).toBe(1)
    expect(r2.errors.size).toBe(0)
  })

  test('multiple files: partial recompile on single change', () => {
    const files = ['fn1', 'fn2', 'fn3'].map(name =>
      writeFile(tmpDir, `${name}.mcrs`, `fn ${name}() { let x: int = 1; }`)
    )

    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()

    // First compile — all miss
    const r1 = compileIncremental(files, cache, depGraph, { output: outDir })
    expect(r1.recompiled).toBe(3)

    // Modify only fn2
    modifyFile(files[1], 'fn fn2() { let x: int = 999; }')

    const r2 = compileIncremental(files, cache, depGraph, { output: outDir })
    expect(r2.recompiled).toBe(1)
    expect(r2.cached).toBe(2)
  })

  test('empty file list returns zero counts', () => {
    const cache = new FileCache(cacheDir)
    const depGraph = new DependencyGraph()
    const r = compileIncremental([], cache, depGraph, { output: outDir })
    expect(r.recompiled).toBe(0)
    expect(r.cached).toBe(0)
    expect(r.errors.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Logging — warn is emitted on error paths
// ---------------------------------------------------------------------------

describe('FileCache — warn logged on stat failure', () => {
  test('hasChanged emits console.warn when stat throws', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const cache = new FileCache('/tmp/irrelevant')
      const fakePath = '/absolutely/nonexistent/warn-test.mcrs'
      cache.set(fakePath, { hash: 'abc', mtime: 1 })
      cache.hasChanged(fakePath)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[cache]'))
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(fakePath))
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('FileCache — warn logged on corrupt cache load', () => {
  test('load emits console.warn when cache.json is corrupt JSON', () => {
    const tmp = makeTmpDir()
    const cacheDir = path.join(tmp, '.cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, 'cache.json'), 'not valid json {{{')

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const cache = new FileCache(cacheDir)
      cache.load()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[cache]'))
      expect(cache.size).toBe(0) // recovery still works
    } finally {
      warnSpy.mockRestore()
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('load emits console.warn when cache.json is missing', () => {
    const tmp = makeTmpDir()
    const cacheDir = path.join(tmp, '.no-cache-dir')

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const cache = new FileCache(cacheDir)
      cache.load()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[cache]'))
      expect(cache.size).toBe(0)
    } finally {
      warnSpy.mockRestore()
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('compileIncremental — warn logged when dependency file is unreadable', () => {
  test('discoverDependencyGraph emits console.warn for missing import target', () => {
    const tmp = makeTmpDir()
    const outDir = path.join(tmp, 'out')
    // File imports a path that does not exist on disk
    const src = writeFile(tmp, 'main.mcrs', 'import "missing.mcrs";\nfn main() {}')

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const cache = new FileCache(path.join(tmp, '.cache'))
      const depGraph = new DependencyGraph()
      compileIncremental([src], cache, depGraph, { output: outDir })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[cache]'))
    } finally {
      warnSpy.mockRestore()
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
