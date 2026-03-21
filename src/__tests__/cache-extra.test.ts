/**
 * Extra coverage for src/cache/index.ts
 * Targets: save/load, hasChanged with mtime, update branches, delete, clear.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { FileCache, hashFile } from '../cache'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rs-cache-test-'))
}

function writeTmpFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content)
  return p
}

describe('FileCache — basic get/set', () => {
  test('get returns undefined for unknown file', () => {
    const cache = new FileCache('/tmp/test-cache-nonexistent')
    expect(cache.get('/nonexistent/file.mcrs')).toBeUndefined()
  })

  test('set then get returns entry', () => {
    const cache = new FileCache('/tmp/test-cache')
    const filePath = '/tmp/fake.mcrs'
    cache.set(filePath, { hash: 'abc123', mtime: 1000 })
    const entry = cache.get(filePath)
    expect(entry).toBeDefined()
    expect(entry!.hash).toBe('abc123')
  })

  test('size reflects number of entries', () => {
    const cache = new FileCache('/tmp/test-cache')
    expect(cache.size).toBe(0)
    cache.set('/tmp/a.mcrs', { hash: 'h1', mtime: 1 })
    cache.set('/tmp/b.mcrs', { hash: 'h2', mtime: 2 })
    expect(cache.size).toBe(2)
  })

  test('delete removes an entry', () => {
    const cache = new FileCache('/tmp/test-cache')
    cache.set('/tmp/a.mcrs', { hash: 'h1', mtime: 1 })
    expect(cache.size).toBe(1)
    cache.delete('/tmp/a.mcrs')
    expect(cache.size).toBe(0)
  })

  test('clear removes all entries', () => {
    const cache = new FileCache('/tmp/test-cache')
    cache.set('/tmp/a.mcrs', { hash: 'h1', mtime: 1 })
    cache.set('/tmp/b.mcrs', { hash: 'h2', mtime: 2 })
    cache.clear()
    expect(cache.size).toBe(0)
  })
})

describe('FileCache — hasChanged', () => {
  test('returns true for uncached file', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'hello')
    expect(cache.hasChanged(filePath)).toBe(true)
  })

  test('returns false when mtime matches', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'hello')
    const stat = fs.statSync(filePath)
    cache.set(filePath, { hash: 'irrelevant', mtime: stat.mtimeMs })
    expect(cache.hasChanged(filePath)).toBe(false)
  })

  test('returns true when content hash differs (mtime changed)', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'hello')
    // Cache with old mtime (0) and wrong hash
    cache.set(filePath, { hash: 'wronghash', mtime: 0 })
    // mtime is different → compare hash
    expect(cache.hasChanged(filePath)).toBe(true)
  })

  test('returns true for nonexistent file', () => {
    const cache = new FileCache('/tmp/nonexistent-cache')
    expect(cache.hasChanged('/tmp/definitelynotafile.mcrs')).toBe(true)
  })
})

describe('FileCache — update', () => {
  test('update on changed file returns true and caches entry', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'content')
    const changed = cache.update(filePath)
    expect(changed).toBe(true)
    expect(cache.get(filePath)).toBeDefined()
    expect(cache.get(filePath)!.hash).toBeTruthy()
  })

  test('update on unchanged file returns false', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'content')
    cache.update(filePath) // first call: changed
    const changed2 = cache.update(filePath) // second call: not changed
    expect(changed2).toBe(false)
  })

  test('update stores HIR when provided and content changed', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'content')
    const fakeHir = { namespace: 'test', functions: [], structs: [], enums: [], implBlocks: [], imports: [] } as any
    cache.update(filePath, fakeHir)
    expect(cache.get(filePath)!.hir).toBe(fakeHir)
  })

  test('update stores HIR when content unchanged but HIR provided', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'content')
    cache.update(filePath) // mark as cached
    // Second update with HIR but no content change
    const fakeHir = { namespace: 'test2', functions: [], structs: [], enums: [], implBlocks: [], imports: [] } as any
    cache.update(filePath, fakeHir)
    expect(cache.get(filePath)!.hir).toBe(fakeHir)
  })
})

describe('FileCache — save/load', () => {
  test('save and load round-trip persists entries', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'hello world')
    cache.update(filePath)
    cache.save()

    // Load into a new cache instance
    const cache2 = new FileCache(tmp)
    cache2.load()
    const entry = cache2.get(filePath)
    expect(entry).toBeDefined()
    expect(entry!.hash).toBe(cache.get(filePath)!.hash)
    expect(entry!.mtime).toBe(cache.get(filePath)!.mtime)
    // HIR is NOT persisted
    expect(entry!.hir).toBeUndefined()
  })

  test('load silently ignores missing cache file', () => {
    const tmp = makeTmpDir()
    const cache = new FileCache(tmp)
    expect(() => cache.load()).not.toThrow()
    expect(cache.size).toBe(0)
  })

  test('load silently ignores corrupt cache file', () => {
    const tmp = makeTmpDir()
    fs.writeFileSync(path.join(tmp, 'cache.json'), 'not valid json{{{')
    const cache = new FileCache(tmp)
    expect(() => cache.load()).not.toThrow()
    expect(cache.size).toBe(0)
  })

  test('load ignores wrong version', () => {
    const tmp = makeTmpDir()
    fs.writeFileSync(path.join(tmp, 'cache.json'), JSON.stringify({ version: 99, entries: {} }))
    const cache = new FileCache(tmp)
    cache.load()
    expect(cache.size).toBe(0)
  })
})

describe('hashFile', () => {
  test('returns a hex string', () => {
    const tmp = makeTmpDir()
    const filePath = writeTmpFile(tmp, 'test.mcrs', 'hello')
    const hash = hashFile(filePath)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('same content gives same hash', () => {
    const tmp = makeTmpDir()
    const f1 = writeTmpFile(tmp, 'a.mcrs', 'same content')
    const f2 = writeTmpFile(tmp, 'b.mcrs', 'same content')
    expect(hashFile(f1)).toBe(hashFile(f2))
  })

  test('different content gives different hash', () => {
    const tmp = makeTmpDir()
    const f1 = writeTmpFile(tmp, 'a.mcrs', 'hello')
    const f2 = writeTmpFile(tmp, 'b.mcrs', 'world')
    expect(hashFile(f1)).not.toBe(hashFile(f2))
  })
})
