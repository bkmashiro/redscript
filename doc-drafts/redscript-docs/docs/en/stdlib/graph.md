# `graph` — Directed and Undirected Weighted Graphs

Import: `import "stdlib/graph.mcrs"`

Fixed-capacity graph utilities for RedScript datapacks. The graph is stored in a single flat `int[]`, supports up to **64 nodes** and **256 directed edges**, and provides traversal plus shortest-path helpers without any dynamic graph object type.

## Data Layout

`graph_new()` allocates a 770-element `int[]` with this layout:

| Index | Meaning |
|------|------|
| `g[0]` | Current directed edge count |
| `g[1]` | Node count |
| `g[2 + i * 3]` | Edge `i` source |
| `g[2 + i * 3 + 1]` | Edge `i` destination |
| `g[2 + i * 3 + 2]` | Edge `i` weight |

Nodes are zero-based integers in `[0, graph_node_count(g))`.

## Quick Example

```rs
import "stdlib/graph.mcrs";

let g: int[] = graph_new(5);
g = graph_add_edge(g, 0, 1, 1);
g = graph_add_edge(g, 0, 2, 4);
g = graph_add_undirected(g, 2, 3, 2);
g = graph_add_edge(g, 1, 3, 2);
g = graph_add_edge(g, 3, 4, 1);

let vis: int[] = [0, 0, 0, 0, 0];
let bfs_order: int[] = graph_bfs(g, 0, vis);

let dist: int[] = [0, 0, 0, 0, 0];
let shortest: int = graph_shortest_path(g, 0, 4, dist);
// shortest = 4 via 0 -> 1 -> 3 -> 4
```

## Functions

### `graph_new(n: int): int[]`

Allocate a new graph with `n` nodes and no edges. `n` is clamped to `[0, 64]`.

### `graph_add_edge(g: int[], src: int, dst: int, weight: int): int[]`

Append one directed edge `src -> dst`. If `src` or `dst` is invalid, or the graph already holds 256 directed edges, the input graph is returned unchanged.

### `graph_add_undirected(g: int[], a: int, b: int, weight: int): int[]`

Append `a -> b` and `b -> a` with the same weight. This consumes two directed-edge slots.

### `graph_node_count(g: int[]): int`

Return the configured node count.

### `graph_edge_count(g: int[]): int`

Return the current directed edge count.

### `graph_bfs(g: int[], start: int, out_visited: int[]): int[]`

Breadth-first search from `start`.

- Returns node indices in BFS visit order.
- Writes `1` into `out_visited[i]` for each reachable node.
- Returns `[]` if `start` is invalid.

`out_visited` must have at least `graph_node_count(g)` slots and should be zero-initialized by the caller.

### `graph_dfs(g: int[], start: int, out_visited: int[]): int[]`

Depth-first search from `start`.

- Returns node indices in DFS visit order.
- Writes `1` into `out_visited[i]` for each reachable node.
- Returns `[]` if `start` is invalid.

Like `graph_bfs()`, the caller owns the output array sizing.

### `graph_has_path(g: int[], src: int, dst: int): int`

Return `1` if a directed path exists from `src` to `dst`, otherwise `0`.

- Invalid endpoints also return `0`.
- The implementation uses BFS over the stored directed edges.

### `graph_shortest_path(g: int[], src: int, dst: int, out_dist: int[]): int`

Run Dijkstra from `src` and fill `out_dist` with shortest distances.

- `out_dist[i]` becomes the shortest distance from `src` to node `i`.
- Unreachable nodes are written as `-1`.
- The function returns `out_dist[dst]`.
- Invalid `src` or `dst` returns `-1`.

## Notes

- Edge weights are plain integers.
- Negative weights are not supported safely because the algorithm is Dijkstra.
- `graph_bfs()` and `graph_dfs()` use fixed-size internal arrays sized for 64 nodes.
- `graph_shortest_path()` uses `999999` as its internal infinity sentinel.
