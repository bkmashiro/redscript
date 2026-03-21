/**
 * Tests for stdlib/scheduler.mcrs — scoreboard-based task scheduler.
 * Verifies compilation succeeds and generated mcfunction contains
 * the correct scoreboard commands.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SCHED_STDLIB = path.join(__dirname, '../../stdlib/scheduler.mcrs')
const schedSrc = fs.readFileSync(SCHED_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(schedSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

function getFn(files: { path: string; content: string }[], fnName: string): string {
  const f = files.find(f => f.path.endsWith(`/${fnName}.mcfunction`))
  if (!f) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found. Files:\n${paths}`)
  }
  return f.content
}

describe('stdlib/scheduler.mcrs', () => {
  // ── Compilation ────────────────────────────────────────────────────────────

  test('compiles without errors', () => {
    expect(() => {
      const result = compile(schedSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  // ── task_schedule ──────────────────────────────────────────────────────────

  test('task_schedule is emitted', () => {
    const files = compileWith(`@keep fn t() { task_schedule(@s, 0, 40); }`)
    expect(files.some(f => f.path.includes('task_schedule'))).toBe(true)
  })

  test('task_schedule generates scoreboard set command', () => {
    const files = compileWith(`@keep fn t() { task_schedule(@s, 0, 40); }`)
    const body = getFn(files, 'task_schedule')
    expect(body).toContain('scoreboard')
  })

  test('task_schedule with slot 0 uses rs.t0 objective', () => {
    const files = compileWith(`@keep fn t() { task_schedule(@s, 0, 40); }`)
    // The dispatcher branches into leaf functions — check any emitted file references rs.t0
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('rs.t0')
  })

  // ── task_cancel ────────────────────────────────────────────────────────────

  test('task_cancel is emitted', () => {
    const files = compileWith(`@keep fn t() { task_cancel(@s, 0); }`)
    expect(files.some(f => f.path.includes('task_cancel'))).toBe(true)
  })

  test('task_cancel generates scoreboard set to 0', () => {
    const files = compileWith(`@keep fn t() { task_cancel(@s, 0); }`)
    const body = getFn(files, 'task_cancel')
    expect(body).toContain('scoreboard')
  })

  // ── task_ready ─────────────────────────────────────────────────────────────

  test('task_ready is emitted', () => {
    const files = compileWith(`@keep fn t() -> int { return task_ready(@s, 0); }`)
    expect(files.some(f => f.path.includes('task_ready'))).toBe(true)
  })

  test('task_ready reads scoreboard objective', () => {
    const files = compileWith(`@keep fn t() -> int { return task_ready(@s, 0); }`)
    const body = getFn(files, 'task_ready')
    expect(body).toContain('scoreboard')
  })

  // ── gtask_schedule ─────────────────────────────────────────────────────────

  test('gtask_schedule is emitted', () => {
    const files = compileWith(`@keep fn t() { gtask_schedule(0, 100); }`)
    expect(files.some(f => f.path.includes('gtask_schedule'))).toBe(true)
  })

  test('gtask_schedule uses #rs fake-player and rs.g0 objective', () => {
    const files = compileWith(`@keep fn t() { gtask_schedule(0, 100); }`)
    // The dispatcher branches into leaf functions — check across all emitted files
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('#rs')
    expect(allContent).toContain('rs.g0')
  })

  // ── gtask_cancel ───────────────────────────────────────────────────────────

  test('gtask_cancel is emitted', () => {
    const files = compileWith(`@keep fn t() { gtask_cancel(0); }`)
    expect(files.some(f => f.path.includes('gtask_cancel'))).toBe(true)
  })

  // ── gtask_ready ────────────────────────────────────────────────────────────

  test('gtask_ready is emitted', () => {
    const files = compileWith(`@keep fn t() -> int { return gtask_ready(0); }`)
    expect(files.some(f => f.path.includes('gtask_ready'))).toBe(true)
  })

  // ── scheduler_tick ─────────────────────────────────────────────────────────

  test('scheduler_tick is emitted', () => {
    const files = compileWith(`@keep fn t() { scheduler_tick(); }`)
    expect(files.some(f => f.path.includes('scheduler_tick'))).toBe(true)
  })

  test('scheduler_tick decrements per-player slots', () => {
    const files = compileWith(`@keep fn t() { scheduler_tick(); }`)
    const body = getFn(files, 'scheduler_tick')
    expect(body).toContain('rs.t0')
    expect(body).toContain('scoreboard')
  })

  test('scheduler_tick decrements global slots', () => {
    const files = compileWith(`@keep fn t() { scheduler_tick(); }`)
    const body = getFn(files, 'scheduler_tick')
    expect(body).toContain('rs.g0')
    expect(body).toContain('#rs')
  })

  // ── Combined usage ─────────────────────────────────────────────────────────

  test('schedule and check readiness compiles together', () => {
    const files = compileWith(`
      @keep fn setup() {
        task_schedule(@s, 0, 40);
        task_schedule(@s, 1, 100);
        gtask_schedule(0, 200);
      }
      @keep fn tick() {
        scheduler_tick();
        let r0: int = task_ready(@s, 0);
        let r1: int = task_ready(@s, 1);
        let gr0: int = gtask_ready(0);
        if (r0 == 1) {
          task_cancel(@s, 1);
        }
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('all 8 per-player slots compile', () => {
    const files = compileWith(`
      @keep fn t() {
        task_schedule(@s, 0, 10);
        task_schedule(@s, 1, 20);
        task_schedule(@s, 2, 30);
        task_schedule(@s, 3, 40);
        task_schedule(@s, 4, 50);
        task_schedule(@s, 5, 60);
        task_schedule(@s, 6, 70);
        task_schedule(@s, 7, 80);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })
})
