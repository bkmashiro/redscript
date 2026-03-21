/**
 * Tests for stdlib/expr.mcrs — RPN expression evaluator.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/math.mcrs'), 'utf-8')
const EXPR_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/expr.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [MATH_SRC, EXPR_SRC] })
}

describe('stdlib/expr.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('fn _noop(): int { return 0; }')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('expr_eval is emitted', () => {
    // RPN for constant 42 (×10000 = 420000)
    const r = compileWith(`@keep fn t(): int {
      let tokens: int[] = [420000];
      return expr_eval(tokens, 1, 0);
    }`)
    expect(r.files.some(f => f.path.includes('expr_eval'))).toBe(true)
  })

  test('expr_eval with ADD op is emitted', () => {
    // RPN: 10000 + 20000 = 30000  (i.e. 1.0 + 2.0 = 3.0)
    const r = compileWith(`@keep fn t(): int {
      let tokens: int[] = [10000, 20000, -1];
      return expr_eval(tokens, 3, 0);
    }`)
    expect(r.files.some(f => f.path.includes('expr_eval'))).toBe(true)
  })

  test('expr_eval with variable substitution is emitted', () => {
    // RPN: x + 10000 where x = 20000
    const r = compileWith(`@keep fn t(): int {
      let tokens: int[] = [-10000, 10000, -1];
      return expr_eval(tokens, 3, 20000);
    }`)
    expect(r.files.some(f => f.path.includes('expr_eval'))).toBe(true)
  })
})
