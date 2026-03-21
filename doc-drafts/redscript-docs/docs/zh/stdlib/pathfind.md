# `pathfind` — 16×16 网格 BFS 寻路

导入：`import "stdlib/pathfind.mcrs"`

在固定 **16×16** XZ 网格上执行广度优先寻路。障碍物保存在一个 256 元素的 `int[]` 中，路径结果则以压缩坐标数组的形式返回。

## 坐标压缩

单元格编码方式：

```text
packed = x * 16 + z
```

对应辅助函数：

- `pf_unpack_x(packed) = packed / 16`
- `pf_unpack_z(packed) = packed % 16`

## 快速示例

```rs
import "stdlib/pathfind.mcrs";

let map: int[] = pf_new_map();
pf_set_blocked(map, 3, 5);
pf_set_blocked(map, 3, 6);

let path: int[] = pathfind_bfs(map, 0, 0, 7, 7);
let first_x: int = pf_unpack_x(path[0]);
let first_z: int = pf_unpack_z(path[0]);
```

## 地图辅助

### `pf_pack(x: int, z: int): int`

将网格坐标压缩为一个整数。

### `pf_unpack_x(packed: int): int`

从压缩坐标中取回 X。

### `pf_unpack_z(packed: int): int`

从压缩坐标中取回 Z。

### `pf_new_map(): int[]`

创建一个 256 元素的障碍图，初始时所有单元都可通行。

### `pf_set_blocked(map: int[], x: int, z: int)`

把 `(x, z)` 标记为阻塞，写入 `1`。

### `pf_set_open(map: int[], x: int, z: int)`

把 `(x, z)` 标记为可通行，写入 `0`。

### `pf_is_blocked(map: int[], x: int, z: int): int`

若单元阻塞或越界则返回 `1`，否则返回 `0`。

## 启发式辅助

### `pf_heuristic(x1: int, z1: int, x2: int, z2: int): int`

返回 ×10000 缩放的曼哈顿距离。

当前模块里这个函数主要是信息性辅助，`pathfind_bfs()` 本身并不会使用它；如果你要在同样的数据结构上扩展 A*，它会很有用。

## 同步寻路

### `pathfind_bfs(map: int[], sx: int, sz: int, gx: int, gz: int): int[]`

寻找从起点到终点的最短四方向路径。

- 返回从起点到终点的压缩坐标数组，包含两端。
- 无路可走时返回 `[]`。
- 扩展邻居的顺序为 North、South、West、East。

因为这是统一代价网格上的 BFS，所以返回路径在步数意义下是最短的。

## 协程寻路

### `pathfind_bfs_coro(map: int[], sx: int, sz: int, gx: int, gz: int, out: int[])`

BFS 的协程版本：

- 带有 `@coroutine(batch=16, onDone=pf_noop)` 注解。
- 每个 tick 最多处理 16 次 BFS 迭代。
- 不能直接返回值，因此会把完成后的路径 push 到 `out`。

当你不想把一次同步搜索的开销集中在单个 tick 内时，用这个版本更合适。

### `pf_noop()`

协程版本默认的空 `onDone` 回调。

## 说明

- 网格范围固定为两个轴的 `0..15`。
- 起点和终点不会在索引前做显式边界校验，因此调用方应保证坐标有效。
- `pf_is_blocked()` 会把越界位置视为阻塞，从而保证 BFS 不会走出地图。
