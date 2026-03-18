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
- [ ] **docs 网站更新** `status: todo` `priority: p4`
  - easing / noise / physics / matrix / signal / advanced / bigint / parabola / quaternion / bezier_n
  - 编译器新特性：coroutine、module system、double 类型
  - 每个 stdlib 函数加 usage example

### P2 — Stdlib 扩充
- [x] **bigint 全乘法** `status: done` — `bigint_mul` / `bigint_sq` 已实现
- [x] **抛物线弹道** `status: done` — `parabola.mcrs` 14个测试通过
- [x] **N 阶贝塞尔** `status: done` — `bezier_quartic` / `bezier_n` / `bezier_n_safe` 已实现
- [x] **统计分布扩充** `status: done` — gamma/poisson/negative-binomial added (signal.mcrs)
  - Gamma 分布 / 负二项分布 / 超几何分布（signal.mcrs 扩展）

### P3 — 编译器 / Double 运算
- [x] **double 类型基础** `status: done` — NBT storage rs:d，`as` cast，参数传递 NBT 直拷
- [x] **float arithmetic lint** `status: done` — `[FloatArithmetic]` warning
- [x] **double_mul_fixed 真正 double 精度** `status: done` — 函数宏 trick，\_\_NS\_\_ 占位符，真正 IEEE 754 double 精度
- [ ] **double_add / double_sub** `status: todo` `priority: p3`
  - loot spawn 无限坐标 trick
- [ ] **compiler intrinsic: double + double → double_add** `status: todo` `priority: p3`
  - lower.ts BinaryExpr(double, +, double) 自动降级
- [x] **高精度 ln_hp** `status: done` — Newton refinement of ln_5term，误差 < 0.001 (8–9 digit precision)

### P4 — 游戏工具
- [x] **几何选区** `status: done` — 圆锥/扇形/圆柱 entity selector helper (geometry.mcrs)
- [x] **RGB ↔ HSL 转换** `status: done` — color.mcrs 扩展 (rgb_to_h/s/l, hsl_to_r/g/b)
- [x] **太阳角度** `status: done` — world.mcrs 扩展 (sun_altitude, sun_azimuth)
- [ ] **math_hp MC integration 测试** `status: todo` `priority: p4` — 需要 MC server


---

## Long-term 🌱
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
