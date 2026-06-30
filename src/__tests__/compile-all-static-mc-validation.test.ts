/**
 * Compile-all static MC validation gate
 *
 * Compiles every non-skipped .mcrs file through the CLI, then validates every
 * emitted non-comment .mcfunction command with the static MCCommandValidator.
 * This is stronger than compile-only smoke, but still not live Paper proof.
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import * as os from 'os'
import { COMPILE_ALL_SKIP_PATTERNS } from './helpers/compile-all-skip-manifest'
import { MCCommandValidator } from '../mc-validator'

const REPO_ROOT = path.resolve(__dirname, '../../')
const CLI = path.join(REPO_ROOT, 'dist', 'src', 'cli.js')
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'mc-commands-1.21.4.json')
const TMP_OUT = path.join(os.tmpdir(), 'redscript-compile-all-static-mc')

if (!fs.existsSync(CLI)) {
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' })
}

function shouldSkip(filePath: string): boolean {
  const rel = path.relative(REPO_ROOT, filePath)
  return COMPILE_ALL_SKIP_PATTERNS.some(pattern => rel.includes(pattern))
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

function findMcfunctionFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findMcfunctionFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.mcfunction')) {
      results.push(fullPath)
    }
  }
  return results
}

function nonCommentCommands(mcfunctionPath: string): string[] {
  return fs.readFileSync(mcfunctionPath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !line.startsWith('#'))
}

describe('compile-all static MC validation', () => {
  const validator = new MCCommandValidator(FIXTURE_PATH)
  const mcrsFiles = findMcrsFiles(REPO_ROOT)

  test('every compile-all source emits statically valid .mcfunction commands', () => {
    fs.rmSync(TMP_OUT, { recursive: true, force: true })
    const failures: string[] = []

    for (const filePath of mcrsFiles) {
      const label = path.relative(REPO_ROOT, filePath)
      const outDir = path.join(TMP_OUT, label.replace(/[^a-zA-Z0-9]/g, '_'))
      fs.rmSync(outDir, { recursive: true, force: true })

      execSync(`node "${CLI}" compile "${filePath}" -o "${outDir}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      })

      for (const mcfunctionPath of findMcfunctionFiles(outDir)) {
        for (const command of nonCommentCommands(mcfunctionPath)) {
          const result = validator.validate(command)
          if (!result.valid) {
            failures.push([
              `${label} -> ${path.relative(outDir, mcfunctionPath)}`,
              command,
              result.error ?? 'unknown validation error',
            ].join('\n  '))
          }
        }
      }
    }

    expect(failures).toEqual([])
  }, 120000)
})
