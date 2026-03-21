/**
 * Tests for stdlib/graph.mcrs — fixed-capacity graph utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/graph.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/graph.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('graph_new is emitted', () => {
    const r = compileWith(`@keep fn t(): int[] { return graph_new(5); }`)
    expect(r.files.some(f => f.path.includes('graph_new'))).toBe(true)
  })

  test('graph_add_edge is emitted', () => {
    const r = compileWith(`@keep fn t(): int[] {
      let g: int[] = graph_new(3);
      return graph_add_edge(g, 0, 1, 1);
    }`)
    expect(r.files.some(f => f.path.includes('graph_add_edge'))).toBe(true)
  })

  test('graph_add_undirected is emitted', () => {
    const r = compileWith(`@keep fn t(): int[] {
      let g: int[] = graph_new(3);
      return graph_add_undirected(g, 0, 1, 1);
    }`)
    expect(r.files.some(f => f.path.includes('graph_add_undirected'))).toBe(true)
  })

  test('graph_node_count is emitted', () => {
    const r = compileWith(`@keep fn t(): int {
      let g: int[] = graph_new(5);
      return graph_node_count(g);
    }`)
    expect(r.files.some(f => f.path.includes('graph_node_count'))).toBe(true)
  })

  test('graph_has_path is emitted', () => {
    const r = compileWith(`@keep fn t(): int {
      let g: int[] = graph_new(3);
      g = graph_add_edge(g, 0, 1, 1);
      return graph_has_path(g, 0, 1);
    }`)
    expect(r.files.some(f => f.path.includes('graph_has_path'))).toBe(true)
  })

  test('graph_bfs is emitted', () => {
    const r = compileWith(`@keep fn t(): int[] {
      let g: int[] = graph_new(3);
      let vis: int[] = [0, 0, 0];
      return graph_bfs(g, 0, vis);
    }`)
    expect(r.files.some(f => f.path.includes('graph_bfs'))).toBe(true)
  })

  test('graph_shortest_path is emitted', () => {
    const r = compileWith(`@keep fn t(): int {
      let g: int[] = graph_new(3);
      g = graph_add_edge(g, 0, 1, 2);
      let dist: int[] = [0, 0, 0];
      return graph_shortest_path(g, 0, 1, dist);
    }`)
    expect(r.files.some(f => f.path.includes('graph_shortest_path'))).toBe(true)
  })
})
