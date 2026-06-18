/**
 * Tests for stdlib/interactions.mcrs — player interaction helpers.
 */

import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/interactions.mcrs'), 'utf-8')

describe('stdlib/interactions.mcrs', () => {
  test('source file is readable', () => {
    expect(SRC.length).toBeGreaterThan(0)
  })
})
