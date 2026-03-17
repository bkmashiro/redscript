/**
 * Tests for array reference parameter passing.
 *
 * When a function takes an `int[]` parameter and is called with an array
 * variable, the compiler monomorphizes the callee per-call-site so that
 * array index reads/writes inside the callee refer to the caller's actual
 * NBT storage path.
 */

import { compile } from '../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

function getFunctionBody(files: { path: string; content: string }[], fnName: string): string {
  const content = getFile(files, `${fnName}.mcfunction`)
  if (!content) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found in output. Files:\n${paths}`)
  }
  return content
}

describe('Array reference parameter passing', () => {
  const src = `
    fn swap_elems(arr: int[], i: int, j: int) {
        let tmp: int = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    @keep fn test() {
        let nums: int[] = [30, 10, 20];
        swap_elems(nums, 0, 1);
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

  test('a specialized swap function is generated for nums', () => {
    const specialized = files.filter(f => f.path.includes('swap_elems__arr_'))
    expect(specialized.length).toBeGreaterThan(0)
  })

  test('specialized swap function contains "with storage" for dynamic index access', () => {
    const specialized = files.filter(f => f.path.includes('swap_elems__arr_'))
    expect(specialized.length).toBeGreaterThan(0)
    const allContent = specialized.map(f => f.content).join('\n')
    expect(allContent).toContain('with storage')
  })

  test('specialized swap function references the correct array path (nums)', () => {
    const specialized = files.filter(f => f.path.includes('swap_elems__arr_'))
    const allContent = specialized.map(f => f.content).join('\n')
    expect(allContent).toContain('nums')
  })

  test('test function calls the specialized swap variant', () => {
    const testBody = getFunctionBody(files, 'test')
    expect(testBody).toContain('swap_elems__arr_')
  })

  test('original unspecialized swap is not called from test', () => {
    const testBody = getFunctionBody(files, 'test')
    // Should not call plain 'swap_elems' (only the specialized variant)
    expect(testBody).not.toMatch(/function test:swap_elems\b(?!__arr_)/)
  })
})
