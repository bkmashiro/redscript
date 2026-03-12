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
      const libPath = path.join(tempDir, 'lib.mcrs')
      const mainPath = path.join(tempDir, 'main.mcrs')

      fs.writeFileSync(libPath, 'fn double(x: int) -> int { return x + x; }\n')
      fs.writeFileSync(mainPath, 'import "./lib.mcrs"\n\nfn main() { let value: int = double(2); }\n')

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'imports', filePath: mainPath })

      expect(result.files.length).toBeGreaterThan(0)
      expect(result.ir.functions.some(fn => fn.name === 'double')).toBe(true)
      expect(result.ir.functions.some(fn => fn.name === 'main')).toBe(true)
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

      expect(result.ir.functions.filter(fn => fn.name === 'from_a')).toHaveLength(1)
      expect(result.ir.functions.filter(fn => fn.name === 'from_b')).toHaveLength(1)
    })

    it('uses rs-prefixed scoreboard objectives for imported stdlib files', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-stdlib-'))
      const stdlibDir = path.join(tempDir, 'src', 'stdlib')
      const stdlibPath = path.join(stdlibDir, 'timer.mcrs')
      const mainPath = path.join(tempDir, 'main.mcrs')

      fs.mkdirSync(stdlibDir, { recursive: true })
      fs.writeFileSync(stdlibPath, 'fn tick_timer() { scoreboard_set("#rs", "timer_ticks", 1); }\n')
      fs.writeFileSync(mainPath, 'import "./src/stdlib/timer.mcrs"\n\nfn main() { tick_timer(); }\n')

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'mygame', filePath: mainPath })
      const tickTimer = result.files.find(file => file.path.endsWith('/tick_timer.mcfunction'))

      expect(tickTimer?.content).toContain('scoreboard players set #rs rs.timer_ticks 1')
    })

    it('adds a call-site hash for stdlib internal scoreboard objectives', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-stdlib-hash-'))
      const stdlibDir = path.join(tempDir, 'src', 'stdlib')
      const stdlibPath = path.join(stdlibDir, 'timer.mcrs')
      const mainPath = path.join(tempDir, 'main.mcrs')

      fs.mkdirSync(stdlibDir, { recursive: true })
      fs.writeFileSync(stdlibPath, [
        'fn timer_start(name: string, duration: int) {',
        '  scoreboard_set("timer_ticks", #rs, duration);',
        '  scoreboard_set("timer_active", #rs, 1);',
        '}',
        '',
      ].join('\n'))
      fs.writeFileSync(mainPath, [
        'import "./src/stdlib/timer.mcrs"',
        '',
        'fn main() {',
        '  timer_start("x", 100);',
        '  timer_start("x", 100);',
        '}',
        '',
      ].join('\n'))

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'mygame', filePath: mainPath })
      const timerFns = result.files.filter(file => /timer_start__callsite_[0-9a-f]{4}\.mcfunction$/.test(file.path))

      expect(timerFns).toHaveLength(2)

      const objectives = timerFns
        .flatMap(file => [...file.content.matchAll(/rs\._timer_([0-9a-f]{4})/g)].map(match => match[0]))

      expect(new Set(objectives).size).toBe(2)
    })

    it('Timer::new creates timer', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-timer-new-'))
      const mainPath = path.join(tempDir, 'main.mcrs')
      const timerPath = path.resolve(process.cwd(), 'src/stdlib/timer.mcrs')

      fs.writeFileSync(mainPath, [
        `import "${timerPath}"`,
        '',
        'fn main() {',
        '  let timer: Timer = Timer::new(20);',
        '}',
        '',
      ].join('\n'))

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'timernew', filePath: mainPath })

      expect(result.typeErrors).toEqual([])
      const newFn = result.files.find(file => file.path.endsWith('/Timer_new.mcfunction'))
      expect(newFn?.content).toContain('scoreboard players set timer_ticks rs 0')
      expect(newFn?.content).toContain('scoreboard players set timer_active rs 0')
    })

    it('Timer.start/pause/reset', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-timer-state-'))
      const mainPath = path.join(tempDir, 'main.mcrs')
      const timerPath = path.resolve(process.cwd(), 'src/stdlib/timer.mcrs')

      fs.writeFileSync(mainPath, [
        `import "${timerPath}"`,
        '',
        'fn main() {',
        '  let timer: Timer = Timer::new(20);',
        '  timer.start();',
        '  timer.pause();',
        '  timer.reset();',
        '}',
        '',
      ].join('\n'))

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'timerstate', filePath: mainPath })

      expect(result.typeErrors).toEqual([])
      const startFn = result.files.find(file => file.path.endsWith('/Timer_start.mcfunction'))
      const pauseFn = result.files.find(file => file.path.endsWith('/Timer_pause.mcfunction'))
      const resetFn = result.files.find(file => file.path.endsWith('/Timer_reset.mcfunction'))

      expect(startFn?.content).toContain('scoreboard players set timer_active rs 1')
      expect(pauseFn?.content).toContain('scoreboard players set timer_active rs 0')
      expect(resetFn?.content).toContain('scoreboard players set timer_ticks rs 0')
    })

    it('Timer.done returns bool', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-timer-done-'))
      const mainPath = path.join(tempDir, 'main.mcrs')
      const timerPath = path.resolve(process.cwd(), 'src/stdlib/timer.mcrs')

      fs.writeFileSync(mainPath, [
        `import "${timerPath}"`,
        '',
        'fn main() {',
        '  let timer: Timer = Timer::new(20);',
        '  let finished: bool = timer.done();',
        '  if (finished) {',
        '    say("done");',
        '  }',
        '}',
        '',
      ].join('\n'))

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'timerdone', filePath: mainPath })

      expect(result.typeErrors).toEqual([])
      const doneFn = result.files.find(file => file.path.endsWith('/Timer_done.mcfunction'))
      const mainFn = result.files.find(file => file.path.endsWith('/main.mcfunction'))
      expect(doneFn?.content).toContain('scoreboard players get timer_ticks rs')
      expect(doneFn?.content).toContain('return run scoreboard players get')
      expect(mainFn?.content).toContain('execute if score $finished rs matches 1..')
    })

    it('Timer.tick increments', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-timer-tick-'))
      const mainPath = path.join(tempDir, 'main.mcrs')
      const timerPath = path.resolve(process.cwd(), 'src/stdlib/timer.mcrs')

      fs.writeFileSync(mainPath, [
        `import "${timerPath}"`,
        '',
        'fn main() {',
        '  let timer: Timer = Timer::new(20);',
        '  timer.start();',
        '  timer.tick();',
        '}',
        '',
      ].join('\n'))

      const source = fs.readFileSync(mainPath, 'utf-8')
      const result = compile(source, { namespace: 'timertick', filePath: mainPath })

      expect(result.typeErrors).toEqual([])
      const tickOutput = result.files
        .filter(file => file.path.includes('/Timer_tick'))
        .map(file => file.content)
        .join('\n')

      expect(tickOutput).toContain('scoreboard players get timer_active rs')
      expect(tickOutput).toContain('scoreboard players get timer_ticks rs')
      expect(tickOutput).toContain(' += $const_1 rs')
      expect(tickOutput).toContain('execute store result score timer_ticks rs run scoreboard players get $_')
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
      const inputPath = path.join(tempDir, 'input.mcrs')
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
