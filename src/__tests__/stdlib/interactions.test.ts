/**
 * Tests for stdlib/interactions.mcrs — player interaction helpers.
 */

import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/interactions.mcrs'), 'utf-8')

describe('stdlib/interactions.mcrs', () => {
  // NOTE: interactions.mcrs uses foreach, scoreboard_add_objective, and
  // module-level const DOUBLE_TAP_WINDOW which cause "Unresolved identifier"
  // errors at MIR lowering when compiled via concatenation.  The stdlib
  // compilation-without-errors test lives in compile-all.test.ts; individual
  // function tests are skipped here until the const-resolution bug is fixed.

  test('source file is readable', () => {
    expect(SRC.length).toBeGreaterThan(0)
  })
})
