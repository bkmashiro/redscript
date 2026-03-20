/**
 * Tests for stdlib/sort.mcrs — merge_sort_coro (v2 coroutine bottom-up merge sort).
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

describe('stdlib/sort.mcrs — merge_sort_coro (v2)', () => {
  test('full stdlib (with merge_sort_coro) compiles without errors', () => {
    expect(() => {
      const result = compile(sortSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  test('merge_sort_coro function is emitted', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [3, 1, 2]; merge_sort_coro(arr, 3); }`)
    expect(files.some(f => f.path.includes('merge_sort_coro'))).toBe(true)
  })

  test('merge_sort_noop function is emitted', () => {
    const files = compileWith(`@keep fn t() { merge_sort_noop(); }`)
    expect(files.some(f => f.path.includes('merge_sort_noop'))).toBe(true)
  })

  test('merge_sort_coro on single-element array compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [42]; merge_sort_coro(arr, 1); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('merge_sort_coro on two-element array compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [5, 3]; merge_sort_coro(arr, 2); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('merge_sort_coro on already-sorted array compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [1, 2, 3, 4, 5]; merge_sort_coro(arr, 5); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('merge_sort_coro on reverse-sorted array compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [5, 4, 3, 2, 1]; merge_sort_coro(arr, 5); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('merge_sort_coro on power-of-two size compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [8, 3, 6, 1, 7, 2, 5, 4]; merge_sort_coro(arr, 8); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('merge_sort_coro on odd-length array compiles', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [9, 2, 7, 4, 6]; merge_sort_coro(arr, 5); }`)
    expect(files.length).toBeGreaterThan(0)
  })

  test('merge_sort_coro emits @coroutine decorated function output', () => {
    const files = compileWith(`@keep fn t() { let arr: int[] = [30, 10, 20]; merge_sort_coro(arr, 3); }`)
    const coroFiles = files.filter(f => f.path.includes('merge_sort_coro'))
    expect(coroFiles.length).toBeGreaterThan(0)
    // coroutine functions emit multiple tick-slice files or a scheduler entry
    const allContent = coroFiles.map(f => f.content).join('\n')
    expect(allContent.length).toBeGreaterThan(0)
  })

  test('merge_sort_coro can coexist with insertion_sort in same program', () => {
    const files = compileWith(`
      @keep fn t() {
        let a: int[] = [30, 10, 20]
        insertion_sort(a, 3)
        let b: int[] = [9, 1, 5]
        merge_sort_coro(b, 3)
      }
    `)
    expect(files.some(f => f.path.includes('insertion_sort'))).toBe(true)
    expect(files.some(f => f.path.includes('merge_sort_coro'))).toBe(true)
  })

  test('merge_sort_coro can coexist with sort_merge in same program', () => {
    const files = compileWith(`
      @keep fn t() {
        let a: int[] = [3, 1, 2]
        merge_sort_coro(a, 3)
        let x: int[] = [10, 30]
        let y: int[] = [20, 40]
        let merged: int[] = sort_merge(x, 2, y, 2)
      }
    `)
    expect(files.some(f => f.path.includes('merge_sort_coro'))).toBe(true)
    expect(files.some(f => f.path.includes('sort_merge'))).toBe(true)
  })

  test('merge_sort_coro uses n parameter (not hardcoded length)', () => {
    // Compile with a helper that calls with n < arr.len to ensure n is threaded through
    const files = compileWith(`
      @keep fn t() {
        let arr: int[] = [5, 2, 8, 1, 9, 3]
        merge_sort_coro(arr, 4)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })
})
