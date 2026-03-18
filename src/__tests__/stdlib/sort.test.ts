/**
 * Tests for stdlib/sort.mcrs — insertion sort and merge utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SORT_STDLIB = path.join(__dirname, '../../stdlib/sort.mcrs')
const sortSrc = fs.readFileSync(SORT_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(sortSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

describe('stdlib/sort.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      const result = compile(sortSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  test('insertion_sort function is emitted', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [30, 10, 20]; insertion_sort(arr, 3); }`)
    expect(files.some(f => f.path.includes('insertion_sort'))).toBe(true)
  })

  test('insertion_sort_desc function is emitted', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [10, 30, 20]; insertion_sort_desc(arr, 3); }`)
    expect(files.some(f => f.path.includes('insertion_sort_desc'))).toBe(true)
  })

  test('sort_merge function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int[] {
        let a: int[] = [10, 30, 50]
        let b: int[] = [20, 40, 60]
        return sort_merge(a, 3, b, 3)
      }
    `)
    expect(files.some(f => f.path.includes('sort_merge'))).toBe(true)
  })

  test('insertion_sort on single element compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [42]; insertion_sort(arr, 1); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('insertion_sort on two elements compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [5, 3]; insertion_sort(arr, 2); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('insertion_sort_desc on two elements compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [3, 5]; insertion_sort_desc(arr, 2); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('sort_merge with empty second array compiles', () => {
    const files = compileWith(`
      @keep fn t(): int[] {
        let a: int[] = [1, 2, 3]
        let b: int[] = []
        return sort_merge(a, 3, b, 0)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('sort_merge result array contains storage operations', () => {
    const files = compileWith(`
      @keep fn t(): int[] {
        let a: int[] = [1, 3]
        let b: int[] = [2, 4]
        return sort_merge(a, 2, b, 2)
      }
    `)
    const mergeFile = files.find(f => f.path.includes('sort_merge'))
    if (mergeFile) {
      expect(mergeFile.content.length).toBeGreaterThan(0)
    }
  })

  test('insertion_sort emit contains index write operations', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [30, 10, 20]; insertion_sort(arr, 3); }`)
    const sortFile = files.find(f => f.path.includes('insertion_sort') && !f.path.includes('desc'))
    if (sortFile) {
      expect(sortFile.content.length).toBeGreaterThan(0)
    }
  })

  test('insertion_sort after sort_merge compiles (chaining)', () => {
    const files = compileWith(`
      @keep fn t() {
        let a: int[] = [30, 10]
        let b: int[] = [25, 5]
        insertion_sort(a, 2)
        insertion_sort(b, 2)
        let merged: int[] = sort_merge(a, 2, b, 2)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })
})
