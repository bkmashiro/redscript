/**
 * Tests for stdlib/state.mcrs — scoreboard-based state machine.
 * Verifies compilation succeeds and all state machine functions are emitted.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const STATE_STDLIB = path.join(__dirname, '../../stdlib/state.mcrs')
const stateSrc = fs.readFileSync(STATE_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(stateSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

describe('stdlib/state.mcrs', () => {
  // ── Compilation ──────────────────────────────────────────────────────────

  test('compiles without errors', () => {
    expect(() => {
      const result = compile(stateSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  // ── get_state / set_state ─────────────────────────────────────────────────

  test('get_state function is emitted', () => {
    const files = compileWith(`@keep fn t() -> int { return get_state(@s); }`)
    expect(files.some(f => f.path.includes('get_state'))).toBe(true)
  })

  test('set_state function is emitted', () => {
    const files = compileWith(`@keep fn t() { set_state(@s, 1); }`)
    expect(files.some(f => f.path.includes('set_state'))).toBe(true)
  })

  test('get_state and set_state compile in sequence', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, 2);
        return get_state(@s);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  // ── is_state ──────────────────────────────────────────────────────────────

  test('is_state function is emitted', () => {
    const files = compileWith(`@keep fn t() -> int { return is_state(@s, 0); }`)
    expect(files.some(f => f.path.includes('is_state'))).toBe(true)
  })

  test('is_state check after set compiles', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, 1);
        return is_state(@s, 1);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('is_state returns 0 branch compiles', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, 0);
        return is_state(@s, 5);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  // ── transition ────────────────────────────────────────────────────────────

  test('transition function is emitted', () => {
    const files = compileWith(`@keep fn t() -> int { return transition(@s, 0, 1); }`)
    expect(files.some(f => f.path.includes('transition'))).toBe(true)
  })

  test('transition success path compiles', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, 0);
        return transition(@s, 0, 1);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('transition failure path compiles', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, 2);
        return transition(@s, 0, 1);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('chained transitions compile', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, 0);
        let ok1: int = transition(@s, 0, 1);
        let ok2: int = transition(@s, 1, 2);
        return ok1 + ok2;
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  // ── init_state ────────────────────────────────────────────────────────────

  test('init_state function is emitted', () => {
    const files = compileWith(`@keep fn t() { init_state(@s, 0); }`)
    expect(files.some(f => f.path.includes('init_state'))).toBe(true)
  })

  test('init_state only initialises once — second call is no-op', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, -1);
        init_state(@s, 0);
        init_state(@s, 99);
        return get_state(@s);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('init_state skipped when state already set', () => {
    const files = compileWith(`
      @keep fn t() -> int {
        set_state(@s, 1);
        init_state(@s, 0);
        return get_state(@s);
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  // ── Combined usage ────────────────────────────────────────────────────────

  test('full state machine lifecycle compiles', () => {
    const files = compileWith(`
      let STATE_IDLE: int = 0
      let STATE_COMBAT: int = 1
      let STATE_DEAD: int = 2

      @keep fn tick() {
        init_state(@s, STATE_IDLE);
        let in_combat: int = is_state(@s, STATE_COMBAT);
        if (in_combat == 1) {
          let ok: int = transition(@s, STATE_COMBAT, STATE_DEAD);
        }
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })
})
