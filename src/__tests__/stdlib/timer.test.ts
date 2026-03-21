/**
 * Tests for stdlib/timer.mcrs — Timer struct and tick conversion utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/timer.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/timer.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('tick_to_seconds is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return tick_to_seconds(200); }`)
    expect(r.files.some(f => f.path.includes('tick_to_seconds'))).toBe(true)
  })

  test('tick_to_ms is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return tick_to_ms(20); }`)
    expect(r.files.some(f => f.path.includes('tick_to_ms'))).toBe(true)
  })

  test('seconds_to_ticks is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return seconds_to_ticks(5); }`)
    expect(r.files.some(f => f.path.includes('seconds_to_ticks'))).toBe(true)
  })

  test('format_time_s is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return format_time_s(200); }`)
    expect(r.files.some(f => f.path.includes('format_time_s'))).toBe(true)
  })

  test('format_time_m is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return format_time_m(1200); }`)
    expect(r.files.some(f => f.path.includes('format_time_m'))).toBe(true)
  })

  test('Timer struct compiles', () => {
    const r = compileWith(`@keep fn t() {
      let tmr: Timer = Timer::new(100);
      tmr.start();
    }`)
    expect(r.files.length).toBeGreaterThan(0)
  })
})
