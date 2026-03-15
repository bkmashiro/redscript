import { Lexer } from '../../../src/lexer'
import { Parser } from '../../../src/parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule, MIRBlock, MIRInstr } from '../../mir/types'

function compile(source: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

function getEntryInstrs(mod: MIRModule): MIRInstr[] {
  const fn = mod.functions[0]
  const entry = fn.blocks.find(b => b.id === fn.entry)!
  return entry.instrs
}

describe('MIR lowering — integer arithmetic', () => {
  test('simple addition: let x = a + b', () => {
    const mod = compile('fn f(a: int, b: int): int { return a + b; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    // Should have an add instruction
    const addInstr = instrs.find(i => i.kind === 'add')
    expect(addInstr).toBeDefined()
    expect(addInstr!.kind).toBe('add')
  })

  test('chained arithmetic: a + b * c', () => {
    const mod = compile('fn f(a: int, b: int, c: int): int { return a + b * c; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    // Should have both mul and add
    const kinds = instrs.map(i => i.kind)
    expect(kinds).toContain('mul')
    expect(kinds).toContain('add')

    // mul should come before add (b*c computed first)
    const mulIdx = kinds.indexOf('mul')
    const addIdx = kinds.indexOf('add')
    expect(mulIdx).toBeLessThan(addIdx)
  })

  test('subtraction and division', () => {
    const mod = compile('fn f(a: int, b: int): int { return (a - b) / b; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    const kinds = instrs.map(i => i.kind)
    expect(kinds).toContain('sub')
    expect(kinds).toContain('div')
  })

  test('modulo', () => {
    const mod = compile('fn f(a: int, b: int): int { return a % b; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    expect(instrs.some(i => i.kind === 'mod')).toBe(true)
  })

  test('negation', () => {
    const mod = compile('fn f(a: int): int { return -a; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    expect(instrs.some(i => i.kind === 'neg')).toBe(true)
  })

  test('not operator', () => {
    const mod = compile('fn f(a: bool): bool { return !a; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    expect(instrs.some(i => i.kind === 'not')).toBe(true)
  })

  test('comparison operators produce cmp instructions', () => {
    const mod = compile('fn f(a: int, b: int): bool { return a < b; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    const cmpInstr = instrs.find(i => i.kind === 'cmp')
    expect(cmpInstr).toBeDefined()
    expect((cmpInstr as any).op).toBe('lt')
  })

  test('let binding produces copy instruction', () => {
    const mod = compile('fn f(a: int): int { let x: int = a; return x; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    expect(instrs.some(i => i.kind === 'copy')).toBe(true)
  })

  test('constant literal produces const instruction', () => {
    const mod = compile('fn f(): int { return 42; }')
    expect(verifyMIR(mod)).toEqual([])

    // The return terminator should have the const value
    const fn = mod.functions[0]
    const entry = fn.blocks.find(b => b.id === fn.entry)!
    expect(entry.term.kind).toBe('return')
    const ret = entry.term as Extract<MIRInstr, { kind: 'return' }>
    expect(ret.value).toEqual({ kind: 'const', value: 42 })
  })

  test('function call produces call instruction', () => {
    const mod = compile('fn add(a: int, b: int): int { return a + b; } fn f(): int { return add(1, 2); }')
    expect(verifyMIR(mod)).toEqual([])

    // f is the second function
    const fn = mod.functions[1]
    const entry = fn.blocks.find(b => b.id === fn.entry)!
    const callInstr = entry.instrs.find(i => i.kind === 'call')
    expect(callInstr).toBeDefined()
    expect((callInstr as any).fn).toBe('add')
    expect((callInstr as any).args).toHaveLength(2)
  })

  test('3-address form: each instruction has fresh dst', () => {
    const mod = compile('fn f(a: int, b: int, c: int): int { return a + b + c; }')
    expect(verifyMIR(mod)).toEqual([])

    const instrs = getEntryInstrs(mod)
    const dsts = instrs.filter(i => 'dst' in i).map(i => (i as any).dst)
    // All destination temps should be unique
    expect(new Set(dsts).size).toBe(dsts.length)
  })
})

describe('MIR lowering — module structure', () => {
  test('namespace and objective set correctly', () => {
    const mod = compile('fn f(): void {}')
    expect(mod.namespace).toBe('test')
    expect(mod.objective).toBe('__test')
  })

  test('multiple functions', () => {
    const mod = compile('fn a(): void {} fn b(): void {} fn c(): void {}')
    expect(mod.functions).toHaveLength(3)
    expect(mod.functions.map(f => f.name)).toEqual(['a', 'b', 'c'])
  })

  test('function params are mapped to temps', () => {
    const mod = compile('fn f(x: int, y: int): int { return x + y; }')
    expect(mod.functions[0].params).toHaveLength(2)
    expect(mod.functions[0].params[0].name).toMatch(/^t\d+$/)
    expect(mod.functions[0].params[1].name).toMatch(/^t\d+$/)
  })
})
