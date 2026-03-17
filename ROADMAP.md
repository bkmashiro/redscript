# RedScript Roadmap

Last updated: 2026-03-17

## Done ✅

### Compiler
- v2 pipeline (HIR → MIR → LIR → mcfunction)
- Module system (`module library` / `import`)
- Type checker + generics + enum + Option<T>
- @coroutine (tick-splitting state machine)
- @schedule decorator
- Incremental compilation (file-level SHA256 cache)
- Source map (`--source-map`)
- LSP (diagnostics / hover / goto-def / completion, 50+ builtins)
- Multi-MC-version target (`--mc-version`)
- Interprocedural constant propagation + specialization
- int32 overflow-safe constant folding (`(n | 0)` wrap on all arithmetic)
- LIR score_set out-of-range warning (defensive layer)
- DCE (dead code elimination)
- Peephole: execute-store-success, constant immediate folding

### stdlib
- `math.mcrs`: abs/sign/min/max/clamp/lerp/isqrt/sqrt_fixed/sin_fixed/cos_fixed/atan2_fixed/gcd/lcm/pow_int/log2_int/mulfix/divfix/smoothstep/smootherstep/ln/exp_fx/cbrt_fx/cbrt_newton/gamma_int/quadratic/asin_approx/acos_approx + more
  - ln coefficients SA-tuned: max_error = 0.000504
- `math_hp.mcrs`: high-precision sin/cos via entity rotation trick
- `bigint.mcrs`: 3-chunk (96-bit) helpers + arbitrary-length array API (add/sub/mul_small/cmp/zero/copy/div_small)
- `bits.mcrs`: bit_get/set/clear/toggle/shl/shr/and/or/xor/not/popcount
- `list.mcrs`: sort2–5 networks, list_sort_asc/desc, min/max/avg helpers
- `random.mcrs`: LCG/PCG RNG, random_range/bool
- `easing.mcrs`: 12 easing functions
- `noise.mcrs`: hash_1d/2d, value_noise_1d/2d, fbm_1d/2d, terrain_height
- `physics.mcrs`: projectile/drag/spring/friction/circular motion
- `matrix.mcrs`: 2D/3D rotation, quaternion helpers, billboard, lerp_angle
- `signal.mcrs`: uniform/bernoulli/normal_approx12/exp_dist/weighted2/3
- `advanced.mcrs`: fib/is_prime/collatz/digit_sum/mod_pow/bezier_quad/cubic/mandelbrot/julia + geometry
- `vec.mcrs`: 2D/3D vector ops (dot/cross/length/normalize/lerp)
- `calculus.mcrs`: trapezoid/simpson/newton_step
- `color.mcrs`, `combat.mcrs`, `cooldown.mcrs`, `effects.mcrs`, `interactions.mcrs`
- `inventory.mcrs`, `mobs.mcrs`, `particles.mcrs`, `spawn.mcrs`, `tags.mcrs`
- `teams.mcrs`, `timer.mcrs`, `world.mcrs`, `player.mcrs`, `bossbar.mcrs`, `strings.mcrs`, `sets.mcrs`

### Testing
- Unit/e2e: 1373 tests all passing
- MC integration: 69 tests all passing (random/bits/list/bigint/math)
- int32 overflow regression tests in constant_fold
- advanced.mcrs e2e (+39 tests)
- noise.mcrs + signal.mcrs e2e (+30 tests)
- matrix.mcrs compilation tests (+18 tests)

### Tooling
- Tuner (SA + Nelder-Mead) for polynomial coefficient optimization
  - ln-polynomial adapter (tuned: A1=20026 A3=6394 A5=5511)
  - sqrt-newton adapter
- `redscript tune --adapter <name> --strategy sa`
- VSCode extension (syntax highlight, f-string, #rs, hover tooltips) — auto-bumped via CI

---

## Up Next 📋

### P1 — Docs
- [ ] **docs 网站更新** — v2.2.0 之后没更新，v2.5.0 的新 stdlib 模块全没有文档
  - easing / noise / physics / matrix / signal / advanced / bigint (new API)
  - 编译器新特性：coroutine、module system、tuner
  - 每个 stdlib 函数加 usage example

### P2 — Stdlib 扩充
- [ ] **bigint 全乘法** — `bigint_mul(a, b, result, len)` 任意位数组乘法
  - 目前只有 `bigint_mul_small`（乘小整数）
  - kaer 有无限位数组乘法，是 RedScript 最大的 bigint 缺口
- [ ] **抛物线弹道** (`parabola.mcrs`)
  - `parabola_v0_x/y/z(dx, dy, dz, ticks)` — 根据目标位移和时间算初速度
  - `parabola_pos_x/y/z(v0x, v0y, ticks)` — 给定时间算位置
  - kaer 有完整实现，MC 游戏开发高频需求
- [ ] **N 阶贝塞尔** (`advanced.mcrs` 扩展)
  - 目前只有 bezier_quad (2次) 和 bezier_cubic (3次)
  - 加 bezier_quartic (4次) + 通用 N 阶（De Casteljau 递归，有命令数限制）
- [ ] **统计分布扩充** (`signal.mcrs`)
  - Gamma 分布 / 负二项分布 / 超几何分布
  - kaer 全有，RedScript 差这几个

### P3 — 编译器扩展
- [ ] **NBT double 运算支持**
  - `execute store result storage xxx double <scale>` codegen
  - 解锁高精度浮点（突破 int32 上限）
  - 需要新的 HIR/MIR 类型系统扩展（`double` 类型）
  - 工作量大，但是高精度 ln/exp/sin/cos 的前提
- [ ] **高精度 ln (`ln_hp`)**
  - 依赖 NBT double 支持
  - 用 Remez 7-系数多项式（L1~L7），误差可达 2^-58.45 级别
  - kaer 的差距最大的一块

### P4 — 游戏工具
- [ ] **几何选区** — 圆锥/扇形/圆柱 entity selector helper
- [ ] **RGB ↔ HSL 转换** (`color.mcrs` 扩展)
- [ ] **太阳角度** (`world.mcrs` 扩展) — 根据 daytime 计算太阳方位
- [ ] **math_hp.mcrs MC integration 测试** — 需要 MC server，有 marker entity

### Long-term 🌱
- [ ] **Fourier 分析** — DFT/FFT，kaer 有，RedScript 最复杂的缺口
- [ ] **表达式解析器** — 运行时解析 `"2*x+sin(x)"` 字符串，kaer 有逆波兰算法
- [ ] **更多 Tuner adapter** — exp_fx / sin_fixed 系数优化

---

## Notes

**vs kaer (large_number):**
- kaer 最大优势：double 精度（NBT float/double 作载体）
- RedScript 优势：编译器（高级语言语法，类型安全，不用手写 .mcfunction）
- bigint 全乘法 + 抛物线弹道 是最值得优先做的两个缺口
- 高精度浮点需要编译器层支持，工作量最大
