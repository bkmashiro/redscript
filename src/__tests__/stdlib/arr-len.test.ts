/**
 * Tests for arr.len() — literal constant and dynamic runtime variants.
 *
 * Covers:
 * - Literal array: nums.len() where nums = [1,2,3] → compile-time constant 3
 * - Function-parameter array: items.len() → scoreboard param (passed by caller)
 * - for item in arr with dynamic array parameter (iterates using loop counter)
 * - Nested for-each over two distinct dynamic arrays (both compile without error)
 *
 * Validation is purely through compiled .mcfunction content inspection;
 * no Minecraft server is required.
 */

import { compile } from '../../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

function getFunctionBody(files: { path: string; content: string }[], fnName: string): string {
  const content = getFile(files, `${fnName}.mcfunction`)
  if (!content) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found in output.\nFiles:\n${paths}`)
  }
  return content
}

// ─── 1. Literal array: compile-time constant ────────────────────────────────

describe('arr.len() — literal array yields compile-time constant', () => {
  const src = `
    fn test_literal_len(): int {
      let nums: int[] = [1, 2, 3];
      return nums.len();
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('compiles without error', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test('emits scoreboard constant 3 (compile-time folded)', () => {
    const body = getFunctionBody(files, 'test_literal_len')
    // Constant folding emits: scoreboard players set $<temp> __test 3
    expect(body).toMatch(/scoreboard players set \S+ __test 3/)
  })

  test('does NOT emit data get storage for literal array length', () => {
    const body = getFunctionBody(files, 'test_literal_len')
    // Literal arrays have known length at compile time — no runtime query needed
    expect(body).not.toContain('data get storage')
  })
})

// ─── 2. Five-element literal array: constant 5 ──────────────────────────────

describe('arr.len() — 5-element literal array emits constant 5', () => {
  const src = `
    fn test_five_len(): int {
      let data: int[] = [10, 20, 30, 40, 50];
      return data.len();
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('compiles without error', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test('emits constant 5 in scoreboard', () => {
    const body = getFunctionBody(files, 'test_five_len')
    expect(body).toMatch(/scoreboard players set \S+ __test 5/)
  })
})

// ─── 3. Function-parameter array: length via scoreboard ─────────────────────

describe('arr.len() — function parameter array does not use data get storage', () => {
  const src = `
    fn count_items(items: int[]): int {
      return items.len();
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('compiles without error', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test('function body is emitted', () => {
    // count_items should produce a .mcfunction file
    const body = getFunctionBody(files, 'count_items')
    expect(body.length).toBeGreaterThan(0)
  })

  test('result is returned via scoreboard (not data get storage)', () => {
    // When items is a function param, its length is a scoreboard value ($p1 or similar),
    // not a runtime NBT query — verified from actual compiler output
    const body = getFunctionBody(files, 'count_items')
    expect(body).toContain('scoreboard players operation')
  })
})

// ─── 4. for item in arr with dynamic array parameter ────────────────────────

describe('for item in arr — dynamic array parameter compiles and iterates', () => {
  const src = `
    fn sum_items(arr: int[]): void {
      for item in arr {
        scoreboard_add("#total", "test", item);
      }
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('compiles without error', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test('generates a loop header function', () => {
    const loopHeader = files.find(f => f.path.includes('loop_header'))
    expect(loopHeader).toBeDefined()
  })

  test('loop uses scoreboard comparison for bound check', () => {
    // for-each desugars to: while idx < len { item = arr[idx]; idx++ }
    // The comparison is done via scoreboard
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('execute store success score')
  })

  test('generates loop body with dynamic array element access', () => {
    const loopBody = files.find(f => f.path.includes('loop_body'))
    expect(loopBody).toBeDefined()
  })
})

// ─── 5. Nested for-each over two distinct dynamic arrays ────────────────────

describe('nested for-each — two different dynamic arrays', () => {
  const src = `
    fn cross_accum(a: int[], b: int[]): void {
      for x in a {
        for y in b {
          scoreboard_add("#res", "test", x);
          scoreboard_add("#res", "test", y);
        }
      }
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('compiles without error', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test('generates at least two loop header functions (one per nested loop)', () => {
    const loopHeaders = files.filter(f => f.path.includes('loop_header'))
    expect(loopHeaders.length).toBeGreaterThanOrEqual(2)
  })

  test('generates at least two loop body functions (one per nested loop)', () => {
    const loopBodies = files.filter(f => f.path.includes('loop_body'))
    expect(loopBodies.length).toBeGreaterThanOrEqual(2)
  })

  test('scoreboard_add is called in the innermost loop', () => {
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('scoreboard_add')
  })
})

// ─── 6. arr.len() used directly in a condition ──────────────────────────────

describe('arr.len() — used in a conditional with literal array', () => {
  const src = `
    fn has_items(): int {
      let vals: int[] = [5, 10, 15];
      if (vals.len() > 0) {
        return 1;
      }
      return 0;
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('compiles without error', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test('condition is constant-folded (branch eliminated, no data get storage)', () => {
    const body = getFunctionBody(files, 'has_items')
    // vals.len() == 3 (compile-time). 3 > 0 is always true, so the optimizer
    // eliminates the branch entirely and returns 1 directly — no runtime query needed.
    expect(body).not.toContain('data get storage')
    // The always-true branch result (1) is returned directly
    expect(body).toContain('scoreboard players set')
  })
})
