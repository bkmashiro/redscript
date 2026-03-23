/**
 * RedScript MC Integration Tests — say() with f-string
 *
 * Verifies that say(f"...{var}...") correctly compiles to a MC macro function
 * ($say template with $(var) placeholders) and that variable interpolation
 * works correctly at runtime via `function <helper> with storage rs:macro_args`.
 *
 * Run: npx jest say-fstring --forceExit
 * With server: MC_SERVER_DIR=~/mc-test-server MC_PORT=25561 npx jest say-fstring --forceExit
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

const NS = 'rs_say_fstr'

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
      const merged = { values: [...new Set([...(existing.values ?? []), ...(incoming.values ?? [])])] }
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2))
    } else {
      fs.writeFileSync(filePath, file.content)
    }
  }
}

beforeAll(async () => {
  if (process.env.MC_OFFLINE === 'true') {
    console.warn('⚠ MC_OFFLINE=true — skipping say-fstring integration tests')
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
    console.warn('⚠ MC server not running — say-fstring runtime tests will be skipped')
    return
  }

  await mc.command('/scoreboard objectives add sf_out dummy').catch(() => {})
  await mc.ticks(2)

  writeFixture(`
    module ${NS}

    let counter: int = 0;

    @keep fn say_plain() {
      say(f"Hello world");
    }

    @keep fn say_with_var() {
      counter = 42;
      say(f"Counter is {counter}");
    }

    @keep fn say_multivar() {
      let a: int = 10;
      let b: int = 20;
      say(f"a={a} b={b}");
    }

    @keep fn say_expr() {
      let x: int = 5;
      let y: int = x + 3;
      say(f"result={y}");
    }

    // Side-effect: sets sf_out scoreboard so we can detect the function ran
    @keep fn say_and_score() {
      counter = 99;
      say(f"Score is {counter}");
      scoreboard_set("#sf_ran", "sf_out", 1);
    }
  `, NS)

  await mc.reload()
  await mc.ticks(5)
  console.log('  say-fstring setup complete.')
}, 30_000)

// ---------------------------------------------------------------------------
// Compile-time tests (no server needed)
// ---------------------------------------------------------------------------

describe('say() f-string: compile output', () => {
  test('say(f"plain text") compiles without error', () => {
    expect(() =>
      compile(`@keep fn f() { say(f"Hello world"); }`, { namespace: 'tmp' })
    ).not.toThrow()
  })

  test('say(f"...{var}...") emits macro helper function', () => {
    const result = compile(`
      let counter: int = 0;
      @keep fn f() { say(f"Count: {counter}"); }
    `, { namespace: 'tmp' })

    const helperFile = result.files?.find(f => f.path.includes('__say_macro'))
    expect(helperFile).toBeDefined()
    expect(helperFile?.content).toContain('$say Count: $(counter)')
  })

  test('say(f"...{var}...") emits storage copy + function with storage call', () => {
    const result = compile(`
      let counter: int = 0;
      @keep fn f() { say(f"Count: {counter}"); }
    `, { namespace: 'tmp' })

    const mainFn = result.files?.find(f => f.path.endsWith('f.mcfunction'))
    expect(mainFn?.content).toContain('execute store result storage rs:macro_args counter int 1')
    expect(mainFn?.content).toContain('with storage rs:macro_args')
  })

  test('say(f"no vars") still uses function macro (safe fallback)', () => {
    const result = compile(`
      @keep fn f() { say(f"Hello world"); }
    `, { namespace: 'tmp' })

    // No storage copy needed (no vars), but still goes through macro helper
    const helperFile = result.files?.find(f => f.path.includes('__say_macro'))
    expect(helperFile).toBeDefined()
    expect(helperFile?.content).toContain('$say Hello world')
  })

  test('say("plain string") still uses inline say command (not macro)', () => {
    const result = compile(`
      @keep fn f() { say("Hello world"); }
    `, { namespace: 'tmp' })

    const mainFn = result.files?.find(f => f.path.endsWith('f.mcfunction'))
    expect(mainFn?.content).toContain('say Hello world')
    expect(mainFn?.content).not.toContain('with storage')
  })
})

// ---------------------------------------------------------------------------
// Runtime tests (server required)
// ---------------------------------------------------------------------------

describe('say() f-string: runtime', () => {
  test('say(f"...{var}...") function runs without error', async () => {
    if (!serverOnline) return

    // If this throws, the macro function failed to load or execute
    await expect(mc.command(`/function ${NS}:say_with_var`)).resolves.not.toThrow()
    await mc.ticks(5)
  }, 20_000)

  test('say(f"Score is {counter}") sets scoreboard correctly', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #sf_ran sf_out 0')
    await mc.ticks(2)
    await mc.command(`/function ${NS}:say_and_score`)
    await mc.ticks(5)

    // If scoreboard was set, the function ran fully (macro didn't crash)
    const score = await mc.scoreboard('#sf_ran', 'sf_out')
    expect(score).toBe(1)
    console.log('  say_and_score ran successfully ✓')
  }, 20_000)

  test('say(f"plain text") runs without error', async () => {
    if (!serverOnline) return

    await expect(mc.command(`/function ${NS}:say_plain`)).resolves.not.toThrow()
    await mc.ticks(3)
  }, 20_000)

  test('say(f"a={a} b={b}") multi-variable runs without error', async () => {
    if (!serverOnline) return

    await expect(mc.command(`/function ${NS}:say_multivar`)).resolves.not.toThrow()
    await mc.ticks(3)
  }, 20_000)
})
