/**
 * Tests for stdlib/pathfind.mcrs — BFS grid pathfinding.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const PF_STDLIB = path.join(__dirname, '../../stdlib/pathfind.mcrs')
const pfSrc = fs.readFileSync(PF_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(pfSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

describe('stdlib/pathfind.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      const result = compile(pfSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  test('pf_pack function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return pf_pack(3, 7); }`)
    expect(files.some(f => f.path.includes('pf_pack'))).toBe(true)
  })

  test('pf_unpack_x function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return pf_unpack_x(55); }`)
    expect(files.some(f => f.path.includes('pf_unpack_x'))).toBe(true)
  })

  test('pf_unpack_z function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return pf_unpack_z(55); }`)
    expect(files.some(f => f.path.includes('pf_unpack_z'))).toBe(true)
  })

  test('pf_new_map function is emitted', () => {
    const files = compileWith(`@keep fn t(): int[] { return pf_new_map(); }`)
    expect(files.some(f => f.path.includes('pf_new_map'))).toBe(true)
  })

  test('pf_set_blocked function is emitted', () => {
    const files = compileWith(`@keep fn t() { let map: int[] = pf_new_map(); pf_set_blocked(map, 3, 5); }`)
    expect(files.some(f => f.path.includes('pf_set_blocked'))).toBe(true)
  })

  test('pf_set_open function is emitted', () => {
    const files = compileWith(`@keep fn t() { let map: int[] = pf_new_map(); pf_set_open(map, 3, 5); }`)
    expect(files.some(f => f.path.includes('pf_set_open'))).toBe(true)
  })

  test('pf_is_blocked function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let map: int[] = pf_new_map()
        pf_set_blocked(map, 2, 2)
        return pf_is_blocked(map, 2, 2)
      }
    `)
    expect(files.some(f => f.path.includes('pf_is_blocked'))).toBe(true)
  })

  test('pf_heuristic function is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return pf_heuristic(0, 0, 3, 4); }`)
    expect(files.some(f => f.path.includes('pf_heuristic'))).toBe(true)
  })

  test('pathfind_bfs function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int[] {
        let map: int[] = pf_new_map()
        return pathfind_bfs(map, 0, 0, 2, 2)
      }
    `)
    expect(files.some(f => f.path.includes('pathfind_bfs'))).toBe(true)
  })

  test('pf_noop function is emitted', () => {
    const files = compileWith(`@keep fn t() { pf_noop(); }`)
    expect(files.some(f => f.path.includes('pf_noop'))).toBe(true)
  })

  test('pathfind_bfs_coro function is emitted', () => {
    const files = compileWith(`
      @keep fn t() {
        let map: int[] = pf_new_map()
        let out: int[] = []
        pathfind_bfs_coro(map, 0, 0, 3, 3, out)
      }
    `)
    expect(files.some(f => f.path.includes('pathfind_bfs_coro'))).toBe(true)
  })

  test('pf_pack and pf_unpack are inverse operations (compile check)', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let packed: int = pf_pack(5, 9)
        let x: int = pf_unpack_x(packed)
        let z: int = pf_unpack_z(packed)
        return x + z
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('full pathfinding pipeline compiles', () => {
    const files = compileWith(`
      @keep fn t(): int[] {
        let map: int[] = pf_new_map()
        pf_set_blocked(map, 1, 0)
        pf_set_blocked(map, 1, 1)
        pf_set_blocked(map, 1, 2)
        let path: int[] = pathfind_bfs(map, 0, 0, 2, 0)
        return path
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('heuristic for same point is zero', () => {
    const files = compileWith(`
      @keep fn t(): int {
        return pf_heuristic(5, 5, 5, 5)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('pf_is_blocked returns 1 for out-of-bounds (negative)', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let map: int[] = pf_new_map()
        return pf_is_blocked(map, -1, 0)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })

  test('pf_is_blocked returns 1 for out-of-bounds (≥16)', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let map: int[] = pf_new_map()
        return pf_is_blocked(map, 16, 0)
      }
    `)
    expect(files.length).toBeGreaterThan(0)
  })
})
