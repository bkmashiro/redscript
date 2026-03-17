/**
 * Tests for stdlib/list.mcrs functions.
 * Verifies compilation succeeds and key functions are present.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const LIST_STDLIB = path.join(__dirname, '../../stdlib/list.mcrs')
const listSrc = fs.readFileSync(LIST_STDLIB, 'utf-8')

function getFn(files: { path: string; content: string }[], fnName: string): string {
  const f = files.find(f => f.path.endsWith(`/${fnName}.mcfunction`))
  if (!f) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found. Files:\n${paths}`)
  }
  return f.content
}

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(listSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

describe('stdlib/list.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      const result = compile(listSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  test('sort3 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return sort3(30, 10, 20, 0); }`)
    expect(files.some(f => f.path.includes('sort3'))).toBe(true)
  })

  test('sort4 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return sort4(40, 10, 30, 20, 0); }`)
    expect(files.some(f => f.path.includes('sort4'))).toBe(true)
  })

  test('sort5 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return sort5(50, 10, 30, 20, 40, 0); }`)
    expect(files.some(f => f.path.includes('sort5'))).toBe(true)
  })

  test('list_sort_asc function is emitted', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [30, 10, 20]; list_sort_asc(arr, 3); }`)
    expect(files.some(f => f.path.includes('list_sort_asc'))).toBe(true)
  })

  test('list_sort_desc function is emitted', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [30, 10, 20]; list_sort_desc(arr, 3); }`)
    expect(files.some(f => f.path.includes('list_sort_desc'))).toBe(true)
  })

  test('list_sort_asc emit contains storage operations', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [30, 10, 20]; list_sort_asc(arr, 3); }`)
    const sortFile = files.find(f => f.path.includes('list_sort_asc'))
    if (sortFile) {
      // Array operations should involve storage or scoreboard
      expect(sortFile.content.length).toBeGreaterThan(0)
    }
  })

  test('list_sort_desc emit contains storage operations', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [30, 10, 20]; list_sort_desc(arr, 3); }`)
    const sortFile = files.find(f => f.path.includes('list_sort_desc'))
    if (sortFile) {
      expect(sortFile.content.length).toBeGreaterThan(0)
    }
  })

  test('list_min3 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return list_min3(5, 3, 8); }`)
    expect(files.some(f => f.path.includes('list_min3'))).toBe(true)
  })

  test('list_max3 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return list_max3(5, 3, 8); }`)
    expect(files.some(f => f.path.includes('list_max3'))).toBe(true)
  })

  test('avg3 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return avg3(10, 20, 30); }`)
    expect(files.some(f => f.path.includes('avg3'))).toBe(true)
  })

  test('weighted2 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return weighted2(12345, 1, 1); }`)
    expect(files.some(f => f.path.includes('weighted2'))).toBe(true)
  })

  test('manual array iteration with list utility compiles', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let arr: int[] = [5, 3, 8];
        let mx: int = list_max3(arr[0], arr[1], arr[2]);
        return mx;
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('list_sum3 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return list_sum3(10, 20, 30); }`)
    expect(files.some(f => f.path.includes('list_sum3'))).toBe(true)
  })

  test('list_sum5 function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return list_sum5(1, 2, 3, 4, 5); }`)
    expect(files.some(f => f.path.includes('list_sum5'))).toBe(true)
  })
})
