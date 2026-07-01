import { compile, check } from '../index'
import { parseArgs } from '../cli/args'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync, spawnSync } from 'child_process'

// Note: watch command is tested manually as it's an interactive long-running process

describe('CLI API', () => {
  const cliPath = path.resolve(__dirname, '..', 'cli.ts')
  const cliRunner = [require.resolve('ts-node/register/transpile-only')]

  describe('parseArgs', () => {
    it('parses --experimental-lir-local-copy-rewrite for compile', () => {
      const parsed = parseArgs(['compile', 'file.mcrs', '--experimental-lir-local-copy-rewrite'])

      expect(parsed.experimentalLirLocalCopyRewrite).toBe(true)
      expect(parsed.command).toBe('compile')
      expect(parsed.file).toBe('file.mcrs')
    })

    it('parses declarations command with explicit output path', () => {
      const parsed = parseArgs(['declarations', 'api.mcrs', '--out', 'dist/api.d.mcrs'])

      expect(parsed.command).toBe('declarations')
      expect(parsed.file).toBe('api.mcrs')
      expect(parsed.output).toBe('dist/api.d.mcrs')
    })
  })

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

  describe('declarations CLI', () => {
    it('writes a declaration surface without mutating source files', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-declarations-cli-'))
      const filePath = path.join(tempDir, 'api.mcrs')
      const outPath = path.join(tempDir, 'api.d.mcrs')
      const source = [
        '/** Adds one to a scoreboard value. */',
        'export fn add_one(x: int): int { return x + 1; }',
        'fn internal(): void { say("hidden"); }',
        '/** External particle bridge. */',
        'export declare fn external_fx(id: resource<particle>): void;',
        '/** Custom blue spark particle. */',
        'resource particle mypack:blue_spark;',
        '',
      ].join('\n')
      fs.writeFileSync(filePath, source)

      const result = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'declarations', filePath, '--out', outPath],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(0)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(source)
      const generated = fs.readFileSync(outPath, 'utf-8')
      expect(generated).toContain('/** Adds one to a scoreboard value. */')
      expect(generated).toContain('declare fn add_one(x: int): int;')
      expect(generated).toContain('/** External particle bridge. */')
      expect(generated).toContain('declare fn external_fx(id: resource<particle>): void;')
      expect(generated).toContain('/** Custom blue spark particle. */')
      expect(generated).toContain('resource particle mypack:blue_spark;')
      expect(generated).not.toContain('internal')

      const checkGenerated = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'check', outPath],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )
      expect(checkGenerated.status).toBe(0)
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

  describe('tune CLI', () => {
    it('documents experimental local-copy rewrite flag in help output', () => {
      const result = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, '--help'],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('--experimental-lir-local-copy-rewrite')
      expect(result.stdout).toContain('EXPERIMENTAL')
      expect(result.stdout).toContain('off by default')
    })

    it('documents reviewable tuner artifact options in the main help output', () => {
      const result = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, '--help'],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('redscript tune --adapter <name> [--budget N] [--range min:max] [--samples N] [--out path] [--manifest-out path]')
      expect(result.stdout).toContain('--range <min:max>')
      expect(result.stdout).toContain('--samples <N>')
      expect(result.stdout).toContain('reviewable .mcrs overlay')
    })

    it('runs an existing tuner adapter through the main redscript CLI and writes generated mcrs', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-tune-cli-'))
      const outPath = path.join(tempDir, 'ln_tuned.mcrs')
      const manifestPath = path.join(tempDir, 'ln_tuned.tune.json')

      const result = spawnSync(
        process.execPath,
        [
          '-r',
          ...cliRunner,
          cliPath,
          'tune',
          '--adapter',
          'ln-polynomial',
          '--budget',
          '0',
          '--strategy',
          'nm',
          '--out',
          outPath,
          '--manifest-out',
          manifestPath,
        ],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(0)
      expect(result.stderr).not.toContain('Unknown command')
      expect(result.stdout).toContain('redscript tune — ln-polynomial')
      expect(result.stdout).toContain('Wrote:')
      expect(fs.existsSync(outPath)).toBe(true)
      const generated = fs.readFileSync(outPath, 'utf-8')
      expect(generated).toContain('AUTO-GENERATED by redscript tune')
      expect(generated).toContain('Adapter: ln-polynomial')
      expect(generated).toContain('fn ln(x: int)')

      expect(fs.existsSync(manifestPath)).toBe(true)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(manifest.schemaVersion).toBe(1)
      expect(manifest.adapter).toBe('ln-polynomial')
      expect(manifest.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(manifest.artifact.codePath).toBe(outPath)
      expect(manifest.input).toEqual({ min: 100, max: 1000000, scale: 10000, unit: 'fixed×10000' })
      expect(manifest.output).toEqual({ scale: 10000, unit: 'fixed×10000' })
      expect(manifest.overflowPolicy).toContain('int32')
      expect(manifest.samples).toMatchObject({
        count: expect.any(Number),
        uniqueCount: expect.any(Number),
        min: 100,
        max: 1000000,
        containsDeclaredMin: true,
        containsDeclaredMax: true,
        outOfRangeCount: 0,
      })
      expect(manifest.overflowReport).toEqual({
        nonFiniteSimCount: 0,
        invalidReferenceCount: 0,
      })
      expect(manifest.params).toHaveProperty('A1')
      expect(manifest.metrics.maxError).toEqual(expect.any(Number))
    })

    it('honors custom tuning range and sample count in manifest output', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-tune-cli-range-'))
      const outPath = path.join(tempDir, 'sqrt_tuned.mcrs')
      const manifestPath = path.join(tempDir, 'sqrt_tuned.tune.json')

      const result = spawnSync(
        process.execPath,
        [
          '-r',
          ...cliRunner,
          cliPath,
          'tune',
          '--adapter',
          'sqrt-newton',
          '--budget',
          '0',
          '--strategy',
          'nm',
          '--range',
          '10000:40000',
          '--samples',
          '4',
          '--out',
          outPath,
          '--manifest-out',
          manifestPath,
        ],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(0)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(manifest.sampleSource).toEqual({ kind: 'custom-range', min: 10000, max: 40000, count: 4 })
      expect(manifest.samples).toMatchObject({
        count: 4,
        uniqueCount: 4,
        min: 10000,
        max: 40000,
        containsDeclaredMin: true,
        containsDeclaredMax: true,
        outOfRangeCount: 0,
      })
      expect(manifest.artifact.command).toContain('--range 10000:40000 --samples 4')
    })
  })

  describe('compile CLI', () => {
    it('supports manual experimental local-copy rewrite flag and keeps default compile path available', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-compile-flag-'))
      const filePath = path.join(tempDir, 'main.mcrs')
      const defaultOut = path.join(tempDir, 'off')
      const experimentalOut = path.join(tempDir, 'on')
      fs.writeFileSync(filePath, 'fn f(x: int): int { let t: int = x; t = t + 1; return t; }')

      const defaultResult = spawnSync(
        process.execPath,
        ['-r', ...cliRunner, cliPath, 'compile', filePath, '--namespace', 'localcopy', '-o', defaultOut],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )
      const experimentalResult = spawnSync(
        process.execPath,
        [
          '-r',
          ...cliRunner,
          cliPath,
          'compile',
          filePath,
          '--namespace',
          'localcopy',
          '--experimental-lir-local-copy-rewrite',
          '-o',
          experimentalOut,
        ],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(defaultResult.status).toBe(0)
      expect(experimentalResult.status).toBe(0)

      const defaultFunction = fs.readFileSync(path.join(defaultOut, 'data', 'localcopy', 'function', 'f.mcfunction'), 'utf-8')
      const experimentalFunction = fs.readFileSync(path.join(experimentalOut, 'data', 'localcopy', 'function', 'f.mcfunction'), 'utf-8')

      const scoreOperationCount = (text: string): number => (
        text.match(/scoreboard players operation/g) ?? []
      ).length

      expect(defaultFunction).not.toBe(experimentalFunction)
      expect(scoreOperationCount(defaultFunction)).toBe(3)
      expect(scoreOperationCount(experimentalFunction)).toBe(2)
    })

    it('fails with an explicit incremental guard for experimental local-copy rewrite', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-compile-flag-inc-'))
      const filePath = path.join(tempDir, 'main.mcrs')
      fs.writeFileSync(filePath, 'fn f() { say("hi"); }')

      const result = spawnSync(
        process.execPath,
        [
          '-r',
          ...cliRunner,
          cliPath,
          'compile',
          filePath,
          '--incremental',
          '--experimental-lir-local-copy-rewrite',
        ],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Error: --experimental-lir-local-copy-rewrite is not supported with --incremental')
    })

    it('writes selected compile stage snapshots to a JSON file', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-compile-cli-'))
      const filePath = path.join(tempDir, 'main.mcrs')
      const outDir = path.join(tempDir, 'dist')
      const snapshotPath = path.join(tempDir, 'snapshots.json')
      fs.writeFileSync(filePath, '@on(PlayerJoin)\nfn joined() { say("joined"); }\n')

      const result = spawnSync(
        process.execPath,
        [
          '-r',
          ...cliRunner,
          cliPath,
          'compile',
          filePath,
          '-o',
          outDir,
          '--namespace',
          'snapcli',
          '--snapshot-stages',
          'runtimeAssets,emitDatapack',
          '--snapshot-output',
          snapshotPath,
        ],
        {
          encoding: 'utf-8',
          env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
        }
      )

      expect(result.status).toBe(0)
      expect(result.stderr).not.toContain('Error:')
      expect(fs.existsSync(snapshotPath)).toBe(true)

      const payload = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'))
      expect(payload.file).toBe(filePath)
      expect(payload.namespace).toBe('snapcli')
      expect(payload.stages.map((snapshot: { stage: string }) => snapshot.stage)).toEqual([
        'runtimeAssets',
        'emitDatapack',
      ])
      expect(payload.stages[0].summary.runtimeEventTypes).toEqual(['PlayerJoin'])
      expect(payload.stages[0].summary.runtimeAssetPaths).toEqual(['src/stdlib/events.mcrs'])
      expect(payload.stages[1].summary.files).toBeGreaterThan(0)
    })

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
