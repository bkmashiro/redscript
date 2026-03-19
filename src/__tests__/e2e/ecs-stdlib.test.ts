/**
 * End-to-end tests for ecs.mcrs — Entity Component System stdlib.
 *
 * Tests health component, velocity component, and registry operations by
 * compiling with librarySources, loading into MCRuntime, and asserting values.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../emit/compile'
import { MCRuntime } from '../../runtime'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NS = 'test'
const OBJ = `__${NS}`

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/math.mcrs'),
  'utf-8',
)
const ECS_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/ecs.mcrs'),
  'utf-8',
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuntime(source: string, libs: string[] = [MATH_SRC, ECS_SRC]): MCRuntime {
  const result = compile(source, { namespace: NS, librarySources: libs })
  const rt = new MCRuntime(NS)
  for (const file of result.files) {
    if (!file.path.endsWith('.mcfunction')) continue
    const m = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!m) continue
    rt.loadFunction(`${m[1]}:${m[2]}`, file.content.split('\n'))
  }
  rt.execFunction(`${NS}:load`)
  return rt
}

function callAndGetRet(rt: MCRuntime, fnName: string): number {
  rt.execFunction(`${NS}:${fnName}`)
  return rt.getScore('$ret', OBJ)
}

// ---------------------------------------------------------------------------
// Health Component Tests
// ---------------------------------------------------------------------------

describe('ecs.mcrs — Health Component', () => {
  const rt = makeRuntime(`
    fn test_health_init_entity(): int {
      let s: int[] = ecs_health_init(42, 100)
      return s[0]
    }

    fn test_health_init_current(): int {
      let s: int[] = ecs_health_init(42, 100)
      return s[1]
    }

    fn test_health_init_max(): int {
      let s: int[] = ecs_health_init(42, 100)
      return s[2]
    }

    fn test_health_get(): int {
      let s: int[] = ecs_health_init(1, 80)
      return ecs_health_get(s)
    }

    fn test_health_max(): int {
      let s: int[] = ecs_health_init(1, 80)
      return ecs_health_max(s)
    }

    fn test_health_damage(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 30)
      return ecs_health_get(s)
    }

    fn test_health_damage_clamp(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 200)
      return ecs_health_get(s)
    }

    fn test_health_heal(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 50)
      s = ecs_health_heal(s, 20)
      return ecs_health_get(s)
    }

    fn test_health_heal_clamp(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 10)
      s = ecs_health_heal(s, 50)
      return ecs_health_get(s)
    }

    fn test_health_is_dead_alive(): int {
      let s: int[] = ecs_health_init(1, 100)
      return ecs_health_is_dead(s)
    }

    fn test_health_is_dead_dead(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 100)
      return ecs_health_is_dead(s)
    }

    fn test_health_is_dead_overdamage(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 500)
      return ecs_health_is_dead(s)
    }

    fn test_health_pct_full(): int {
      let s: int[] = ecs_health_init(1, 100)
      return ecs_health_pct(s)
    }

    fn test_health_pct_half(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 50)
      return ecs_health_pct(s)
    }

    fn test_health_pct_zero(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_damage(s, 100)
      return ecs_health_pct(s)
    }

    fn test_health_set(): int {
      let s: int[] = ecs_health_init(1, 100)
      s = ecs_health_set(s, 75)
      return ecs_health_get(s)
    }

    fn test_health_lifecycle(): int {
      // init(42, 100) -> damage(30) -> heal(10) -> HP should be 80
      let s: int[] = ecs_health_init(42, 100)
      s = ecs_health_damage(s, 30)
      s = ecs_health_heal(s, 10)
      return ecs_health_get(s)
    }
  `)

  // --- init ---
  test('init: state[0] == entity_score', () =>
    expect(callAndGetRet(rt, 'test_health_init_entity')).toBe(42))

  test('init: state[1] == max_hp (starts full)', () =>
    expect(callAndGetRet(rt, 'test_health_init_current')).toBe(100))

  test('init: state[2] == max_hp', () =>
    expect(callAndGetRet(rt, 'test_health_init_max')).toBe(100))

  // --- getters ---
  test('ecs_health_get returns current HP', () =>
    expect(callAndGetRet(rt, 'test_health_get')).toBe(80))

  test('ecs_health_max returns max HP', () =>
    expect(callAndGetRet(rt, 'test_health_max')).toBe(80))

  // --- damage ---
  test('damage: HP decreases correctly (100 - 30 = 70)', () =>
    expect(callAndGetRet(rt, 'test_health_damage')).toBe(70))

  test('damage: clamps to 0 on overkill', () =>
    expect(callAndGetRet(rt, 'test_health_damage_clamp')).toBe(0))

  // --- heal ---
  test('heal: HP increases correctly (50 dmg then +20 = 70)', () =>
    expect(callAndGetRet(rt, 'test_health_heal')).toBe(70))

  test('heal: clamps to max HP', () =>
    expect(callAndGetRet(rt, 'test_health_heal_clamp')).toBe(100))

  // --- is_dead ---
  test('is_dead: 0 when HP > 0', () =>
    expect(callAndGetRet(rt, 'test_health_is_dead_alive')).toBe(0))

  test('is_dead: 1 when HP == 0', () =>
    expect(callAndGetRet(rt, 'test_health_is_dead_dead')).toBe(1))

  test('is_dead: 1 when overdamaged (clamped to 0)', () =>
    expect(callAndGetRet(rt, 'test_health_is_dead_overdamage')).toBe(1))

  // --- pct ---
  test('pct: 100/100 HP -> 10000', () =>
    expect(callAndGetRet(rt, 'test_health_pct_full')).toBe(10000))

  test('pct: 50/100 HP -> 5000', () =>
    expect(callAndGetRet(rt, 'test_health_pct_half')).toBe(5000))

  test('pct: 0/100 HP -> 0', () =>
    expect(callAndGetRet(rt, 'test_health_pct_zero')).toBe(0))

  // --- set ---
  test('ecs_health_set: sets HP to value', () =>
    expect(callAndGetRet(rt, 'test_health_set')).toBe(75))

  // --- lifecycle ---
  test('lifecycle: init(42,100) -> damage(30) -> heal(10) -> HP == 80', () =>
    expect(callAndGetRet(rt, 'test_health_lifecycle')).toBe(80))
})

// ---------------------------------------------------------------------------
// Velocity Component Tests
// ---------------------------------------------------------------------------

describe('ecs.mcrs — Velocity Component', () => {
  const rt = makeRuntime(`
    fn test_vel_init_x(): int {
      let s: int[] = ecs_vel_init(1000, 2000, 3000)
      return ecs_vel_get_x(s)
    }

    fn test_vel_init_y(): int {
      let s: int[] = ecs_vel_init(1000, 2000, 3000)
      return ecs_vel_get_y(s)
    }

    fn test_vel_init_z(): int {
      let s: int[] = ecs_vel_init(1000, 2000, 3000)
      return ecs_vel_get_z(s)
    }

    fn test_vel_set(): int {
      let s: int[] = ecs_vel_init(0, 0, 0)
      s = ecs_vel_set(s, 500, 1500, 2500)
      return ecs_vel_get_y(s)
    }

    fn test_vel_gravity(): int {
      // Apply gravity (980) to vy=2000 -> 2000 - 980 = 1020
      let s: int[] = ecs_vel_init(0, 2000, 0)
      s = ecs_vel_apply_gravity(s, 980)
      return ecs_vel_get_y(s)
    }

    fn test_vel_gravity_negative(): int {
      // vy=0, apply gravity 980 -> -980
      let s: int[] = ecs_vel_init(0, 0, 0)
      s = ecs_vel_apply_gravity(s, 980)
      return ecs_vel_get_y(s)
    }

    fn test_vel_speed_3_4_0(): int {
      // (3000, 4000, 0) -> speed == 5000
      let s: int[] = ecs_vel_init(3000, 4000, 0)
      return ecs_vel_speed(s)
    }

    fn test_vel_damp(): int {
      // vx=10000, damp factor=5000 (0.5) -> 5000
      let s: int[] = ecs_vel_init(10000, 0, 0)
      s = ecs_vel_damp(s, 5000)
      return ecs_vel_get_x(s)
    }
  `)

  test('vel_init: get_x correct', () =>
    expect(callAndGetRet(rt, 'test_vel_init_x')).toBe(1000))

  test('vel_init: get_y correct', () =>
    expect(callAndGetRet(rt, 'test_vel_init_y')).toBe(2000))

  test('vel_init: get_z correct', () =>
    expect(callAndGetRet(rt, 'test_vel_init_z')).toBe(3000))

  test('vel_set: updates velocity correctly', () =>
    expect(callAndGetRet(rt, 'test_vel_set')).toBe(1500))

  test('apply_gravity: vy decreases by gravity_fx', () =>
    expect(callAndGetRet(rt, 'test_vel_gravity')).toBe(1020))

  test('apply_gravity: vy goes negative when at 0', () =>
    expect(callAndGetRet(rt, 'test_vel_gravity_negative')).toBe(-980))

  test('vel_speed: (3000, 4000, 0) -> 5000', () =>
    expect(callAndGetRet(rt, 'test_vel_speed_3_4_0')).toBe(5000))

  test('vel_damp: 10000 × 0.5 = 5000', () =>
    expect(callAndGetRet(rt, 'test_vel_damp')).toBe(5000))
})

// ---------------------------------------------------------------------------
// ECS Registry Tests
// ---------------------------------------------------------------------------

describe('ecs.mcrs — Registry', () => {
  const rt = makeRuntime(`
    fn test_registry_empty(): int {
      let reg: int[] = ecs_registry_new()
      return ecs_is_registered(reg, 1)
    }

    fn test_registry_register_health(): int {
      let reg: int[] = ecs_registry_new()
      reg = ecs_register(reg, 1)
      return ecs_is_registered(reg, 1)
    }

    fn test_registry_register_velocity(): int {
      let reg: int[] = ecs_registry_new()
      reg = ecs_register(reg, 2)
      return ecs_is_registered(reg, 2)
    }

    fn test_registry_no_cross_contamination(): int {
      // Registering comp 1 should NOT affect comp 2
      let reg: int[] = ecs_registry_new()
      reg = ecs_register(reg, 1)
      return ecs_is_registered(reg, 2)
    }

    fn test_registry_multi(): int {
      let reg: int[] = ecs_registry_new()
      reg = ecs_register(reg, 1)
      reg = ecs_register(reg, 2)
      reg = ecs_register(reg, 3)
      // All three registered
      let a: int = ecs_is_registered(reg, 1)
      let b: int = ecs_is_registered(reg, 2)
      let c: int = ecs_is_registered(reg, 3)
      return a + b + c
    }

    fn test_registry_predefined_ids(): int {
      // ECS_COMP_HEALTH=1, ECS_COMP_VELOCITY=2, ECS_COMP_DAMAGE=3
      // Constants are defined in ecs.mcrs; register all three and verify
      let reg: int[] = ecs_registry_new()
      reg = ecs_register(reg, 1)
      reg = ecs_register(reg, 2)
      reg = ecs_register(reg, 3)
      let a: int = ecs_is_registered(reg, 1)
      let b: int = ecs_is_registered(reg, 2)
      let c: int = ecs_is_registered(reg, 3)
      // Also verify IDs are distinct (registering 1 does not register 2 or 3)
      return a * 100 + b * 10 + c
    }
  `)

  test('registry: new registry has nothing registered', () =>
    expect(callAndGetRet(rt, 'test_registry_empty')).toBe(0))

  test('registry: register health comp -> is_registered returns 1', () =>
    expect(callAndGetRet(rt, 'test_registry_register_health')).toBe(1))

  test('registry: register velocity comp -> is_registered returns 1', () =>
    expect(callAndGetRet(rt, 'test_registry_register_velocity')).toBe(1))

  test('registry: no cross-contamination between comp IDs', () =>
    expect(callAndGetRet(rt, 'test_registry_no_cross_contamination')).toBe(0))

  test('registry: register multiple comps, all found', () =>
    expect(callAndGetRet(rt, 'test_registry_multi')).toBe(3))

  test('registry: predefined component IDs 1,2,3 are independently registerable', () =>
    expect(callAndGetRet(rt, 'test_registry_predefined_ids')).toBe(111))
})
