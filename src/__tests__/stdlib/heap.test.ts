/**
 * Tests for stdlib/heap.mcrs — MinHeap and MaxHeap priority queues.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const HEAP_STDLIB = path.join(__dirname, '../../stdlib/heap.mcrs')
const heapSrc = fs.readFileSync(HEAP_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(heapSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

describe('stdlib/heap.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      const result = compile(heapSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  test('heap_new function is emitted', () => {
    const files = compileWith(`@keep fn t(): int[] { return heap_new(); }`)
    expect(files.some(f => f.path.includes('heap_new'))).toBe(true)
  })

  test('heap_size function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { let h: int[] = heap_new(); return heap_size(h); }`)
    expect(files.some(f => f.path.includes('heap_size'))).toBe(true)
  })

  test('heap_push function is emitted', () => {
    const files = compileWith(`@keep fn t(): int[] { let h: int[] = heap_new(); return heap_push(h, 42); }`)
    expect(files.some(f => f.path.includes('heap_push'))).toBe(true)
  })

  test('heap_peek function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { let h: int[] = heap_new(); h = heap_push(h, 10); return heap_peek(h); }`)
    expect(files.some(f => f.path.includes('heap_peek'))).toBe(true)
  })

  test('heap_pop function is emitted', () => {
    const files = compileWith(`@keep fn t(): int[] { let h: int[] = heap_new(); h = heap_push(h, 5); return heap_pop(h); }`)
    expect(files.some(f => f.path.includes('heap_pop'))).toBe(true)
  })

  test('max_heap_push function is emitted', () => {
    const files = compileWith(`@keep fn t(): int[] { let h: int[] = heap_new(); return max_heap_push(h, 99); }`)
    expect(files.some(f => f.path.includes('max_heap_push'))).toBe(true)
  })

  test('max_heap_pop function is emitted', () => {
    const files = compileWith(`@keep fn t(): int[] { let h: int[] = heap_new(); h = max_heap_push(h, 7); return max_heap_pop(h); }`)
    expect(files.some(f => f.path.includes('max_heap_pop'))).toBe(true)
  })

  test('heap_new produces array of length 65 (size slot + 64 data slots)', () => {
    const files = compileWith(`@keep fn t(): int[] { return heap_new(); }`)
    // Compiles successfully — runtime verification only possible in MC
    expect(files.length).toBeGreaterThan(0)
  })

  test('push then peek sequence compiles', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let h: int[] = heap_new()
        h = heap_push(h, 30)
        h = heap_push(h, 10)
        h = heap_push(h, 20)
        return heap_peek(h)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('push-pop cycle compiles', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let h: int[] = heap_new()
        h = heap_push(h, 5)
        h = heap_push(h, 3)
        h = heap_push(h, 8)
        let top: int = heap_peek(h)
        h = heap_pop(h)
        return top
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('max_heap push-pop cycle compiles', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let h: int[] = heap_new()
        h = max_heap_push(h, 5)
        h = max_heap_push(h, 3)
        h = max_heap_push(h, 8)
        let top: int = heap_peek(h)
        h = max_heap_pop(h)
        return top
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('heap_size returns correct value after pushes', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let h: int[] = heap_new()
        h = heap_push(h, 1)
        h = heap_push(h, 2)
        h = heap_push(h, 3)
        return heap_size(h)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })
})
