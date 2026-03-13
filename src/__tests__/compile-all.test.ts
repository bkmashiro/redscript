/**
 * Compile-all smoke test
 *
 * Finds every .mcrs file in the repo (excluding declaration files and node_modules)
 * and verifies that each one compiles without throwing an error.
 *
 * This catches regressions where a language change breaks existing source files.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'

const REPO_ROOT = path.resolve(__dirname, '../../')

/** Patterns to skip */
const SKIP_GLOBS = [
  'node_modules',
  '.git',
  'builtins.d.mcrs',   // declaration-only file, not valid source
  'editors/',          // copy of builtins.d.mcrs
]

function shouldSkip(filePath: string): boolean {
  const rel = path.relative(REPO_ROOT, filePath)
  return SKIP_GLOBS.some(pat => rel.includes(pat))
}

function findMcrsFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (shouldSkip(fullPath)) continue
    if (entry.isDirectory()) {
      results.push(...findMcrsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.mcrs')) {
      results.push(fullPath)
    }
  }
  return results
}

const mcrsFiles = findMcrsFiles(REPO_ROOT)

describe('compile-all: every .mcrs file should compile without errors', () => {
  test('found at least one .mcrs file', () => {
    expect(mcrsFiles.length).toBeGreaterThan(0)
  })

  for (const filePath of mcrsFiles) {
    const label = path.relative(REPO_ROOT, filePath)
    test(label, () => {
      const source = fs.readFileSync(filePath, 'utf8')
      // Should not throw
      expect(() => {
        compile(source, { namespace: 'smoke_test', optimize: false })
      }).not.toThrow()
    })
  }
})
