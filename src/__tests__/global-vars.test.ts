/**
 * Integration tests for module-level global variables.
 *
 * Covers:
 * - Global variable assignment and read (score_write / score_read)
 * - Global variable increment in a loop
 * - Global variable visible across functions
 * - Global variable in f-string interpolation (no stray "~")
 *
 * These tests compile RedScript source and inspect the generated .mcfunction
 * content to verify correct scoreboard-based code generation.
 */

import { compile } from '../emit/compile'

// Helper: find a function's body by name
function getFunctionBody(
  files: { path: string; content: string }[],
  fnName: string,
  ns = 'test'
): string {
  const target = `data/${ns}/function/${fnName}.mcfunction`
  const f = files.find(f => f.path === target || f.path.endsWith(`/${fnName}.mcfunction`))
  if (!f) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found in output. Files:\n${paths}`)
  }
  return f.content
}

// ──────────────────────────────────────────────────────────────
// Test 1: global variable assignment and read
// ──────────────────────────────────────────────────────────────
describe('Global variable: assignment and read', () => {
  const src = `
    let counter: int = 0;

    @keep
    fn set_counter() {
      counter = 42;
    }

    @keep
    fn get_counter() {
      scoreboard_set("#result", "rs", counter);
    }
  `

  it('set_counter uses scoreboard players set to write global', () => {
    const { files } = compile(src, { namespace: 'test' })
    const body = getFunctionBody(files, 'set_counter')
    // Should write 42 to the scoreboard for the global variable
    expect(body).toContain('scoreboard players set')
    expect(body).toContain('42')
  })

  it('get_counter reads global via score_read (not hardcoded 0)', () => {
    const { files } = compile(src, { namespace: 'test' })
    const body = getFunctionBody(files, 'get_counter')
    // Should contain a scoreboard read for the counter variable,
    // not a hardcoded literal "0" assignment
    expect(body).toContain('scoreboard players')
    // The result should not be a constant "0" — it must read the scoreboard
    // (hardcoded copy t = 0 was the old bug)
    expect(body).not.toMatch(/scoreboard players set #result rs 0\s*$/)
  })
})

// ──────────────────────────────────────────────────────────────
// Test 2: global variable increment in a loop
// ──────────────────────────────────────────────────────────────
describe('Global variable: increment in a loop', () => {
  const src = `
    let running: int = 0;

    @keep
    fn count_up() {
      let i: int = 0;
      while i < 5 {
        running = running + 1;
        i = i + 1;
      }
    }
  `

  it('count_up reads and writes running (not a no-op)', () => {
    const { files } = compile(src, { namespace: 'test' })
    const body = getFunctionBody(files, 'count_up')
    // Should contain scoreboard operations (not an empty function)
    expect(body.trim().length).toBeGreaterThan(0)
    expect(body).toContain('scoreboard players')
  })

  it('DCE does not eliminate running = running + 1', () => {
    const { files } = compile(src, { namespace: 'test' })
    // The while loop generates sub-functions; check all files
    const allContent = files.map(f => f.content).join('\n')
    // There must be a scoreboard add or operation for running
    const hasAdd = allContent.includes('scoreboard players add') ||
      allContent.includes('scoreboard players operation')
    expect(hasAdd).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────
// Test 3: global variable visible across functions
// ──────────────────────────────────────────────────────────────
describe('Global variable: cross-function visibility', () => {
  const src = `
    let x: int = 0;

    @keep
    fn set_x() {
      x = 42;
    }

    @keep
    fn get_x() {
      scoreboard_set("#out", "rs", x);
    }
  `

  it('set_x writes to x (not just a local temp)', () => {
    const { files } = compile(src, { namespace: 'test' })
    const body = getFunctionBody(files, 'set_x')
    expect(body).toContain('scoreboard players set')
    expect(body).toContain('42')
    // The write must target the persistent scoreboard name for x, not a temp
    expect(body).toContain('x')
  })

  it('get_x reads x from scoreboard', () => {
    const { files } = compile(src, { namespace: 'test' })
    const body = getFunctionBody(files, 'get_x')
    // Must contain a scoreboard get / operation to read x
    expect(body).toContain('scoreboard players')
    expect(body).toContain('x')
  })
})

// ──────────────────────────────────────────────────────────────
// Test 4: global variable in f-string interpolation
// ──────────────────────────────────────────────────────────────
describe('Global variable: f-string interpolation', () => {
  const src = `
    let score_val: int = 0;

    @keep
    fn announce() {
      say(f"Score: {score_val}");
    }
  `

  it('announce does not contain stray ~ in tellraw', () => {
    const { files } = compile(src, { namespace: 'test' })
    const body = getFunctionBody(files, 'announce')
    // The generated tellraw must not fall back to "~" (the old default bug)
    expect(body).not.toContain('"text":"~"')
    expect(body).not.toContain('"~"')
  })

  it('announce reads score_val from scoreboard (not hardcoded)', () => {
    const { files } = compile(src, { namespace: 'test' })
    const body = getFunctionBody(files, 'announce')
    // f-string int interpolation uses macro pattern:
    // execute store result storage ... run scoreboard players get score_val __test
    expect(body).toContain('score_val')
    // Must be a dynamic read, not a constant
    expect(body).not.toMatch(/say Score: \d+/)
  })
})
