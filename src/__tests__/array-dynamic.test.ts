/**
 * Tests for dynamic array index read: arr[i] where i is a variable.
 *
 * Covers:
 * - MIR: nbt_read_dynamic instruction is emitted instead of falling back to
 *   copy(obj) (which returned the array length, not the value)
 * - LIR/Emit: generates a macro helper function and calls it with
 *   `function ns:__dyn_idx_... with storage rs:macro_args`
 * - The generated .mcfunction contains 'with storage' (function macro call)
 * - The helper function contains the $return macro line
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
    // list files for debug
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found in output. Files:\n${paths}`)
  }
  return content
}

describe('Dynamic array index read: arr[i]', () => {
  const src = `
    fn test() {
      let nums: int[] = [10, 20, 30, 40, 50];
      let i: int = 2;
      i = i + 1;
      let v: int = nums[i];
      scoreboard_set("#out", "test", v);
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('compiles without error', () => {
    // beforeAll would have thrown if compilation failed
    expect(files.length).toBeGreaterThan(0)
  })

  test('test function contains "with storage" (macro call)', () => {
    const body = getFunctionBody(files, 'test')
    expect(body).toContain('with storage')
  })

  test('test function does NOT contain fallback "scoreboard players set #out test 5"', () => {
    // Old fallback would copy the array length (5 elements) as the result
    const body = getFunctionBody(files, 'test')
    expect(body).not.toContain('scoreboard players set #out test 5')
  })

  test('a macro helper function is generated for the array', () => {
    // Should have a function file matching __dyn_idx_
    const helperFile = files.find(f => f.path.includes('__dyn_idx_'))
    expect(helperFile).toBeDefined()
  })

  test('macro helper function contains $return run data get', () => {
    const helperFile = files.find(f => f.path.includes('__dyn_idx_'))
    expect(helperFile).toBeDefined()
    expect(helperFile!.content).toContain('$return run data get')
    expect(helperFile!.content).toContain('$(arr_idx)')
  })

  test('macro helper function references the correct array path (nums)', () => {
    const helperFile = files.find(f => f.path.includes('__dyn_idx_'))
    expect(helperFile).toBeDefined()
    expect(helperFile!.content).toContain('nums[$(arr_idx)]')
  })

  test('test function stores index to rs:macro_args', () => {
    const body = getFunctionBody(files, 'test')
    // Should store the index value into rs:macro_args arr_idx
    expect(body).toContain('rs:macro_args')
  })
})

describe('Dynamic array index: constant index still uses direct nbt_read', () => {
  const src = `
    fn test_const() {
      let nums: int[] = [10, 20, 30];
      let v: int = nums[1];
      scoreboard_set("#out", "test", v);
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('constant index does NOT generate macro call (uses direct data get)', () => {
    const body = getFunctionBody(files, 'test_const')
    // Direct nbt_read emits store_nbt_to_score → execute store result score ... run data get ...
    // without 'with storage'
    expect(body).not.toContain('with storage')
    expect(body).toContain('data get storage')
    expect(body).toContain('nums[1]')
  })
})

describe('Dynamic array index: multiple arrays, separate helpers', () => {
  const src = `
    fn test_multi() {
      let a: int[] = [1, 2, 3];
      let b: int[] = [10, 20, 30];
      let i: int = 1;
      i = i + 0;
      let va: int = a[i];
      let vb: int = b[i];
      scoreboard_set("#va", "test", va);
      scoreboard_set("#vb", "test", vb);
    }
  `

  let files: { path: string; content: string }[]
  beforeAll(() => {
    const result = compile(src, { namespace: 'test' })
    files = result.files
  })

  test('two separate macro helpers are generated for arrays a and b', () => {
    const helperFiles = files.filter(f => f.path.includes('__dyn_idx_'))
    expect(helperFiles.length).toBe(2)
  })

  test('each helper references its respective array path', () => {
    const helperFiles = files.filter(f => f.path.includes('__dyn_idx_'))
    const contents = helperFiles.map(f => f.content).join('\n')
    expect(contents).toContain('a[$(arr_idx)]')
    expect(contents).toContain('b[$(arr_idx)]')
  })
})
