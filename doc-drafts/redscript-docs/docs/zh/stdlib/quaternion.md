# `quaternion` — 定点四元数数学

导入：`import "stdlib/quaternion.mcrs"`

用于 Minecraft Display Entity 旋转的四元数辅助函数。各分量分开存储，并统一使用 **×10000** 缩放，符合显示实体旋转字段采用的 `[x, y, z, w]` 约定。

依赖 `stdlib/math` 提供的 `sin_fixed()`、`cos_fixed()`、`mulfix()` 与 `isqrt()`。

## 缩放与约定

- `10000` 表示 `1.0`
- 单位四元数为 `(0, 0, 0, 10000)`
- 单位四元数满足 `qx^2 + qy^2 + qz^2 + qw^2 ≈ 10000^2`
- 欧拉角转换采用 **YXZ** 顺序：yaw，再 pitch，再 roll

## 快速示例

```rs
import "stdlib/quaternion.mcrs";

let qx: int = quat_axis_y_x(90);
let qy: int = quat_axis_y_y(90);
let qz: int = quat_axis_y_z(90);
let qw: int = quat_axis_y_w(90);

let mid_y: int = quat_slerp_y(0, 0, 0, 10000, qx, qy, qz, qw, 500);
```

## 单位四元数

### `quat_identity_w(): int`

返回 `10000`。

### `quat_identity_x(): int`

返回 `0`。

### `quat_identity_y(): int`

返回 `0`。

### `quat_identity_z(): int`

返回 `0`。

## 轴角构造

每种轴角构造都拆成逐分量函数。角度使用普通整数度数，内部采用 `sin(angle / 2)` 与 `cos(angle / 2)`。

### 绕 X 轴旋转

- `quat_axis_x_x(angle_deg: int): int`
- `quat_axis_x_y(angle_deg: int): int`
- `quat_axis_x_z(angle_deg: int): int`
- `quat_axis_x_w(angle_deg: int): int`

### 绕 Y 轴旋转

- `quat_axis_y_x(angle_deg: int): int`
- `quat_axis_y_y(angle_deg: int): int`
- `quat_axis_y_z(angle_deg: int): int`
- `quat_axis_y_w(angle_deg: int): int`

### 绕 Z 轴旋转

- `quat_axis_z_x(angle_deg: int): int`
- `quat_axis_z_y(angle_deg: int): int`
- `quat_axis_z_z(angle_deg: int): int`
- `quat_axis_z_w(angle_deg: int): int`

## 四元数乘法

下面这些函数会分别计算 `a * b` 的各个分量：

- `quat_mul_x(ax, ay, az, aw, bx, by, bz, bw): int`
- `quat_mul_y(ax, ay, az, aw, bx, by, bz, bw): int`
- `quat_mul_z(ax, ay, az, aw, bx, by, bz, bw): int`
- `quat_mul_w(ax, ay, az, aw, bx, by, bz, bw): int`

组合旋转时需要一起使用。

## 共轭

对于单位四元数，共轭同时也是逆。

- `quat_conj_x(qx, qy, qz, qw): int`
- `quat_conj_y(qx, qy, qz, qw): int`
- `quat_conj_z(qx, qy, qz, qw): int`
- `quat_conj_w(qx, qy, qz, qw): int`

## 模长与点积

### `quat_mag_sq(qx: int, qy: int, qz: int, qw: int): int`

返回 ×10000 缩放下的模长平方。归一化四元数的结果应接近 `10000`。

### `quat_dot(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int): int`

返回 ×10000 缩放下的点积。

## 插值

### `quat_slerp_x(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

### `quat_slerp_y(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

### `quat_slerp_z(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

### `quat_slerp_w(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

在四元数 `a` 与 `b` 之间做近似球面插值。

- `t` 范围为 `[0, 1000]`
- `0` 返回 `a`
- `1000` 返回 `b`

实现细节上，这里使用的是 “线性插值 + 归一化” 的近似方案，而不是真正基于三角函数的 SLERP。它更便宜，也足够用于 Minecraft 动画。

## 欧拉角转四元数

### `quat_euler_x(yaw: int, pitch: int, roll: int): int`

### `quat_euler_y(yaw: int, pitch: int, roll: int): int`

### `quat_euler_z(yaw: int, pitch: int, roll: int): int`

### `quat_euler_w(yaw: int, pitch: int, roll: int): int`

把角度制的 yaw、pitch、roll 按 YXZ 顺序转换为四元数。

## 说明

- 这些辅助函数分开返回各个分量，而不是返回单个数组，这更贴近 RedScript 用户写 NBT 字段时的常见方式。
- 轴角构造与欧拉角转换都依赖数学模块中的三角查表已经可用。
