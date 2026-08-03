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

  test('tracks reconnects and does not emit the removed generic ItemUse detector', () => {
    const r = compile(SRC + '\nfn _noop(): int { return 0; }', { namespace: 'test' })
    const output = r.files.map(file => file.content).join('\n')
    expect(output).toContain('minecraft.custom:minecraft.leave_game')
    expect(output).toContain('scores={rs.left=1..}')
    expect(output).toContain('execute unless score #last rs.events = #now rs.events')
    expect(output).toContain('scoreboard players operation #last rs.events = #now rs.events')
    expect(output).not.toContain('rs.item_use')
    expect(output).not.toContain('on_item_use')
  })
})
