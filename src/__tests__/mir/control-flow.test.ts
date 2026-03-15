import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule, MIRBlock, MIRInstr, MIRFunction } from '../../mir/types'

function compile(source: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

function getFn(mod: MIRModule, name?: string): MIRFunction {
  if (name) return mod.functions.find(f => f.name === name)!
  return mod.functions[0]
}

function getBlock(fn: MIRFunction, id: string): MIRBlock | undefined {
  return fn.blocks.find(b => b.id === id)
}

describe('MIR lowering — if/else → branch CFG', () => {
  test('if without else creates branch to then + merge', () => {
    const mod = compile('fn f(x: int): int { if (x > 0) { return x; } return 0; }')
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    // Entry block should end with a branch
    const entry = getBlock(fn, fn.entry)!
    expect(entry.term.kind).toBe('branch')

    const branch = entry.term as Extract<MIRInstr, { kind: 'branch' }>
    // Both targets should exist
    expect(fn.blocks.some(b => b.id === branch.then)).toBe(true)
    expect(fn.blocks.some(b => b.id === branch.else)).toBe(true)
  })

  test('if/else creates branch to then + else + merge', () => {
    const mod = compile(`
      fn f(x: int): int {
        if (x > 0) { return 1; }
        else { return -1; }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    const entry = getBlock(fn, fn.entry)!
    expect(entry.term.kind).toBe('branch')

    const branch = entry.term as Extract<MIRInstr, { kind: 'branch' }>
    const thenBlock = getBlock(fn, branch.then)!
    const elseBlock = getBlock(fn, branch.else)!

    // Both branches should have return terminators
    expect(thenBlock.term.kind).toBe('return')
    expect(elseBlock.term.kind).toBe('return')
  })

  test('nested if/else produces correct block structure', () => {
    const mod = compile(`
      fn f(x: int): int {
        if (x > 0) {
          if (x > 10) { return 2; }
          return 1;
        }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    // Should have multiple blocks due to nesting
    expect(fn.blocks.length).toBeGreaterThanOrEqual(4)
  })
})

describe('MIR lowering — while → loop CFG', () => {
  test('while loop creates header + body + exit blocks', () => {
    const mod = compile(`
      fn f(x: int): int {
        let sum: int = 0;
        while (x > 0) {
          sum = sum + x;
          x = x - 1;
        }
        return sum;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    // Find loop header block (has branch terminator based on condition)
    const headerBlock = fn.blocks.find(b =>
      b.id.startsWith('loop_header') && b.term.kind === 'branch'
    )
    expect(headerBlock).toBeDefined()

    // Find loop body block
    const bodyBlock = fn.blocks.find(b => b.id.startsWith('loop_body'))
    expect(bodyBlock).toBeDefined()

    // Find loop exit block
    const exitBlock = fn.blocks.find(b => b.id.startsWith('loop_exit'))
    expect(exitBlock).toBeDefined()

    // Header should branch to body (then) and exit (else)
    const branch = headerBlock!.term as Extract<MIRInstr, { kind: 'branch' }>
    expect(branch.then).toBe(bodyBlock!.id)
    expect(branch.else).toBe(exitBlock!.id)
  })

  test('break jumps to loop exit', () => {
    const mod = compile(`
      fn f(x: int): void {
        while (x > 0) {
          if (x == 5) { break; }
          x = x - 1;
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    const exitBlock = fn.blocks.find(b => b.id.startsWith('loop_exit'))
    expect(exitBlock).toBeDefined()

    // Some block should jump directly to the exit (the break)
    const breakBlock = fn.blocks.find(b =>
      b.term.kind === 'jump' && (b.term as any).target === exitBlock!.id
      && !b.id.startsWith('loop_header') && !b.id.startsWith('loop_exit')
      && !b.id.startsWith('entry')
    )
    expect(breakBlock).toBeDefined()
  })

  test('continue jumps to loop header', () => {
    const mod = compile(`
      fn f(x: int): void {
        while (x > 0) {
          x = x - 1;
          if (x == 3) { continue; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    const headerBlock = fn.blocks.find(b => b.id.startsWith('loop_header'))
    expect(headerBlock).toBeDefined()

    // Some block should jump to header (the continue)
    const continueBlock = fn.blocks.find(b =>
      b.term.kind === 'jump' && (b.term as any).target === headerBlock!.id
      && !b.id.startsWith('loop_body') && !b.id.startsWith('entry')
    )
    expect(continueBlock).toBeDefined()
  })
})

describe('MIR lowering — short-circuit operators', () => {
  test('&& produces branch (short-circuit)', () => {
    const mod = compile('fn f(a: bool, b: bool): bool { return a && b; }')
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    // Should have and_right, and_false, and_merge blocks
    expect(fn.blocks.some(b => b.id.startsWith('and_right'))).toBe(true)
    expect(fn.blocks.some(b => b.id.startsWith('and_false'))).toBe(true)
    expect(fn.blocks.some(b => b.id.startsWith('and_merge'))).toBe(true)
  })

  test('|| produces branch (short-circuit)', () => {
    const mod = compile('fn f(a: bool, b: bool): bool { return a || b; }')
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    expect(fn.blocks.some(b => b.id.startsWith('or_true'))).toBe(true)
    expect(fn.blocks.some(b => b.id.startsWith('or_right'))).toBe(true)
    expect(fn.blocks.some(b => b.id.startsWith('or_merge'))).toBe(true)
  })
})

describe('MIR lowering — return', () => {
  test('void return', () => {
    const mod = compile('fn f(): void { return; }')
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    const entry = getBlock(fn, fn.entry)!
    expect(entry.term.kind).toBe('return')
    expect((entry.term as any).value).toBeNull()
  })

  test('value return', () => {
    const mod = compile('fn f(): int { return 42; }')
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    const entry = getBlock(fn, fn.entry)!
    expect(entry.term.kind).toBe('return')
    expect((entry.term as any).value).toEqual({ kind: 'const', value: 42 })
  })

  test('early return creates dead block for subsequent code', () => {
    const mod = compile(`
      fn f(x: int): int {
        return x;
        let y: int = 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod)
    const entry = getBlock(fn, fn.entry)!
    expect(entry.term.kind).toBe('return')
  })
})

describe('MIR lowering — all blocks reachable and well-formed', () => {
  test('complex function verifies clean', () => {
    const mod = compile(`
      fn f(n: int): int {
        let sum: int = 0;
        let i: int = 0;
        while (i < n) {
          if (i % 2 == 0) {
            sum = sum + i;
          } else {
            sum = sum - i;
          }
          i = i + 1;
        }
        return sum;
      }
    `)
    const errors = verifyMIR(mod)
    expect(errors).toEqual([])
  })
})
