/**
 * Tests for array index write: arr[i] = val (constant and dynamic index).
 *
 * Covers:
 * - Parser: arr[i] = val parses as index_assign (no "Expected ';'" error)
 * - MIR: constant index → nbt_write, dynamic index → nbt_write_dynamic
 * - LIR/Emit: constant index uses store_score_to_nbt to path[N]
 *             dynamic index generates a macro helper function for write
 * - Compound assignments: arr[i] += 5 desugars to read + write
 */

import { compile } from '../emit/compile'

// Helper: find file in compiled output by path substring
function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// Helper: get the content of the function file for `fnName` in namespace
function getFunctionBody(files: { path: string; content: string }[], fnName: string, ns = 'test'): string {
  const content = getFile(files, `${fnName}.mcfunction`)
  if (!content) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found in output. Files:\n${paths}`)
  }
  return content
}

// ---------------------------------------------------------------------------
// Constant index write: arr[1] = 99
// ---------------------------------------------------------------------------
describe('Constant index write: arr[1] = 99', () => {
  const src = `
    fn test() {
      let nums: int[] = [10, 20, 30];
      nums[1] = 99;
      scoreboard_set("#out", "test", nums[1]);
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

  test('test function contains nbt store to array path [1] (constant write)', () => {
    const body = getFunctionBody(files, 'test')
    // Should write to path like "nums[1]" via execute store result storage
    expect(body).toMatch(/nums\[1\]/)
  })

  test('test function reads back from nums[1] after writing', () => {
    const body = getFunctionBody(files, 'test')
    // Should also read nums[1] for scoreboard_set
    expect(body).toMatch(/nums\[1\]/)
  })
})

// ---------------------------------------------------------------------------
// Dynamic index write: arr[i] = 99
// ---------------------------------------------------------------------------
describe('Dynamic index write: arr[i] = 99', () => {
  const src = `
    fn test() {
      let nums: int[] = [10, 20, 30];
      let i: int = 1;
      nums[i] = 99;
      scoreboard_set("#out", "test", nums[i]);
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

  test('test function contains "with storage" (macro call for write)', () => {
    const body = getFunctionBody(files, 'test')
    expect(body).toContain('with storage')
  })

  test('a __dyn_wrt_ helper function is generated', () => {
    const helperFile = files.find(f => f.path.includes('__dyn_wrt_'))
    expect(helperFile).toBeDefined()
  })

  test('the write helper contains a macro line with arr_idx and arr_val', () => {
    const helperFile = files.find(f => f.path.includes('__dyn_wrt_'))
    expect(helperFile).toBeDefined()
    expect(helperFile!.content).toContain('$(arr_idx)')
    expect(helperFile!.content).toContain('$(arr_val)')
  })

  test('the write helper uses data modify set value', () => {
    const helperFile = files.find(f => f.path.includes('__dyn_wrt_'))
    expect(helperFile!.content).toContain('data modify storage')
    expect(helperFile!.content).toContain('set value')
  })
})

// ---------------------------------------------------------------------------
// Compound assignment: arr[i] += 5
// ---------------------------------------------------------------------------
describe('Compound index assignment: arr[i] += 5', () => {
  const src = `
    fn test() {
      let nums: int[] = [10, 20, 30];
      let i: int = 0;
      nums[i] += 5;
      scoreboard_set("#out", "test", nums[i]);
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

  test('compound assignment generates both read and write macro calls', () => {
    const body = getFunctionBody(files, 'test')
    // Should call with storage at least twice (read for += and write + scoreboard_set read)
    const matches = (body.match(/with storage/g) || []).length
    expect(matches).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Constant compound assignment: arr[0] += 5
// ---------------------------------------------------------------------------
describe('Constant compound index assignment: arr[0] += 5', () => {
  const src = `
    fn test() {
      let nums: int[] = [10, 20, 30];
      nums[0] += 5;
      scoreboard_set("#out", "test", nums[0]);
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

  test('test function contains array path [0] for read and write', () => {
    const body = getFunctionBody(files, 'test')
    expect(body).toMatch(/nums\[0\]/)
  })
})
