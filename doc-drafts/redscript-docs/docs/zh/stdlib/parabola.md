# `parabola` — 抛射瞄准与轨迹辅助

导入：`import "stdlib/parabola.mcrs"`

用于 Minecraft 风格抛射运动的辅助函数。这个模块主要服务于发射参数求解与简单逐 tick 模拟，速度使用 **×10000 定点**，重力常量也按 Minecraft 抛射物运动进行调整。

## 单位约定

- 位置偏移：方块
- 速度：方块/刻 ×10000
- 时间：tick
- 重力：`800` 表示 `0.08 方块/tick^2`
- 阻力：×10000

依赖 `stdlib/math` 提供的 `mulfix()` 与 `isqrt()`。

## 快速示例

```rs
import "stdlib/parabola.mcrs";

let ticks: int = 20;
let vx: int = parabola_vx(16, ticks);
let vy: int = parabola_vy(4, ticks);
let vz: int = parabola_vz(0, ticks);

let y_at_10: int = parabola_y(vy, 10);
let flight: int = parabola_flight_time(vy);
```

## 常量

### `parabola_gravity(): int`

返回 `800`，表示 ×10000 缩放下每 tick 的重力常量。

### `parabola_gravity_half(): int`

返回 `400`，用于位移公式中的 `g / 2` 项。

## 初速度求解

### `parabola_vx(dx: int, ticks: int): int`

计算在 `ticks` tick 内移动 `dx` 方块所需的初始 X 速度。若 `ticks <= 0` 返回 `0`。

### `parabola_vy(dy: int, ticks: int): int`

计算在恒定重力下，于 `ticks` tick 后达到垂直偏移 `dy` 所需的初始 Y 速度。若 `ticks <= 0` 返回 `0`。

### `parabola_vz(dz: int, ticks: int): int`

计算在 `ticks` tick 内移动 `dz` 方块所需的初始 Z 速度。若 `ticks <= 0` 返回 `0`。

### `parabola_speed_xz(dx: int, dz: int, ticks: int): int`

根据求得的 `vx` 和 `vz` 计算水平速度模长，返回值为 ×10000 缩放。

## 第 `t` Tick 的位置

### `parabola_x(vx0: int, t: int): int`

返回经过 `t` tick 后的 X 方向位移。

### `parabola_y(vy0: int, t: int): int`

返回在恒定重力下经过 `t` tick 后的 Y 方向位移。

### `parabola_z(vz0: int, t: int): int`

返回经过 `t` tick 后的 Z 方向位移。

## 飞行估算

### `parabola_flight_time(vy0: int): int`

近似返回抛射物回到发射高度所需的 tick 数。若 `vy0 <= 0` 返回 `0`。

### `parabola_max_height(vy0: int): int`

近似返回相对发射点的最高高度，单位为方块。

## 逐 Tick 阻力辅助

这些函数用于逐 tick 模拟，而不是封闭形式的瞄准求解。

### `parabola_step_vx(vx: int, drag: int): int`

对 X 速度应用一次阻力。

### `parabola_step_vy(vy: int, drag: int): int`

先施加重力，再对 Y 速度应用阻力。

### `parabola_step_vz(vz: int, drag: int): int`

对 Z 速度应用一次阻力。

## 目标辅助

### `parabola_ticks_for_range(range: int): int`

根据一个简单的平均速度启发式，为水平射程估算一个实用的飞行 tick 数。返回值至少为 `1`。

### `parabola_in_range(dx: int, dz: int, max_range: int): int`

若目标在水平最大范围 `max_range` 内则返回 `1`，否则返回 `0`。

## 说明

- 这里的封闭形式位置函数默认不考虑阻力。
- 考虑阻力时，只提供逐 tick 的速度推进辅助。
- `parabola_y()` 与 `parabola_max_height()` 返回整数方块值，因此会有截断误差。
