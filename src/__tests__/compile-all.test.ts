/**
 * Compile-all smoke test
 *
 * Finds every .mcrs file in the repo (excluding declaration files and node_modules)
 * and verifies that each one compiles without errors via the CLI (which handles
 * `import` statements, unlike the bare `compile()` function).
 *
 * This catches regressions where a language change breaks existing source files.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import * as os from 'os'

const REPO_ROOT = path.resolve(__dirname, '../../')
const CLI = path.join(REPO_ROOT, 'dist', 'cli.js')

// Ensure dist/cli.js exists — build first if not (e.g. in CI)
if (!fs.existsSync(CLI)) {
  console.log('[compile-all] dist/cli.js not found, running npm run build...')
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' })
}

/** Patterns to skip */
const SKIP_GLOBS = [
  'node_modules',
  '.git',
  'builtins.d.mcrs',          // declaration-only file, not valid source
  'editors/',                  // copy of builtins.d.mcrs
  'heap-sort-mc-test.mcrs',   // requires librarySources injection (heap.mcrs, sort.mcrs)
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
const TMP_OUT = path.join(os.tmpdir(), 'redscript-compile-all')

describe('compile-all: every .mcrs file should compile without errors (CLI)', () => {
  test('found at least one .mcrs file', () => {
    expect(mcrsFiles.length).toBeGreaterThan(0)
  })

  for (const filePath of mcrsFiles) {
    const label = path.relative(REPO_ROOT, filePath)
    test(label, () => {
      const outDir = path.join(TMP_OUT, label.replace(/[^a-zA-Z0-9]/g, '_'))
      let stdout = ''
      let stderr = ''
      try {
        const result = execSync(
          `node "${CLI}" compile "${filePath}" -o "${outDir}"`,
          { encoding: 'utf8', stdio: 'pipe' }
        )
        stdout = result
      } catch (err: any) {
        stdout = err.stdout ?? ''
        stderr = err.stderr ?? ''
        const output = (stdout + stderr).trim()
        // Fail with the compiler error message
        throw new Error(`Compile failed for ${label}:\n${output}`)
      }
    })
  }
})
