/**
 * E2E tests for the `for (let v in arr, len)` syntax sugar.
 */

import { compile } from '../../emit/compile'
import { MCRuntime } from '../../runtime'

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
          scoreboard_set("#sum", "test", scoreboard_get("#sum", "test") + v);
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
          scoreboard_set("#sum", "test", scoreboard_get("#sum", "test") + v);
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    const allContent = getFiles(result.files)
    expect(allContent).toContain('with storage')
    const runtime = new MCRuntime('test')
    for (const file of result.files) {
      const match = file.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)
      if (match) runtime.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
    }
    runtime.setScore('#sum', 'test', 0)
    runtime.execFunction('test:load')
    runtime.execFunction('test:test')
    expect(runtime.getScore('#sum', 'test')).toBe(60)
  })

  test('for in array with len variable compiles', () => {
    const src = `
      @keep fn loop_sum(arr: int[], n: int): void {
        for (let item in arr, n) {
          scoreboard_set("#total", "obj", scoreboard_get("#total", "obj") + item);
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
          scoreboard_set("#res", "test", scoreboard_get("#res", "test") + x);
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })
})
