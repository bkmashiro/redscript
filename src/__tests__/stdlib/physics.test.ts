/**
 * Tests for stdlib/physics.mcrs — physics simulation helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/physics.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/physics.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('gravity_fx is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return gravity_fx(); }`)
    expect(r.files.some(f => f.path.includes('gravity_fx'))).toBe(true)
  })

  test('projectile_y is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return projectile_y(0, 200, 5); }`)
    expect(r.files.some(f => f.path.includes('projectile_y'))).toBe(true)
  })

  test('projectile_x is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return projectile_x(0, 100, 10); }`)
    expect(r.files.some(f => f.path.includes('projectile_x'))).toBe(true)
  })

  test('projectile_vy is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return projectile_vy(200, 10); }`)
    expect(r.files.some(f => f.path.includes('projectile_vy'))).toBe(true)
  })

  test('projectile_land_t is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return projectile_land_t(200); }`)
    expect(r.files.some(f => f.path.includes('projectile_land_t'))).toBe(true)
  })

  test('projectile_max_height is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return projectile_max_height(200); }`)
    expect(r.files.some(f => f.path.includes('projectile_max_height'))).toBe(true)
  })
})
