import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  dependencyCacheEntryPath,
  hashDependencyTree,
  verifyCachedDependency,
} from '../../project/dependency-cache'

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-dependency-cache-'))
}

describe('remote dependency content-addressed cache', () => {
  test('hashes canonical file paths and contents independent of Git metadata and permission bits', () => {
    const first = tempDir()
    const second = tempDir()
    try {
      for (const root of [first, second]) {
        fs.mkdirSync(path.join(root, 'src', 'math'), { recursive: true })
        fs.mkdirSync(path.join(root, '.git'), { recursive: true })
        fs.writeFileSync(path.join(root, 'redscript.toml'), '[project]\nname = "shared"\n')
        fs.writeFileSync(path.join(root, 'src', 'math', 'main.mcrs'), 'package math;\n')
      }
      fs.writeFileSync(path.join(first, '.git', 'mutable'), 'one')
      fs.writeFileSync(path.join(second, '.git', 'mutable'), 'two')
      fs.chmodSync(path.join(first, 'src', 'math', 'main.mcrs'), 0o644)
      fs.chmodSync(path.join(second, 'src', 'math', 'main.mcrs'), 0o755)

      const left = hashDependencyTree(first)
      const right = hashDependencyTree(second)
      expect(left).toEqual(right)
      expect(left.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(left.fileCount).toBe(2)
      expect(left.totalBytes).toBeGreaterThan(0)

      fs.writeFileSync(path.join(second, 'src', 'math', 'main.mcrs'), 'package math; export fn changed(): void {}\n')
      expect(hashDependencyTree(second).contentHash).not.toBe(left.contentHash)
    } finally {
      fs.rmSync(first, { recursive: true, force: true })
      fs.rmSync(second, { recursive: true, force: true })
    }
  })

  test('derives cache identity only from canonical source URL and revision', () => {
    const cache = tempDir()
    try {
      const source = { kind: 'git' as const, url: 'https://example.com/shared.git' }
      const revision = '1'.repeat(40)
      const first = dependencyCacheEntryPath(cache, source, revision)
      const previous = process.cwd()
      process.chdir(os.tmpdir())
      try {
        expect(dependencyCacheEntryPath(cache, source, revision)).toBe(first)
      } finally {
        process.chdir(previous)
      }
      expect(path.dirname(first)).toBe(path.resolve(cache))
      expect(path.basename(first)).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      fs.rmSync(cache, { recursive: true, force: true })
    }
  })

  test.each([
    ['symbolic links', (root: string) => fs.symlinkSync('/tmp', path.join(root, 'linked')), /symbolic links/i],
    ['Git submodules', (root: string) => fs.writeFileSync(path.join(root, '.gitmodules'), '[submodule "x"]\n'), /submodules/i],
  ])('rejects %s in immutable dependency trees', (_label, mutate, expected) => {
    const root = tempDir()
    try {
      fs.writeFileSync(path.join(root, 'redscript.toml'), '[project]\nname = "shared"\n')
      mutate(root)
      expect(() => hashDependencyTree(root)).toThrow(expected)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('enforces file-count and byte limits', () => {
    const root = tempDir()
    try {
      fs.writeFileSync(path.join(root, 'one.mcrs'), '12345')
      fs.writeFileSync(path.join(root, 'two.mcrs'), '67890')
      expect(() => hashDependencyTree(root, { maxFiles: 1 })).toThrow(/file count.*limit/i)
      expect(() => hashDependencyTree(root, { maxBytes: 9 })).toThrow(/byte.*limit/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('verifies locked content before returning a cache source root', () => {
    const cache = tempDir()
    const source = { kind: 'git' as const, url: 'https://example.com/shared.git' }
    const revision = '2'.repeat(40)
    const entry = dependencyCacheEntryPath(cache, source, revision)
    const sourceRoot = path.join(entry, 'source')
    try {
      fs.mkdirSync(sourceRoot, { recursive: true })
      fs.writeFileSync(path.join(sourceRoot, 'redscript.toml'), '[project]\nname = "shared"\n')
      const expected = hashDependencyTree(sourceRoot).contentHash
      expect(verifyCachedDependency(cache, source, revision, expected)).toBe(sourceRoot)

      fs.writeFileSync(path.join(sourceRoot, 'redscript.toml'), '[project]\nname = "tampered"\n')
      expect(() => verifyCachedDependency(cache, source, revision, expected)).toThrow(
        /content hash mismatch/i,
      )
    } finally {
      fs.rmSync(cache, { recursive: true, force: true })
    }
  })

  test('rejects a cache entry directory replaced by a symbolic link', () => {
    const cache = tempDir()
    const external = tempDir()
    const source = { kind: 'git' as const, url: 'https://example.com/shared.git' }
    const revision = '3'.repeat(40)
    const entry = dependencyCacheEntryPath(cache, source, revision)
    const externalSource = path.join(external, 'source')
    try {
      fs.mkdirSync(externalSource, { recursive: true })
      fs.writeFileSync(path.join(externalSource, 'redscript.toml'), '[project]\nname = "shared"\n')
      const expected = hashDependencyTree(externalSource).contentHash
      fs.symlinkSync(external, entry)

      expect(() => verifyCachedDependency(cache, source, revision, expected)).toThrow(
        /cache entry.*real directory|outside.*cache/i,
      )
    } finally {
      fs.rmSync(cache, { recursive: true, force: true })
      fs.rmSync(external, { recursive: true, force: true })
    }
  })
})
