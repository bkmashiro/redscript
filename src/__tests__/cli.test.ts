import { compile, check } from '../index'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync, spawnSync } from 'child_process'

// Note: watch command is tested manually as it's an interactive long-running process

describe('CLI API', () => {
  const cliPath = path.resolve(__dirname, '..', 'cli.ts')
  const cliRunner = [require.resolve('ts-node/register/transpile-only')]

  describe('imports', () => {
    it('compiles a file with imported helpers', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-imports-'))
      const libPath = path.join(tempDir, 'lib.mcrs')
      const mainPath = path.join(tempDir, 'main.mcrs')

      fs.writeFileSync(libPath, 'fn double(x: int) -> int { return x + x; }\n')
      fs.writeFileSync(mainPath, 'import "./lib.mcrs"\n\nfn main() { let value: int = double(2); }\n')

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'imports', filePath: mainPath })

      expect(result.files.length).toBeGreaterThan(0)
      // Verify both functions are compiled by checking output files
      expect(result.files.some(f => f.path.includes('/double.mcfunction'))).toBe(true)
      expect(result.files.some(f => f.path.includes('/main.mcfunction'))).toBe(true)
    })

    it('deduplicates circular imports', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-circular-'))
      const aPath = path.join(tempDir, 'a.mcrs')
      const bPath = path.join(tempDir, 'b.mcrs')
      const mainPath = path.join(tempDir, 'main.mcrs')

      fs.writeFileSync(aPath, 'import "./b.mcrs"\n\nfn from_a() -> int { return 1; }\n')
      fs.writeFileSync(bPath, 'import "./a.mcrs"\n\nfn from_b() -> int { return from_a(); }\n')
      fs.writeFileSync(mainPath, 'import "./a.mcrs"\n\nfn main() { let value: int = from_b(); }\n')

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'circular', filePath: mainPath })

      // Verify each function appears exactly once in output
      expect(result.files.filter(f => f.path.endsWith('/from_a.mcfunction'))).toHaveLength(1)
      expect(result.files.filter(f => f.path.endsWith('/from_b.mcfunction'))).toHaveLength(1)
    })
  })

  describe('compile()', () => {
    it('compiles simple source', () => {
      const source = 'fn test() { say("hello"); }'
      const result = compile(source, { namespace: 'mypack' })
      expect(result.files.length).toBeGreaterThan(0)
    })

    it('generates correct file structure', () => {
      const source = 'fn test() { say("hello"); }'
      const result = compile(source, { namespace: 'game' })

      const paths = result.files.map(f => f.path)
      expect(paths).toContain('pack.mcmeta')
      expect(paths).toContain('data/game/function/load.mcfunction')
      expect(paths.some(p => p.includes('test.mcfunction'))).toBe(true)
    })
  })

  describe('check()', () => {
    it('returns null for valid source', () => {
      const source = 'fn test() { say("hello"); }'
      const error = check(source)
      expect(error).toBeNull()
    })

    it('returns error for invalid source', () => {
      const source = 'fn test( { say("hello"); }'  // Missing )
      const error = check(source)
      expect(error).toBeInstanceOf(Error)
    })

    it('returns error for syntax errors', () => {
      const source = 'fn test() { let x = ; }'  // Missing value
      const error = check(source)
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('check CLI', () => {
    it('returns exit code 1 and JSON diagnostics for warnings', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-cli-'))
      const filePath = path.join(tempDir, 'warn.mcrs')
      fs.writeFileSync(filePath, 'fn main(x: float) {\n  return;\n}\n')

      const result = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'check', filePath, '--format', 'json'],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(1)
      const payload = JSON.parse(result.stdout)
      expect(payload.summary.warnings).toBeGreaterThan(0)
      expect(payload.summary.errors).toBe(0)
      expect(payload.diagnostics[0].severity).toBe('warning')
    })

    it('returns exit code 2 and human-readable output for errors', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-cli-'))
      const filePath = path.join(tempDir, 'error.mcrs')
      fs.writeFileSync(filePath, 'fn main( {\n  return;\n}\n')

      const result = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'check', filePath],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(2)
      expect(result.stderr).toContain(`${filePath}:`)
      expect(result.stderr).toContain('error:')
    })
  })

  describe('fmt CLI', () => {
    it('formats files in place', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-fmt-cli-'))
      const filePath = path.join(tempDir, 'format.mcrs')
      fs.writeFileSync(filePath, 'fn main()\n{\nlet x: int = 1;\n}\n')

      const result = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'fmt', filePath],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(0)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('fn main() {\n  let x: int = 1;\n}\n')
    })

    it('supports --check mode', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-fmt-cli-'))
      const filePath = path.join(tempDir, 'check.mcrs')
      fs.writeFileSync(filePath, 'fn main()\n{\nlet x: int = 1;\n}\n')

      const result = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'fmt', filePath, '--check'],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(1)
      expect(result.stdout).toContain('Would format:')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('fn main()\n{\nlet x: int = 1;\n}\n')
    })
  })

  describe('compile CLI', () => {
    it('supports --incremental and reuses cached output on the second run', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-compile-cli-'))
      const filePath = path.join(tempDir, 'main.mcrs')
      const outDir = path.join(tempDir, 'dist')
      fs.writeFileSync(filePath, 'fn main() { say("hi"); }\n')

      const first = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'compile', filePath, '--incremental', '-o', outDir],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      const second = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'compile', filePath, '--incremental', '-o', outDir],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(first.status).toBe(0)
      expect(second.status).toBe(0)
      expect(second.stdout).toContain('Reused cache')
      expect(fs.existsSync(path.join(tempDir, '.redscript-cache', 'cache.json'))).toBe(true)
    })
  })
})
