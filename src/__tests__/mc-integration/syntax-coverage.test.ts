/**
 * RedScript MC Integration Tests — Syntax Coverage
 *
 * Tests all syntax features documented in reference/syntax.md against a real
 * Paper 1.21.4 server with TestHarnessPlugin. Each test case covers one syntax
 * feature end-to-end: compile → deploy → run in MC → verify scoreboard output.
 *
 * Goal: identify which documented syntax features are real vs. "fake syntax"
 * (AI hallucinations written into docs).
 *
 * Prerequisites:
 *   - Paper server running with TestHarnessPlugin on port 25561
 *   - MC_SERVER_DIR env var pointing to server directory
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest syntax-coverage --testTimeout=120000
 *
 * Syntax features tested:
 *   1. for-each     (for x in arr { ... })
 *   2. match        (match (v) { 1 => { ... } _ => { ... } })
 *   3. Option if let (Option<T>, Some(v), None, if let Some(x) = opt { ... })
 *   4. impl methods (impl Block { fn new(): T { } fn method(self): T { } })
 *   5. nested struct (struct inside struct field)
 *   6. array as function param (fn f(items: int[], n: int): int { ... })
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

const NS = 'sc_syntax_cov'

let serverOnline = false
let mc: MCTestClient

// ---------------------------------------------------------------------------
// Helper: compile a RedScript snippet and write to the test datapack
// ---------------------------------------------------------------------------
function writeFixture(source: string, namespace: string): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(
      path.join(DATAPACK_DIR, 'pack.mcmeta'),
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests' } })
    )
  }

  // compile() throws on error (does not return success: false)
  const result = compile(source, { namespace })

  for (const file of result.files ?? []) {
    if (file.path === 'pack.mcmeta') continue
    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    // Merge minecraft tag files (tick.json / load.json) instead of overwriting
    if (file.path.includes('data/minecraft/tags/') && fs.existsSync(filePath)) {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const incoming = JSON.parse(file.content)
      const merged = {
        values: [...new Set([...(existing.values ?? []), ...(incoming.values ?? [])])],
      }
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2))
    } else {
      fs.writeFileSync(filePath, file.content)
    }
  }
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  mc = new MCTestClient(MC_HOST, MC_PORT)

  try {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await mc.isOnline()) { serverOnline = true; break }
      await new Promise(r => setTimeout(r, 1000))
    }
  } catch {
    serverOnline = false
  }

  if (!serverOnline) {
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — all syntax-coverage tests will be skipped`)
    return
  }

  // Ensure scoreboard objectives exist (ignore errors if already present)
  for (const obj of ['#total', '#r1', '#test', '#opt_val', '#impl_val', '#nested_x', '#nested_w', '#arr_sum']) {
    await mc.command(`/scoreboard objectives add ${obj} dummy`).catch(() => {})
  }

  console.log('  syntax-coverage setup complete.')
}, 30_000)

// ---------------------------------------------------------------------------
// 1. for-each: for x in arr { ... }
// ---------------------------------------------------------------------------

describe('Syntax: for-each (for x in arr)', () => {
  const FEATURE_NS = `${NS}_foreach`

  // NOTE: for x in arr compiles successfully (PASS at unit level).
  // This test verifies the emitted datapack produces correct runtime results.

  test('compile: for x in arr { } succeeds', () => {
    // This should compile without errors — if it throws, it's a fake/broken syntax
    expect(() =>
      writeFixture(`
        fn test_foreach(p: Player) {
          let arr: int[] = [1,2,3,4,5]
          let total: int = 0
          for x in arr {
            total = total + x
          }
          scoreboard_set(p, #total, total)
        }
      `, FEATURE_NS)
    ).not.toThrow()
  })

  test('runtime: for x in arr accumulates sum to 15', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    // Reset scoreboard
    await mc.command('/scoreboard players set TestBot #total 0')
    await mc.ticks(2)

    // Run the function as TestBot
    await mc.command(`/execute as TestBot run function ${FEATURE_NS}:test_foreach`)
    await mc.ticks(5)

    const score = await mc.scoreboard('TestBot', '#total')
    if (score !== 15) {
      console.error(`  for-each: expected 15, got ${score}`)
    }
    expect(score).toBe(15)
    console.log(`  for-each: #total = ${score} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 2. match expression: match (v) { 1 => { } 2 => { } _ => { } }
// ---------------------------------------------------------------------------

describe('Syntax: match expression', () => {
  const FEATURE_NS = `${NS}_match`

  test('compile: match (v) { 1 => { } 2 => { } _ => { } } succeeds', () => {
    expect(() =>
      writeFixture(`
        fn test_match(p: Player) {
          let v: int = 2
          match (v) {
            1 => { scoreboard_set(p, #r1, 10) }
            2 => { scoreboard_set(p, #r1, 20) }
            _ => { scoreboard_set(p, #r1, -1) }
          }
        }
      `, FEATURE_NS)
    ).not.toThrow()
  })

  test('runtime: match arm 2 sets #r1 = 20', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    await mc.command('/scoreboard players set TestBot #r1 0')
    await mc.ticks(2)

    await mc.command(`/execute as TestBot run function ${FEATURE_NS}:test_match`)
    await mc.ticks(5)

    const score = await mc.scoreboard('TestBot', '#r1')
    if (score !== 20) {
      console.error(`  match: expected 20 (arm v=2), got ${score}`)
    }
    expect(score).toBe(20)
    console.log(`  match: #r1 = ${score} ✓`)
  }, 30_000)

  test('runtime: match wildcard arm fires for unmatched value', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    // Use a variant with v = 99 → falls through to _ arm → sets -1
    writeFixture(`
      fn test_match_wildcard(p: Player) {
        let v: int = 99
        match (v) {
          1 => { scoreboard_set(p, #r1, 10) }
          2 => { scoreboard_set(p, #r1, 20) }
          _ => { scoreboard_set(p, #r1, -1) }
        }
      }
    `, `${FEATURE_NS}_wc`)
    await mc.reload()
    await mc.ticks(5)

    await mc.command('/scoreboard players set TestBot #r1 0')
    await mc.ticks(2)

    await mc.command(`/execute as TestBot run function ${FEATURE_NS}_wc:test_match_wildcard`)
    await mc.ticks(5)

    const score = await mc.scoreboard('TestBot', '#r1')
    if (score !== -1) {
      console.error(`  match wildcard: expected -1, got ${score}`)
    }
    expect(score).toBe(-1)
    console.log(`  match wildcard: #r1 = ${score} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 3. Option<T> with if let Some(x) = opt { ... }
// ---------------------------------------------------------------------------

describe('Syntax: Option<T> and if let Some(x)', () => {
  const FEATURE_NS = `${NS}_option`

  test('compile: Option<int>, Some(v), None, if let Some(x) = opt succeeds', () => {
    expect(() =>
      writeFixture(`
        fn make_opt(flag: int): Option<int> {
          if (flag == 1) {
            return Some(42)
          }
          return None
        }

        fn test_option() {
          let o: Option<int> = make_opt(1)
          if let Some(v) = o {
            scoreboard_set("#opt_val", #test, v)
          }
        }
      `, FEATURE_NS)
    ).not.toThrow()
  })

  test('runtime: Some(42) extracted by if let → #opt_val = 42', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    await mc.command('/scoreboard players set #opt_val #test 0')
    await mc.ticks(2)

    await mc.command(`/function ${FEATURE_NS}:test_option`)
    await mc.ticks(5)

    const score = await mc.scoreboard('#opt_val', '#test')
    if (score !== 42) {
      console.error(`  Option if let Some: expected 42, got ${score}`)
    }
    expect(score).toBe(42)
    console.log(`  Option if let Some: #opt_val = ${score} ✓`)
  }, 30_000)

  test('runtime: None path → if let Some skips body (score stays 0)', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    writeFixture(`
      fn make_opt_none(flag: int): Option<int> {
        if (flag == 1) {
          return Some(42)
        }
        return None
      }

      fn test_option_none() {
        let o: Option<int> = make_opt_none(0)
        if let Some(v) = o {
          scoreboard_set("#opt_val", #test, v)
        }
      }
    `, `${FEATURE_NS}_none`)
    await mc.reload()
    await mc.ticks(5)

    // Reset to sentinel
    await mc.command('/scoreboard players set #opt_val #test 999')
    await mc.ticks(2)

    await mc.command(`/function ${FEATURE_NS}_none:test_option_none`)
    await mc.ticks(5)

    const score = await mc.scoreboard('#opt_val', '#test')
    // If None path correctly skips body, score remains 999
    expect(score).toBe(999)
    console.log(`  Option None skips if let body: #opt_val = ${score} (stay 999) ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 4. impl methods (static + self)
// ---------------------------------------------------------------------------

describe('Syntax: impl block methods (static + self)', () => {
  const FEATURE_NS = `${NS}_impl`

  test('compile: impl Counter { fn new() fn inc(self) fn get(self) } succeeds', () => {
    expect(() =>
      writeFixture(`
        struct Counter { val: int }

        impl Counter {
          fn new(): Counter { return Counter { val: 0 } }
          fn inc(self): Counter { return Counter { val: self.val + 1 } }
          fn get(self): int { return self.val }
        }

        fn test_impl() {
          let c: Counter = Counter::new()
          c = c.inc()
          c = c.inc()
          c = c.inc()
          scoreboard_set("#impl_val", #test, c.get())
        }
      `, FEATURE_NS)
    ).not.toThrow()
  })

  test('runtime: Counter::new() + 3x inc() + get() → #impl_val = 3', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    await mc.command('/scoreboard players set #impl_val #test 0')
    await mc.ticks(2)

    await mc.command(`/function ${FEATURE_NS}:test_impl`)
    await mc.ticks(10)

    const score = await mc.scoreboard('#impl_val', '#test')
    if (score !== 3) {
      console.error(`  impl: Counter::new() + 3x inc() + get() — expected 3, got ${score}`)
    }
    expect(score).toBe(3)
    console.log(`  impl: #impl_val = ${score} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 5. Nested struct (struct with struct-typed field)
// ---------------------------------------------------------------------------

describe('Syntax: nested struct (struct field of struct type)', () => {
  const FEATURE_NS = `${NS}_nested`

  test('compile: struct Vec2 { x,y } struct Rect { pos: Vec2, w, h } succeeds', () => {
    expect(() =>
      writeFixture(`
        struct Vec2 { x: int, y: int }
        struct Rect { pos: Vec2, w: int, h: int }

        fn test_nested() {
          let r: Rect = Rect { pos: Vec2 { x: 10, y: 20 }, w: 100, h: 50 }
          scoreboard_set("#nested_x", #test, r.pos.x)
          scoreboard_set("#nested_w", #test, r.w)
        }
      `, FEATURE_NS)
    ).not.toThrow()
  })

  test('runtime: r.pos.x = 10 and r.w = 100', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    await mc.command('/scoreboard players set #nested_x #test 0')
    await mc.command('/scoreboard players set #nested_w #test 0')
    await mc.ticks(2)

    await mc.command(`/function ${FEATURE_NS}:test_nested`)
    await mc.ticks(5)

    const x = await mc.scoreboard('#nested_x', '#test')
    const w = await mc.scoreboard('#nested_w', '#test')

    if (x !== 10) console.error(`  nested struct: r.pos.x expected 10, got ${x}`)
    if (w !== 100) console.error(`  nested struct: r.w expected 100, got ${w}`)

    expect(x).toBe(10)
    expect(w).toBe(100)
    console.log(`  nested struct: r.pos.x = ${x}, r.w = ${w} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 6. Array as function parameter
// ---------------------------------------------------------------------------

describe('Syntax: array as function parameter (int[])', () => {
  const FEATURE_NS = `${NS}_arrparam`

  test('compile: fn sum_arr(items: int[], n: int): int { ... } succeeds', () => {
    expect(() =>
      writeFixture(`
        fn sum_arr(items: int[], n: int): int {
          let total: int = 0
          for i in 0..n {
            total = total + items[i]
          }
          return total
        }

        fn test_arr_param() {
          let nums: int[] = [10, 20, 30, 40, 50]
          let s: int = sum_arr(nums, 5)
          scoreboard_set("#arr_sum", #test, s)
        }
      `, FEATURE_NS)
    ).not.toThrow()
  })

  test('runtime: sum_arr([10,20,30,40,50], 5) → #arr_sum = 150', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    await mc.command('/scoreboard players set #arr_sum #test 0')
    await mc.ticks(2)

    await mc.command(`/function ${FEATURE_NS}:test_arr_param`)
    await mc.ticks(10)

    const score = await mc.scoreboard('#arr_sum', '#test')
    if (score !== 150) {
      console.error(`  array param: sum_arr([10,20,30,40,50], 5) — expected 150, got ${score}`)
    }
    expect(score).toBe(150)
    console.log(`  array param: #arr_sum = ${score} ✓`)
  }, 30_000)

  test('runtime: partial sum — sum_arr([10,20,30,40,50], 3) → 60', async () => {
    if (!serverOnline) {
      console.warn('  SKIP: server offline')
      return
    }

    writeFixture(`
      fn sum_arr_partial(items: int[], n: int): int {
        let total: int = 0
        for i in 0..n {
          total = total + items[i]
        }
        return total
      }

      fn test_arr_param_partial() {
        let nums: int[] = [10, 20, 30, 40, 50]
        let s: int = sum_arr_partial(nums, 3)
        scoreboard_set("#arr_sum", #test, s)
      }
    `, `${FEATURE_NS}_3`)
    await mc.reload()
    await mc.ticks(5)

    await mc.command('/scoreboard players set #arr_sum #test 0')
    await mc.ticks(2)

    await mc.command(`/function ${FEATURE_NS}_3:test_arr_param_partial`)
    await mc.ticks(10)

    const score = await mc.scoreboard('#arr_sum', '#test')
    if (score !== 60) {
      console.error(`  array param partial: sum_arr(_, 3) — expected 60, got ${score}`)
    }
    expect(score).toBe(60)
    console.log(`  array param partial: #arr_sum = ${score} ✓`)
  }, 30_000)
})
