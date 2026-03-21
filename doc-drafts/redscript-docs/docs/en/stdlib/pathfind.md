# `pathfind` — 16×16 Grid BFS Pathfinding

Import: `import "stdlib/pathfind.mcrs"`

Breadth-first pathfinding on a fixed **16×16** XZ grid. Obstacles are stored in a 256-element `int[]`, and paths are returned as packed grid coordinates.

## Coordinate Packing

Cells are encoded as:

```text
packed = x * 16 + z
```

Helpers:

- `pf_unpack_x(packed) = packed / 16`
- `pf_unpack_z(packed) = packed % 16`

## Quick Example

```rs
import "stdlib/pathfind.mcrs";

let map: int[] = pf_new_map();
pf_set_blocked(map, 3, 5);
pf_set_blocked(map, 3, 6);

let path: int[] = pathfind_bfs(map, 0, 0, 7, 7);
let first_x: int = pf_unpack_x(path[0]);
let first_z: int = pf_unpack_z(path[0]);
```

## Map Helpers

### `pf_pack(x: int, z: int): int`

Pack a grid coordinate into one integer.

### `pf_unpack_x(packed: int): int`

Recover the X coordinate from a packed cell id.

### `pf_unpack_z(packed: int): int`

Recover the Z coordinate from a packed cell id.

### `pf_new_map(): int[]`

Allocate a 256-element obstacle map with all cells open.

### `pf_set_blocked(map: int[], x: int, z: int)`

Mark `(x, z)` as blocked by writing `1`.

### `pf_set_open(map: int[], x: int, z: int)`

Mark `(x, z)` as open by writing `0`.

### `pf_is_blocked(map: int[], x: int, z: int): int`

Return `1` if the cell is blocked or out of bounds, otherwise `0`.

## Heuristic Helper

### `pf_heuristic(x1: int, z1: int, x2: int, z2: int): int`

Return Manhattan distance in ×10000 fixed-point form.

This function is informational in the current module. `pathfind_bfs()` does not use it, but it is useful if you build A* on top of the same map representation.

## Synchronous Pathfinding

### `pathfind_bfs(map: int[], sx: int, sz: int, gx: int, gz: int): int[]`

Find the shortest 4-direction path from start to goal.

- Returns packed coordinates from start to goal, inclusive.
- Returns `[]` when no path exists.
- Expansion order is North, South, West, East.

Because this is BFS on a uniform-cost grid, the returned path is shortest in number of steps.

## Coroutine Pathfinding

### `pathfind_bfs_coro(map: int[], sx: int, sz: int, gx: int, gz: int, out: int[])`

Coroutine version of BFS:

- Decorated with `@coroutine(batch=16, onDone=pf_noop)`.
- Processes up to 16 BFS iterations per tick.
- Cannot return a value directly, so it pushes the finished path into `out`.

Use this when a synchronous search would be too expensive in one tick.

### `pf_noop()`

Default empty `onDone` callback for the coroutine variant.

## Notes

- The grid is hard-coded to `0..15` on both axes.
- Start and goal cells are not validated explicitly before indexing, so callers should pass valid coordinates.
- `pf_is_blocked()` treats out-of-bounds cells as blocked, which keeps BFS inside the grid.
