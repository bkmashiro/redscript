/**
 * Tests for FnContext.getStmtLoc — the helper extracted from the duplicate
 * source-location pattern in foreach/execute lowering.
 *
 * Verifies that helper functions created during foreach and execute lowering
 * carry a sourceLoc when a sourceFile is supplied, and that the field is
 * absent when no sourceFile is available.
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule, MIRFunction } from '../../mir/types'

function compileMIR(source: string, sourceFile?: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir, sourceFile)
}

function getHelperFn(mod: MIRModule, snippet: string): MIRFunction | undefined {
  return mod.functions.find(f => f.sourceSnippet === snippet)
}

// ── execute helper sourceLoc ───────────────────────────────────────────────

describe('getStmtLoc — execute helper', () => {
  test('sourceLoc is set when sourceFile is provided', () => {
    const mod = compileMIR(
      `fn f(): int {
        execute as @a run {
          raw("say hi");
        }
        return 0;
      }`,
      'src/test.mcrs',
    )
    expect(verifyMIR(mod)).toEqual([])
    const helper = getHelperFn(mod, 'execute helper')
    expect(helper).toBeDefined()
    expect(helper!.sourceLoc).toBeDefined()
    expect(helper!.sourceLoc!.file).toBe('src/test.mcrs')
    expect(typeof helper!.sourceLoc!.line).toBe('number')
    expect(typeof helper!.sourceLoc!.col).toBe('number')
  })

  test('sourceLoc is undefined when no sourceFile is provided', () => {
    const mod = compileMIR(
      `fn f(): int {
        execute as @a run {
          raw("say hi");
        }
        return 0;
      }`,
    )
    expect(verifyMIR(mod)).toEqual([])
    const helper = getHelperFn(mod, 'execute helper')
    expect(helper).toBeDefined()
    expect(helper!.sourceLoc).toBeUndefined()
  })
})

// ── foreach helper sourceLoc ───────────────────────────────────────────────

describe('getStmtLoc — foreach helper', () => {
  test('sourceLoc is set when sourceFile is provided', () => {
    const mod = compileMIR(
      `fn f(): int {
        foreach (p in @a) {
          raw("say hi");
        }
        return 0;
      }`,
      'src/test.mcrs',
    )
    expect(verifyMIR(mod)).toEqual([])
    const helper = getHelperFn(mod, 'foreach helper')
    expect(helper).toBeDefined()
    expect(helper!.sourceLoc).toBeDefined()
    expect(helper!.sourceLoc!.file).toBe('src/test.mcrs')
    expect(typeof helper!.sourceLoc!.line).toBe('number')
    expect(typeof helper!.sourceLoc!.col).toBe('number')
  })

  test('sourceLoc is undefined when no sourceFile is provided', () => {
    const mod = compileMIR(
      `fn f(): int {
        foreach (p in @a) {
          raw("say hi");
        }
        return 0;
      }`,
    )
    expect(verifyMIR(mod)).toEqual([])
    const helper = getHelperFn(mod, 'foreach helper')
    expect(helper).toBeDefined()
    expect(helper!.sourceLoc).toBeUndefined()
  })
})

// ── both helpers in same function ─────────────────────────────────────────

describe('getStmtLoc — multiple helpers in one function', () => {
  test('each helper gets its own sourceLoc', () => {
    const mod = compileMIR(
      `fn f(): int {
        execute as @a run {
          raw("say exec");
        }
        foreach (p in @a) {
          raw("say foreach");
        }
        return 0;
      }`,
      'src/multi.mcrs',
    )
    expect(verifyMIR(mod)).toEqual([])

    const execHelper = getHelperFn(mod, 'execute helper')
    const foreachHelper = getHelperFn(mod, 'foreach helper')

    expect(execHelper?.sourceLoc?.file).toBe('src/multi.mcrs')
    expect(foreachHelper?.sourceLoc?.file).toBe('src/multi.mcrs')
    // They should record different line numbers
    expect(execHelper!.sourceLoc!.line).not.toBe(foreachHelper!.sourceLoc!.line)
  })
})
