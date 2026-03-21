/**
 * RedScript MC Integration Tests — Syntax Coverage
 *
 * Tests all syntax features documented in reference/syntax.md against a real
 * Paper 1.21.4 server with TestHarnessPlugin.
 *
 * Run: npx jest syntax-coverage --forceExit
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

const NS = 'sc_syn'

let serverOnline = false
let mc: MCTestClient

function writeFixture(source: string, namespace: string): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(
      path.join(DATAPACK_DIR, 'pack.mcmeta'),
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests' } })
    )
  }

  const result = compile(source, { namespace })

  for (const file of result.files ?? []) {
    if (file.path === 'pack.mcmeta') continue
    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

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

beforeAll(async () => {
  if (process.env.MC_OFFLINE === 'true') {
    console.warn('⚠ MC_OFFLINE=true — skipping syntax-coverage integration tests')
    return
  }

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
    console.warn(`⚠ MC server not running — all syntax-coverage tests will be skipped`)
    return
  }

  // Create shared scoreboard objective for all tests
  await mc.command('/scoreboard objectives add sc_out dummy').catch(() => {})
  await mc.ticks(2)

  console.log('  syntax-coverage setup complete.')
}, 30_000)

// ---------------------------------------------------------------------------
// 1. for-each: for x in arr { ... }
// ---------------------------------------------------------------------------

describe('Syntax: for-each (for x in arr)', () => {
  const FNS = `${NS}_foreach`

  beforeAll(async () => {
    if (!serverOnline) return
    writeFixture(`
      module ${FNS}

      @load fn __load() {
        raw("scoreboard objectives add sc_out dummy")
      }

      fn test_foreach() {
        let arr: int[] = [1,2,3,4,5]
        let total: int = 0
        for x in arr {
          total = total + x
        }
        scoreboard_set("#foreach_out", "sc_out", total)
      }
    `, FNS)
    await mc.reload()
    await mc.ticks(5)
    await mc.command(`/function ${FNS}:__load`).catch(() => {})
    await mc.ticks(3)
  }, 30_000)

  test('compile: for x in arr { } succeeds', () => {
    expect(() =>
      compile(`fn f() { let a: int[] = [1,2,3]; let t: int = 0; for x in a { t = t + x } }`, { namespace: 'tmp' })
    ).not.toThrow()
  })

  test('runtime: for x in arr accumulates sum to 15', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #foreach_out sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_foreach`)
    await mc.ticks(5)

    const score = await mc.scoreboard('#foreach_out', 'sc_out')
    expect(score).toBe(15)
    console.log(`  for-each: sum([1..5]) = ${score} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 2. match expression
// ---------------------------------------------------------------------------

describe('Syntax: match expression', () => {
  const FNS = `${NS}_match`

  beforeAll(async () => {
    if (!serverOnline) return
    writeFixture(`
      module ${FNS}

      @load fn __load() {
        raw("scoreboard objectives add sc_out dummy")
      }

      fn test_match_2() {
        let v: int = 2
        match v {
          1 => { scoreboard_set("#match_out", "sc_out", 10) }
          2 => { scoreboard_set("#match_out", "sc_out", 20) }
          _ => { scoreboard_set("#match_out", "sc_out", -1) }
        }
      }

      fn test_match_wild() {
        let v: int = 99
        match v {
          1 => { scoreboard_set("#match_out", "sc_out", 10) }
          2 => { scoreboard_set("#match_out", "sc_out", 20) }
          _ => { scoreboard_set("#match_out", "sc_out", -1) }
        }
      }
    `, FNS)
    await mc.reload()
    await mc.ticks(5)
    await mc.command(`/function ${FNS}:__load`).catch(() => {})
    await mc.ticks(3)
  }, 30_000)

  test('compile: match v { 1 => {} _ => {} } succeeds', () => {
    expect(() =>
      compile(`fn f() { let v: int = 1; match v { 1 => { } _ => { } } }`, { namespace: 'tmp' })
    ).not.toThrow()
  })

  test('runtime: match arm 2 → 20', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #match_out sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_match_2`)
    await mc.ticks(5)

    const score = await mc.scoreboard('#match_out', 'sc_out')
    expect(score).toBe(20)
    console.log(`  match(v=2): #match_out = ${score} ✓`)
  }, 30_000)

  test('runtime: wildcard arm fires for unmatched value → -1', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #match_out sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_match_wild`)
    await mc.ticks(5)

    const score = await mc.scoreboard('#match_out', 'sc_out')
    expect(score).toBe(-1)
    console.log(`  match(v=99) wildcard: #match_out = ${score} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 3. Option<T> with if let Some(x)
// ---------------------------------------------------------------------------

describe('Syntax: Option<T> and if let Some(x)', () => {
  const FNS = `${NS}_option`

  beforeAll(async () => {
    if (!serverOnline) return
    writeFixture(`
      module ${FNS}

      @load fn __load() {
        raw("scoreboard objectives add sc_out dummy")
      }

      fn make_opt(flag: int): Option<int> {
        if (flag == 1) {
          return Some(42)
        }
        return None
      }

      fn test_some() {
        let o: Option<int> = make_opt(1)
        if let Some(v) = o {
          scoreboard_set("#opt_out", "sc_out", v)
        }
      }

      fn test_none() {
        let o: Option<int> = make_opt(0)
        if let Some(v) = o {
          scoreboard_set("#opt_out", "sc_out", v)
        }
      }
    `, FNS)
    await mc.reload()
    await mc.ticks(5)
    await mc.command(`/function ${FNS}:__load`).catch(() => {})
    await mc.ticks(3)
  }, 30_000)

  test('compile: Option<int>, Some(v), None, if let Some(x) = opt succeeds', () => {
    expect(() =>
      compile(`fn f(): Option<int> { return Some(1) } fn g() { let o: Option<int> = f(); if let Some(v) = o { } }`, { namespace: 'tmp' })
    ).not.toThrow()
  })

  test('runtime: Some(42) extracted by if let → #opt_out = 42', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #opt_out sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_some`)
    await mc.ticks(5)

    const score = await mc.scoreboard('#opt_out', 'sc_out')
    expect(score).toBe(42)
    console.log(`  Option Some(42): #opt_out = ${score} ✓`)
  }, 30_000)

  test('runtime: None path → if let body skipped (score stays 999)', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #opt_out sc_out 999')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_none`)
    await mc.ticks(5)

    const score = await mc.scoreboard('#opt_out', 'sc_out')
    expect(score).toBe(999)
    console.log(`  Option None: score stays ${score} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 4. impl block methods
// ---------------------------------------------------------------------------

describe('Syntax: impl block methods (static + self)', () => {
  const FNS = `${NS}_impl`

  beforeAll(async () => {
    if (!serverOnline) return
    writeFixture(`
      module ${FNS}

      @load fn __load() {
        raw("scoreboard objectives add sc_out dummy")
      }

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
        scoreboard_set("#impl_out", "sc_out", c.get())
      }
    `, FNS)
    await mc.reload()
    await mc.ticks(5)
    await mc.command(`/function ${FNS}:__load`).catch(() => {})
    await mc.ticks(3)
  }, 30_000)

  test('compile: impl Counter { fn new() fn inc(self) fn get(self) } succeeds', () => {
    expect(() =>
      compile(`struct C { v: int } impl C { fn new(): C { return C { v: 0 } } fn get(self): int { return self.v } }`, { namespace: 'tmp' })
    ).not.toThrow()
  })

  test('runtime: Counter::new() + 3x inc() + get() → #impl_out = 3', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #impl_out sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_impl`)
    await mc.ticks(10)

    const score = await mc.scoreboard('#impl_out', 'sc_out')
    expect(score).toBe(3)
    console.log(`  impl Counter: 3x inc() → ${score} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 5. Nested struct
// ---------------------------------------------------------------------------

describe('Syntax: nested struct (struct field of struct type)', () => {
  const FNS = `${NS}_nested`

  beforeAll(async () => {
    if (!serverOnline) return
    writeFixture(`
      module ${FNS}

      @load fn __load() {
        raw("scoreboard objectives add sc_out dummy")
      }

      struct Vec2 { x: int, y: int }
      struct Rect { pos: Vec2, w: int, h: int }

      fn test_nested() {
        let r: Rect = Rect { pos: Vec2 { x: 10, y: 20 }, w: 100, h: 50 }
        scoreboard_set("#nested_x", "sc_out", r.pos.x)
        scoreboard_set("#nested_w", "sc_out", r.w)
      }
    `, FNS)
    await mc.reload()
    await mc.ticks(5)
    await mc.command(`/function ${FNS}:__load`).catch(() => {})
    await mc.ticks(3)
  }, 30_000)

  test('compile: struct Vec2 { x,y } struct Rect { pos: Vec2, w, h } succeeds', () => {
    expect(() =>
      compile(`struct V { x: int, y: int } struct R { pos: V, w: int } fn f() { let r: R = R { pos: V { x: 1, y: 2 }, w: 3 } }`, { namespace: 'tmp' })
    ).not.toThrow()
  })

  test('runtime: r.pos.x = 10, r.w = 100', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #nested_x sc_out 0')
    await mc.command('/scoreboard players set #nested_w sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_nested`)
    await mc.ticks(5)

    const x = await mc.scoreboard('#nested_x', 'sc_out')
    const w = await mc.scoreboard('#nested_w', 'sc_out')
    expect(x).toBe(10)
    expect(w).toBe(100)
    console.log(`  nested struct: r.pos.x=${x}, r.w=${w} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// 6. Array as function parameter
// ---------------------------------------------------------------------------

describe('Syntax: array as function parameter (int[])', () => {
  const FNS = `${NS}_arrparam`

  beforeAll(async () => {
    if (!serverOnline) return
    writeFixture(`
      module ${FNS}

      @load fn __load() {
        raw("scoreboard objectives add sc_out dummy")
      }

      fn sum_arr(items: int[], n: int): int {
        let total: int = 0
        for i in 0..n {
          total = total + items[i]
        }
        return total
      }

      fn test_sum5() {
        let nums: int[] = [10, 20, 30, 40, 50]
        let s: int = sum_arr(nums, 5)
        scoreboard_set("#arr_out", "sc_out", s)
      }

      fn test_sum3() {
        let nums: int[] = [10, 20, 30, 40, 50]
        let s: int = sum_arr(nums, 3)
        scoreboard_set("#arr_out", "sc_out", s)
      }
    `, FNS)
    await mc.reload()
    await mc.ticks(5)
    await mc.command(`/function ${FNS}:__load`).catch(() => {})
    await mc.ticks(3)
  }, 30_000)

  test('compile: fn sum_arr(items: int[], n: int): int { ... } succeeds', () => {
    expect(() =>
      compile(`fn sum(items: int[], n: int): int { let t: int = 0; for i in 0..n { t = t + items[i] } return t }`, { namespace: 'tmp' })
    ).not.toThrow()
  })

  test('runtime: sum_arr([10,20,30,40,50], 5) → 150', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #arr_out sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_sum5`)
    await mc.ticks(10)

    const score = await mc.scoreboard('#arr_out', 'sc_out')
    expect(score).toBe(150)
    console.log(`  array param sum5: ${score} ✓`)
  }, 30_000)

  test('runtime: sum_arr([10,20,30,40,50], 3) → 60', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #arr_out sc_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${FNS}:test_sum3`)
    await mc.ticks(10)

    const score = await mc.scoreboard('#arr_out', 'sc_out')
    expect(score).toBe(60)
    console.log(`  array param sum3: ${score} ✓`)
  }, 30_000)
})
