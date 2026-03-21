# `physics` — 简单定点物理辅助

导入：`import "stdlib/physics.mcrs"`

面向 Minecraft datapack 的简化物理辅助函数。这个模块按轴分别处理整数物理量，并使用 **×100** 定点约定，其中 `100` 表示 `1.0 方块` 或 `1.0 方块/刻`。

## 单位约定

- 位置：方块 ×100
- 速度：方块/刻 ×100
- 时间：tick
- 重力：`8` 表示 `0.08 方块/tick^2`
- 阻力与恢复系数：×10000

## 快速示例

```rs
import "stdlib/physics.mcrs";

let y0: int = 6400;    // 64.00 方块
let vy0: int = 120;    // 1.20 方块/刻
let t: int = 10;

let y: int = projectile_y(y0, vy0, t);
let vy: int = projectile_vy(vy0, t);

let bounced: int = bounce_v(vy, 7000);   // 70% 反弹
```

## 常量

### `gravity_fx(): int`

返回 `8`，表示 ×100 单位下近似 Minecraft 的重力。

### `air_drag_fx(): int`

返回 `9800`，表示每 tick `0.98` 的阻力因子。

### `water_drag_fx(): int`

返回 `8000`，表示每 tick `0.80` 的阻力因子。

## 抛体运动

### `projectile_y(p0: int, v0: int, t: int): int`

在恒定重力、无阻力下，经过 `t` tick 后的纵向位置。

### `projectile_x(p0: int, v0: int, t: int): int`

在无阻力下，经过 `t` tick 后的横向位置。

### `projectile_vy(v0: int, t: int): int`

受到重力作用 `t` tick 后的纵向速度。

### `projectile_land_t(v0y: int): int`

近似返回回到发射高度所需的 tick 数。若 `v0y <= 0` 则返回 `0`。

### `projectile_max_height(v0y: int): int`

返回相对发射点的最大高度，单位为 ×100。

## 阻力与积分

### `apply_drag(v_fx: int, drag_fx: int): int`

执行一步乘性阻力：`v * drag / 10000`。

### `apply_gravity(vy_fx: int): int`

对纵向速度应用一次重力。

### `update_pos(p_fx: int, v_fx: int): int`

将速度直接加到位置上，推进一个 tick。

## 碰撞与限幅

### `bounce_v(v_fx: int, restitution_fx: int): int`

反转速度并应用恢复系数。

- `10000` = 完全弹性
- `5000` = 半速反弹
- `0` = 不反弹

### `clamp_velocity(v_fx: int, max_fx: int): int`

把速度限制到 `[-max_fx, max_fx]`。

## 弹簧辅助

### `spring_force(pos_fx: int, target_fx: int, k_fx: int): int`

按 Hooke 定律计算朝向 `target_fx` 的弹簧力，`k_fx` 使用 ×10000 缩放。

### `spring_update_v(v_fx: int, pos_fx: int, target_fx: int, k_fx: int, damping_fx: int): int`

同时施加弹簧力与阻尼，得到下一步速度估计。

## 圆周运动

这一部分依赖 `stdlib/math` 的三角函数。

### `circular_x(cx: int, r: int, angle_deg: int): int`

返回以 `cx` 为圆心的圆周 X 坐标。

### `circular_z(cz: int, r: int, angle_deg: int): int`

返回以 `cz` 为圆心的圆周 Z 坐标。

## 摩擦与撞击

### `friction_decel(v_fx: int, friction_fx: int): int`

按固定绝对值每 tick 把速度衰减到 0。

### `is_grounded(y_fx: int, ground_y_fx: int): int`

若 `y_fx <= ground_y_fx` 则返回 `1`，否则返回 `0`。

### `impact_velocity(h_fx: int): int`

根据下落高度近似计算撞击速度，高度单位为 ×100。非正高度返回 `0`。

## 说明

- 这是一个刻意保持简单、按轴分离的模块。
- 没有向量类型，调用方需要自己组合 `x`、`y`、`z`。
- `circular_x()`、`circular_z()` 与 `impact_velocity()` 依赖 `sin_fixed`、`cos_fixed`、`isqrt` 等数学辅助函数。
