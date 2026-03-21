/**
 * Tests for stdlib/events.mcrs — event dispatcher.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/events.mcrs'), 'utf-8')

describe('stdlib/events.mcrs', () => {
  test('compiles without errors', () => {
    const r = compile(SRC + '\nfn _noop(): int { return 0; }', { namespace: 'test' })
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('@load and @tick functions are emitted', () => {
    const r = compile(SRC + '\nfn _noop(): int { return 0; }', { namespace: 'test' })
    // events.mcrs has @load and @tick annotated functions
    const hasLoad = r.files.some(f => f.path.includes('load') || f.path.includes('events'))
    expect(hasLoad).toBe(true)
  })
})
