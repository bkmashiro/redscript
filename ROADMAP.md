# RedScript Roadmap

Last updated: 2026-03-18

---

## Current State (v2.5.0)

### Compiler
- v2 pipeline: HIR → MIR → LIR → mcfunction
- Type system: int / fixed (×10000) / double (NBT IEEE 754) / float (deprecated)
- `double` type: NBT storage `rs:d`, explicit `as` cast required, binary ops auto-lower to stdlib intrinsics
- Module system, generics, enum, Option<T>
- @coroutine, @schedule, @on decorators
- Incremental compilation, source maps, LSP, DCE, peephole optimizer
- Compiler intrinsics: `double + double` → `double_add`, etc.
- int32 overflow-safe constant folding, LIR out-of-range lint

### stdlib (complete)
| Module | Contents |
|--------|----------|
| `math.mcrs` | abs/sign/min/max/clamp/lerp/sqrt/sin/cos/atan2/ln/exp/cbrt/bezier + more (SA-tuned) |
| `math_hp.mcrs` | double_add/sub/mul/div, double_mul_fixed, ln_hp, ln_5term, sin/cos via entity rotation |
| `bigint.mcrs` | 96-bit helpers + arbitrary-length array API (add/sub/mul/div/cmp) |
| `signal.mcrs` | DFT, gamma/poisson/negbin distributions, uniform/bernoulli/normal |
| `geometry.mcrs` | in_cylinder, in_cone, in_sector_2d |
| `expr.mcrs` | RPN expression evaluator |
| `parabola.mcrs` | ballistic trajectory |
| `quaternion.mcrs` | Display Entity rotation, SLERP |
| `advanced.mcrs` | bezier_n, fib, primes, Mandelbrot |
| `color.mcrs` | RGB↔HSL |
| `world.mcrs` | sun_altitude, sun_azimuth |
| `noise/easing/physics/matrix/bits/list/random/vec/calculus/...` | complete |

### Tests
- Unit/e2e: **1588** passing
- MC integration: **74** passing

### Tooling
- SA + Nelder-Mead tuner (`redscript tune --adapter <name>`)
  - Adapters: ln-polynomial, sqrt-newton
- VSCode extension (syntax highlight, hover, goto-def, completion)

---

## Next Steps 🗺️

### Near-term (v2.6)

#### Compiler improvements
- [ ] **`as fixed` temp var rename bug** — raw() 内的 `$tN` 不被 LIR rename，导致 double→fixed cast 在嵌套调用中出错。需在 lower.ts 用 prefixed name 或改用非 raw emit。
- [ ] **exp_fx / sin_fixed Tuner adapters** — 参照 ln-polynomial，用 SA 优化系数，减小误差
- [ ] **函数宏 `__NS__` 扩展** — 目前只替换 namespace 名，考虑支持 `__OBJ__`（objective 名）减少 raw() hardcode

#### stdlib
- [ ] **超几何分布** — `hypergeometric_sample(N, K, n, seed)` 补进 signal.mcrs（kaer 还有这个）
- [ ] **矩阵乘法** — `mat3_mul(a, b)` / `mat4_mul` in matrix.mcrs（目前只有旋转，缺通用乘法）
- [ ] **bigint 除法** — 目前只有 `div_small`（除以小整数），缺 bigint÷bigint

#### Testing
- [ ] **sun_altitude MC integration** — 依赖 sin_fixed + NBT storage，需真实 MC 服务器验证
- [ ] **double_add/sub MC integration** — 需要 entity position trick 的 MC 验证

### Medium-term (v3.0)

#### 语言层
- [ ] **`for` 循环语法糖** — `for i in 0..n` 脱糖为 while，减少样板代码
- [ ] **数组字面量类型推断** — `let a = [1, 2, 3]` 自动推断 `int[]`
- [ ] **结构体方法** — `impl Vec3 { fn dot(self, other) }` 语法

#### 工具链
- [ ] **REPL / playground** — 浏览器内 RedScript→mcfunction 实时预览
- [ ] **exp_fx / sin_fixed adapter** — SA 调参进一步减小误差

### Long-term 🌱

- [ ] **FFT** — 快速傅里叶（O(n log n)），目前只有 DFT（O(n²)）
- [ ] **字符串插值编译期支持** — 目前 f-string 是 VSCode 插件 trick，不是真正语言特性
- [ ] **跨文件增量测试** — 只重跑受影响模块的测试，加快 CI

---

## Architecture Notes

- **double 参数传递**：callee 内 `rs:d __dp0`, `__dp1`（NBT 直拷，不经 scoreboard）
- **double_mul_fixed 宏 trick**：`__dmul_args.scale`（必须用点号，空格是旧 bug）
- **marker entity UUID**：`b54f1a4f-d7ac-4002-915e-3c2a3bf6f8a4`（double_add/sub 用）
- **`__NS__` placeholder**：raw() 中使用，编译时替换为 namespace 名
- **mulfix(a,b) = a×b/1000**（×10000 scale 下的乘法修正）
- **PCG next_lo** 有超出 int32 范围的常数问题（已知，不影响功能，待修）
