import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { COMPILE_ALL_SKIP_MANIFEST } from './helpers/compile-all-skip-manifest'

const REPO_ROOT = path.resolve(__dirname, '../../')
const CLI = path.join(REPO_ROOT, 'dist/src/cli.js')
const TMP_OUT = path.join('/tmp', 'redscript-skip-manifest-probe')

function findMcrsFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const rel = path.relative(REPO_ROOT, fullPath)
    if (
      rel === 'node_modules' ||
      rel.startsWith(`node_modules${path.sep}`) ||
      rel === '.git' ||
      rel.startsWith(`.git${path.sep}`) ||
      rel === '.claude' ||
      rel.startsWith(`.claude${path.sep}`) ||
      rel === '.burn' ||
      rel.startsWith(`.burn${path.sep}`) ||
      rel === 'redscript-docs' ||
      rel.startsWith(`redscript-docs${path.sep}`)
    ) continue
    if (entry.isDirectory()) {
      results.push(...findMcrsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.mcrs')) {
      results.push(fullPath)
    }
  }
  return results
}

describe('compile-all skip manifest failure evidence', () => {
  const allMcrsFiles = findMcrsFiles(REPO_ROOT)

  beforeAll(() => {
    if (!fs.existsSync(CLI)) {
      execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' })
    }
  })

  it('keeps known language-gap skips tied to current failing compiler output', () => {
    const knownGaps = COMPILE_ALL_SKIP_MANIFEST.filter(entry => entry.category === 'known-language-gap')

    for (const entry of knownGaps) {
      expect(entry.expectedFailureSubstrings).toBeDefined()
      expect(entry.expectedFailureSubstrings!.length).toBeGreaterThan(0)

      const matches = allMcrsFiles.filter(file => path.relative(REPO_ROOT, file).includes(entry.pattern))
      expect(matches).toHaveLength(1)

      const outDir = path.join(TMP_OUT, entry.pattern.replace(/[^a-zA-Z0-9]/g, '_'))
      let output = ''
      let exitCode = 0
      try {
        execFileSync('node', [CLI, 'compile', matches[0], '-o', outDir], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: 'pipe',
        })
      } catch (err: any) {
        exitCode = err.status ?? 1
        output = `${err.stdout ?? ''}${err.stderr ?? ''}`
      }

      expect(exitCode).not.toBe(0)
      for (const expected of entry.expectedFailureSubstrings!) {
        expect(output).toContain(expected)
      }
    }
  })
})
