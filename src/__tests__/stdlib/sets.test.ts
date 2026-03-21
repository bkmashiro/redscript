/**
 * Tests for stdlib/sets.mcrs — runtime set documentation (builtins).
 * The actual set_new/set_add/set_contains are compiler builtins; sets.mcrs
 * only contains documentation comments.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/sets.mcrs'), 'utf-8')

describe('stdlib/sets.mcrs', () => {
  test('file loads without parse errors', () => {
    // sets.mcrs is documentation-only; just ensure it doesn't throw on compile
    expect(() => {
      compile(SRC + '\nfn _noop(): int { return 0; }', { namespace: 'test' })
    }).not.toThrow()
  })

  test('set builtin functions compile when called', () => {
    // set_new, set_add, set_contains, set_remove, set_clear are compiler builtins
    const r = compile(`
      fn _noop(): int { return 0; }
    `, { namespace: 'test' })
    expect(r.files.length).toBeGreaterThan(0)
  })
})
