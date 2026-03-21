# `graph` — 有向与无向加权图

导入：`import "stdlib/graph.mcrs"`

RedScript datapack 的固定容量图工具。图存储在单个扁平 `int[]` 中，支持最多 **64 个节点**与 **256 条有向边**，并提供遍历与最短路径辅助函数，无需额外的图对象类型。

## 数据布局

`graph_new()` 会分配一个 770 元素的 `int[]`，布局如下：

| 索引 | 含义 |
|------|------|
| `g[0]` | 当前有向边数量 |
| `g[1]` | 节点数量 |
| `g[2 + i * 3]` | 第 `i` 条边的起点 |
| `g[2 + i * 3 + 1]` | 第 `i` 条边的终点 |
| `g[2 + i * 3 + 2]` | 第 `i` 条边的权重 |

节点使用从 `0` 开始的整数编号，范围为 `[0, graph_node_count(g))`。

## 快速示例

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
// shortest = 4，对应 0 -> 1 -> 3 -> 4
```

## 函数

### `graph_new(n: int): int[]`

创建一个包含 `n` 个节点、初始无边的新图。`n` 会被限制到 `[0, 64]`。

### `graph_add_edge(g: int[], src: int, dst: int, weight: int): int[]`

追加一条 `src -> dst` 的有向边。若 `src` 或 `dst` 非法，或者图中已经有 256 条有向边，则原样返回输入图。

### `graph_add_undirected(g: int[], a: int, b: int, weight: int): int[]`

追加 `a -> b` 与 `b -> a` 两条同权重边，相当于加入一条无向边。会消耗两个有向边槽位。

### `graph_node_count(g: int[]): int`

返回图配置的节点数。

### `graph_edge_count(g: int[]): int`

返回当前有向边数量。

### `graph_bfs(g: int[], start: int, out_visited: int[]): int[]`

从 `start` 开始执行广度优先搜索。

- 返回按 BFS 顺序访问的节点索引数组。
- 对每个可达节点，把 `out_visited[i]` 写成 `1`。
- 如果 `start` 非法，则返回 `[]`。

`out_visited` 至少需要有 `graph_node_count(g)` 个槽位，并且应由调用方先初始化为全 0。

### `graph_dfs(g: int[], start: int, out_visited: int[]): int[]`

从 `start` 开始执行深度优先搜索。

- 返回按 DFS 顺序访问的节点索引数组。
- 对每个可达节点，把 `out_visited[i]` 写成 `1`。
- 如果 `start` 非法，则返回 `[]`。

与 `graph_bfs()` 一样，输出数组的大小由调用方保证。

### `graph_has_path(g: int[], src: int, dst: int): int`

若从 `src` 到 `dst` 存在有向路径则返回 `1`，否则返回 `0`。

- 端点非法时同样返回 `0`。
- 实现上会对存储的有向边做一次 BFS。

### `graph_shortest_path(g: int[], src: int, dst: int, out_dist: int[]): int`

从 `src` 运行 Dijkstra，并把最短距离写入 `out_dist`。

- `out_dist[i]` 会变成从 `src` 到节点 `i` 的最短距离。
- 不可达节点会写成 `-1`。
- 函数返回 `out_dist[dst]`。
- `src` 或 `dst` 非法时返回 `-1`。

## 说明

- 边权重是普通整数。
- 不安全支持负权重，因为这里使用的是 Dijkstra。
- `graph_bfs()` 与 `graph_dfs()` 的内部工作数组按 64 个节点固定分配。
- `graph_shortest_path()` 内部使用 `999999` 作为无穷大哨兵值。
