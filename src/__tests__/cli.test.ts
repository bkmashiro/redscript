import { compile, check } from '../index'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'

// Note: watch command is tested manually as it's an interactive long-running process

describe('CLI API', () => {
  describe('imports', () => {
    it('compiles a file with imported helpers', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-imports-'))
      const libPath = path.join(tempDir, 'lib.rs')
      const mainPath = path.join(tempDir, 'main.rs')

      fs.writeFileSync(libPath, 'fn double(x: int) -> int { return x + x; }\n')
      fs.writeFileSync(mainPath, 'import "./lib.rs"\n\nfn main() { let value: int = double(2); }\n')

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'imports', filePath: mainPath })

      expect(result.files.length).toBeGreaterThan(0)
      expect(result.ir.functions.some(fn => fn.name === 'double')).toBe(true)
      expect(result.ir.functions.some(fn => fn.name === 'main')).toBe(true)
    })

    it('deduplicates circular imports', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-circular-'))
      const aPath = path.join(tempDir, 'a.rs')
      const bPath = path.join(tempDir, 'b.rs')
      const mainPath = path.join(tempDir, 'main.rs')

      fs.writeFileSync(aPath, 'import "./b.rs"\n\nfn from_a() -> int { return 1; }\n')
      fs.writeFileSync(bPath, 'import "./a.rs"\n\nfn from_b() -> int { return from_a(); }\n')
      fs.writeFileSync(mainPath, 'import "./a.rs"\n\nfn main() { let value: int = from_b(); }\n')

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'circular', filePath: mainPath })

      expect(result.ir.functions.filter(fn => fn.name === 'from_a')).toHaveLength(1)
      expect(result.ir.functions.filter(fn => fn.name === 'from_b')).toHaveLength(1)
    })
  })

  describe('compile()', () => {
    it('compiles simple source', () => {
      const source = 'fn test() { say("hello"); }'
      const result = compile(source, { namespace: 'mypack' })
      expect(result.files.length).toBeGreaterThan(0)
      expect(result.ast.namespace).toBe('mypack')
      expect(result.ir.functions.length).toBe(1)
    })

    it('uses default namespace', () => {
      const source = 'fn test() {}'
      const result = compile(source)
      expect(result.ast.namespace).toBe('redscript')
    })

    it('generates correct file structure', () => {
      const source = 'fn test() { say("hello"); }'
      const result = compile(source, { namespace: 'game' })
      
      const paths = result.files.map(f => f.path)
      expect(paths).toContain('pack.mcmeta')
      expect(paths).toContain('data/game/function/__load.mcfunction')
      expect(paths.some(p => p.includes('test.mcfunction'))).toBe(true)
    })

    it('collects optimizer stats', () => {
      const source = `
fn build() {
  foreach (turret in @e[tag=turret]) {
    let range: int = scoreboard_get("config", "turret_range");
    if (range > 0) {
      if (range > -1) {
        say("ready");
      }
    }
  }
}
`

      const result = compile(source, { namespace: 'stats' })
      expect(result.stats?.licmHoists).toBeGreaterThan(0)
      expect(result.stats?.totalCommandsBefore).toBeGreaterThan(result.stats?.totalCommandsAfter ?? 0)
      expect(result.stats?.deadCodeRemoved).toBeGreaterThanOrEqual(0)
    })
  })

  describe('--stats flag', () => {
    it('prints optimizer statistics', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-stats-'))
      const inputPath = path.join(tempDir, 'input.rs')
      const outputDir = path.join(tempDir, 'out')

      fs.writeFileSync(inputPath, 'fn build() { setblock((0, 64, 0), "minecraft:stone"); setblock((1, 64, 0), "minecraft:stone"); }')

      const stdout = execFileSync(
        process.execPath,
        ['-r', 'ts-node/register', path.join(process.cwd(), 'src/cli.ts'), 'compile', inputPath, '-o', outputDir, '--stats'],
        { cwd: process.cwd(), encoding: 'utf-8' }
      )

      expect(stdout).toContain('Optimizations applied:')
      expect(stdout).toContain('setblock batching:')
      expect(stdout).toContain('Total mcfunction commands:')
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
})
