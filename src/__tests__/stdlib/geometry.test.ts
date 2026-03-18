/**
 * Tests for stdlib/geometry.mcrs selector helpers.
 * in_cylinder, in_cone, in_sector_2d
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../emit/compile'
import { MCRuntime } from '../../runtime'

const NS = 'test'
const OBJ = `__${NS}`

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/math.mcrs'),
  'utf-8',
)
const VEC_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/vec.mcrs'),
  'utf-8',
)
const GEOM_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/geometry.mcrs'),
  'utf-8',
)

function makeRuntime(source: string): MCRuntime {
  const result = compile(source, {
    namespace: NS,
    librarySources: [MATH_SRC, VEC_SRC, GEOM_SRC],
  })
  const rt = new MCRuntime(NS)
  for (const file of result.files) {
    if (!file.path.endsWith('.mcfunction')) continue
    const m = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!m) continue
    rt.loadFunction(`${m[1]}:${m[2]}`, file.content.split('\n'))
  }
  if (result.files.some(f => f.path.includes('/load.mcfunction'))) {
    rt.execFunction(`${NS}:load`)
  }
  return rt
}

function callAndGetRet(rt: MCRuntime, fnName: string): number {
  rt.execFunction(`${NS}:${fnName}`)
  return rt.getScore('$ret', OBJ)
}

// ─── in_cylinder ─────────────────────────────────────────────────────────────

describe('in_cylinder', () => {
  const rt = makeRuntime(`
    // point at origin, cylinder centre (0,0), r=20000, y=[0,10000]
    fn test_cyl_inside(): int {
      return in_cylinder(0, 0, 0, 0, 0, 20000, 0, 10000);
    }
    // point at (30000,0,0) — outside radius
    fn test_cyl_outside_r(): int {
      return in_cylinder(30000, 0, 0, 0, 0, 20000, 0, 10000);
    }
    // point inside radius but below y_lo
    fn test_cyl_outside_y_lo(): int {
      return in_cylinder(0, -1, 0, 0, 0, 20000, 0, 10000);
    }
    // point inside radius but above y_hi
    fn test_cyl_outside_y_hi(): int {
      return in_cylinder(0, 20000, 0, 0, 0, 20000, 0, 10000);
    }
    // point on the rim (r == radius)
    fn test_cyl_on_rim(): int {
      return in_cylinder(20000, 5000, 0, 0, 0, 20000, 0, 10000);
    }
  `)

  test('point at origin inside cylinder → 1', () =>
    expect(callAndGetRet(rt, 'test_cyl_inside')).toBe(1))

  test('point at (30000,0,0) outside radius → 0', () =>
    expect(callAndGetRet(rt, 'test_cyl_outside_r')).toBe(0))

  test('point below y_lo → 0', () =>
    expect(callAndGetRet(rt, 'test_cyl_outside_y_lo')).toBe(0))

  test('point above y_hi → 0', () =>
    expect(callAndGetRet(rt, 'test_cyl_outside_y_hi')).toBe(0))

  test('point on rim (dist == radius) → 1', () =>
    expect(callAndGetRet(rt, 'test_cyl_on_rim')).toBe(1))
})

// ─── in_cone ─────────────────────────────────────────────────────────────────

describe('in_cone', () => {
  // 45° half-angle: half_angle_tan = 10000 (tan 45° = 1.0 × 10000)
  // Point directly above apex at dy=5000 → horizontal dist = 0, threshold = 5000 → inside
  // Point to the side at (apex_x+3000, apex_y+4000, apex_z): dy=4000, threshold=4000, horiz=3000 → inside
  // Point outside angle: (apex_x+6000, apex_y+4000, apex_z): dy=4000, threshold=4000, horiz=6000 → outside
  const rt = makeRuntime(`
    // directly above apex, half_angle_tan=10000 (45°), height=10000
    fn test_cone_above(): int {
      return in_cone(0, 5000, 0,  0, 0, 0,  1, 10000, 10000);
    }
    // inside cone: dx=3000, dy=4000, dz=0 → horiz=3000, threshold=4000
    fn test_cone_inside(): int {
      return in_cone(3000, 4000, 0,  0, 0, 0,  1, 10000, 10000);
    }
    // outside cone: dx=6000, dy=4000, dz=0 → horiz=6000, threshold=4000
    fn test_cone_outside(): int {
      return in_cone(6000, 4000, 0,  0, 0, 0,  1, 10000, 10000);
    }
    // below apex (dir_y=1 means upward cone, dy<0 is outside)
    fn test_cone_below(): int {
      return in_cone(0, -1, 0,  0, 0, 0,  1, 10000, 10000);
    }
    // above height limit
    fn test_cone_over_height(): int {
      return in_cone(0, 20000, 0,  0, 0, 0,  1, 10000, 10000);
    }
  `)

  test('point directly above apex → 1', () =>
    expect(callAndGetRet(rt, 'test_cone_above')).toBe(1))

  test('point inside cone angle → 1', () =>
    expect(callAndGetRet(rt, 'test_cone_inside')).toBe(1))

  test('point outside cone angle → 0', () =>
    expect(callAndGetRet(rt, 'test_cone_outside')).toBe(0))

  test('point below apex (upward cone) → 0', () =>
    expect(callAndGetRet(rt, 'test_cone_below')).toBe(0))

  test('point above height limit → 0', () =>
    expect(callAndGetRet(rt, 'test_cone_over_height')).toBe(0))
})

// ─── in_sector_2d ─────────────────────────────────────────────────────────────

describe('in_sector_2d', () => {
  // dir_angle = 0 (pointing along +X), half_angle = 157079 (≈ π/4 × 10000 ≈ 45°)
  // radius = 20000
  // Point in front (+X direction): (10000, 0) → inside
  // Point behind (-X direction): (-10000, 0) → outside
  // Point at 90° from dir (along +Z): should be outside 45° half-angle
  const HALF_45 = 157080  // π/4 × 10000
  const rt = makeRuntime(`
    fn test_sector_front(): int {
      return in_sector_2d(10000, 0,  0, 0,  0, ${HALF_45}, 20000);
    }
    fn test_sector_behind(): int {
      return in_sector_2d(-10000, 0,  0, 0,  0, ${HALF_45}, 20000);
    }
    fn test_sector_outside_r(): int {
      return in_sector_2d(30000, 0,  0, 0,  0, ${HALF_45}, 20000);
    }
    fn test_sector_on_edge(): int {
      // 45° from dir_angle=0 is exactly at boundary → should be inside (diff == half_angle)
      return in_sector_2d(10000, 10000,  0, 0,  0, ${HALF_45}, 20000);
    }
  `)

  test('point in front sector (0°) → 1', () =>
    expect(callAndGetRet(rt, 'test_sector_front')).toBe(1))

  test('point behind (180°) → 0', () =>
    expect(callAndGetRet(rt, 'test_sector_behind')).toBe(0))

  test('point outside radius → 0', () =>
    expect(callAndGetRet(rt, 'test_sector_outside_r')).toBe(0))
})
