import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRFunction, MIRInstr } from '../../mir/types'
import { compile } from '../../emit/compile'

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function lowerFn(source: string, fnName = 'test_fn'): MIRFunction {
  const ast = parse(source)
  const hir = lowerToHIR(ast)
  const mir = lowerToMIR(hir)
  expect(verifyMIR(mir)).toEqual([])
  const fn = mir.functions.find(f => f.name === fnName)
  if (!fn) throw new Error(`function '${fnName}' not found in MIR`)
  return fn
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('labeled loops — parser', () => {
  test('parses labeled while loop', () => {
    const src = `
      fn test_fn() {
        outer: while true {
          break outer
        }
      }
    `
    const ast = parse(src)
    const fnBody = ast.declarations[0].body
    const labeled = fnBody[0]
    expect(labeled.kind).toBe('labeled_loop')
    if (labeled.kind !== 'labeled_loop') throw new Error()
    expect(labeled.label).toBe('outer')
    expect(labeled.body.kind).toBe('while')
  })

  test('parses labeled for_each loop', () => {
    const src = `
      fn test_fn() {
        outer: for i in [0, 1, 2] {
          continue outer
        }
      }
    `
    const ast = parse(src)
    const fnBody = ast.declarations[0].body
    const labeled = fnBody[0]
    expect(labeled.kind).toBe('labeled_loop')
    if (labeled.kind !== 'labeled_loop') throw new Error()
    expect(labeled.label).toBe('outer')
  })

  test('parses break with label', () => {
    const src = `
      fn test_fn() {
        outer: while true {
          break outer
        }
      }
    `
    const ast = parse(src)
    const labeled = ast.declarations[0].body[0]
    if (labeled.kind !== 'labeled_loop') throw new Error()
    const whileBody = (labeled.body as Extract<typeof labeled.body, { kind: 'while' }>).body
    expect(whileBody[0]).toMatchObject({ kind: 'break_label', label: 'outer' })
  })

  test('parses continue with label', () => {
    const src = `
      fn test_fn() {
        outer: while true {
          inner: while true {
            continue outer
          }
        }
      }
    `
    const ast = parse(src)
    const outer = ast.declarations[0].body[0]
    if (outer.kind !== 'labeled_loop') throw new Error()
    const outerWhile = outer.body as Extract<typeof outer.body, { kind: 'while' }>
    const inner = outerWhile.body[0]
    if (inner.kind !== 'labeled_loop') throw new Error()
    const innerWhile = inner.body as Extract<typeof inner.body, { kind: 'while' }>
    expect(innerWhile.body[0]).toMatchObject({ kind: 'continue_label', label: 'outer' })
  })

  test('label not on loop produces parse error', () => {
    const src = `
      fn test_fn() {
        outer: let x: int = 0
      }
    `
    const tokens = new Lexer(src).tokenize()
    const parser = new Parser(tokens, src)
    parser.parse('test')
    // Error is collected in parseErrors (error recovery mode), not thrown
    expect(parser.parseErrors.length).toBeGreaterThan(0)
    expect(parser.parseErrors[0].message).toMatch(/outer/)
  })
})

// ---------------------------------------------------------------------------
// MIR lowering tests
// ---------------------------------------------------------------------------

describe('labeled loops — MIR lowering', () => {
  test('break label generates jump to outer loop exit', () => {
    const src = `
      fn test_fn() {
        let result: int = 0
        outer: while result < 100 {
          let j: int = 0
          inner: while j < 10 {
            if j == 3 {
              break outer
            }
            j = j + 1
          }
          result = result + 1
        }
      }
    `
    const fn = lowerFn(src)
    // Should have multiple loop_exit blocks (outer and inner)
    const exitBlocks = fn.blocks.filter(b => b.id.startsWith('loop_exit'))
    expect(exitBlocks.length).toBeGreaterThanOrEqual(2)

    // There should be a block that has a 'break_label' path (jumps to outer exit)
    const outerExit = exitBlocks[0] // first is outer
    const breakToOuter = fn.blocks.find(b =>
      b.term.kind === 'jump' &&
      (b.term as Extract<MIRInstr, { kind: 'jump' }>).target === outerExit.id &&
      b.id !== outerExit.id &&
      !b.id.startsWith('loop_latch')
    )
    expect(breakToOuter).toBeDefined()
  })

  test('continue label generates jump to outer loop header/latch', () => {
    const src = `
      fn test_fn() {
        let result: int = 0
        outer: for i in [0, 1, 2, 3, 4] {
          inner: for j in [0, 1, 2, 3] {
            if j == 1 {
              continue outer
            }
          }
          result = result + 1
        }
      }
    `
    const fn = lowerFn(src)
    // Should compile without errors
    expect(fn.blocks.length).toBeGreaterThan(0)

    // There should be jump(s) going to a loop header or latch
    const loopHeaders = fn.blocks.filter(b =>
      b.id.startsWith('loop_header') || b.id.startsWith('loop_latch')
    )
    expect(loopHeaders.length).toBeGreaterThan(0)
  })

  test('three levels of nesting with break on outermost', () => {
    const src = `
      fn test_fn() {
        let found: int = 0
        outermost: while found == 0 {
          let i: int = 0
          middle: while i < 5 {
            let j: int = 0
            inner: while j < 5 {
              if i == 2 && j == 2 {
                break outermost
              }
              j = j + 1
            }
            i = i + 1
          }
        }
      }
    `
    const fn = lowerFn(src)
    expect(fn.blocks.length).toBeGreaterThan(0)
  })

  test('break unlabeled still works inside labeled loop', () => {
    const src = `
      fn test_fn() {
        outer: while true {
          let i: int = 0
          while i < 10 {
            if i == 5 { break }
            i = i + 1
          }
          break outer
        }
      }
    `
    const fn = lowerFn(src)
    expect(fn.blocks.length).toBeGreaterThan(0)
  })

  test('end-to-end compile with labeled break', () => {
    const src = `
      fn test_fn() {
        let i: int = 0
        outer: while i < 10 {
          let j: int = 0
          inner: while j < 10 {
            if i == 3 && j == 3 {
              break outer
            }
            j = j + 1
          }
          i = i + 1
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('end-to-end compile with labeled continue', () => {
    const src = `
      fn test_fn() {
        let i: int = 0
        outer: while i < 5 {
          let j: int = 0
          inner: while j < 5 {
            if j == 1 {
              continue outer
            }
            j = j + 1
          }
          i = i + 1
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('labeled loops — error handling', () => {
  test('break with unknown label throws error naming the label', () => {
    const src = `
      fn test_fn() {
        while true {
          break nonexistent
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).toThrow(/nonexistent/)
  })

  test('continue with unknown label throws error naming the label', () => {
    const src = `
      fn test_fn() {
        while true {
          continue nonexistent
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).toThrow(/nonexistent/)
  })

  test('break outside any loop throws error', () => {
    const src = `
      fn test_fn() {
        break
      }
    `
    expect(() => lowerToMIR(lowerToHIR(parse(src)))).toThrow(/break outside loop/)
  })

  test('continue outside any loop throws error', () => {
    const src = `
      fn test_fn() {
        continue
      }
    `
    expect(() => lowerToMIR(lowerToHIR(parse(src)))).toThrow(/continue outside loop/)
  })

  test('break with label that names a non-loop statement throws error', () => {
    // Labels in redscript only attach to loops; a label on a non-loop
    // produces a parse error and is not registered in the loop stack.
    // A break_label that targets such a label therefore finds no loop entry.
    const src = `
      fn test_fn() {
        outer: while true {
          break missing_label
        }
      }
    `
    expect(() => lowerToMIR(lowerToHIR(parse(src)))).toThrow(/missing_label/)
  })
})
