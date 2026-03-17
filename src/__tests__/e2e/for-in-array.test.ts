/**
 * E2E tests for the `for (let v in arr, len)` syntax sugar.
 */

import { compile } from '../../emit/compile'

function getFiles(files: { path: string; content: string }[]): string {
  return files.map(f => f.content).join('\n')
}

describe('e2e: for-in-array syntax sugar', () => {
  test('for in array basic compiles without error', () => {
    const src = `
      @keep fn test() {
        let nums: int[] = [10, 20, 30];
        let len: int = 3;
        for (let v in nums, len) {
          scoreboard_add("#sum", "test", v);
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('for in array generates dynamic index access (with storage)', () => {
    const src = `
      @keep fn test() {
        let nums: int[] = [10, 20, 30];
        let len: int = 3;
        for (let v in nums, len) {
          scoreboard_add("#sum", "test", v);
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    const allContent = getFiles(result.files)
    expect(allContent).toContain('with storage')
  })

  test('for in array with len variable compiles', () => {
    const src = `
      @keep fn loop_sum(arr: int[], n: int): void {
        for (let item in arr, n) {
          scoreboard_add("#total", "obj", item);
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('for in array with literal len compiles', () => {
    const src = `
      @keep fn test() {
        let data: int[] = [1, 2, 3, 4, 5];
        for (let x in data, 5) {
          scoreboard_add("#res", "test", x);
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })
})
