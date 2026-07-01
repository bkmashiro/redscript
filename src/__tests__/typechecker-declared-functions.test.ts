import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { TypeChecker } from '../typechecker'
import { DiagnosticError } from '../diagnostics'
import type { FnDecl, Program, TypeNode } from '../ast/types'

function typeCheck(source: string): DiagnosticError[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const checker = new TypeChecker(source)
  return checker.check(ast)
}

function checkProgram(program: Program): DiagnosticError[] {
  const checker = new TypeChecker('')
  return checker.check(program)
}

const intType: TypeNode = { kind: 'named', name: 'int' }
describe('TypeChecker declared function signatures', () => {
  it('uses declare fn signatures for call checking and return type inference', () => {
    const errors = typeCheck(`
declare fn ext(x: int): int;
fn main(): int { return ext(1); }
`)
    expect(errors).toHaveLength(0)
  })

  it('rejects wrong argument count for declared calls', () => {
    const errors = typeCheck(`
declare fn ext(x: int, y: int): int;
fn main(): int { return ext(1); }
`)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain("Function 'ext' expects 2 arguments, got 1")
  })

  it('rejects wrong argument types for declared calls', () => {
    const errors = typeCheck(`
declare fn ext(x: int): int;
fn main(): int { return ext("bad"); }
`)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain("Argument 1 of 'ext' expects int, got string")
  })

  it('rejects return type mismatches when using declared return types', () => {
    const errors = typeCheck(`
declare fn ext(x: int): int;
fn main(): string { return ext(1); }
`)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('Return type mismatch: expected string, got int')
  })

  it('does not check executable bodies for declaration-only functions', () => {
    const badDeclared: FnDecl = {
      name: 'ext',
      params: [{ name: 'x', type: intType }],
      returnType: intType,
      decorators: [],
      body: [{ kind: 'return', value: { kind: 'str_lit', value: 'invalid-body-result' } }],
      isDeclareOnly: true,
    }

    const program: Program = {
      namespace: 'test',
      globals: [],
      declarations: [{
        name: 'main',
        params: [],
        returnType: intType,
        decorators: [],
        body: [{ kind: 'return', value: { kind: 'call', fn: 'ext', args: [{ kind: 'int_lit', value: 1 }] } }],
      }],
      declaredFunctions: [badDeclared],
      structs: [],
      implBlocks: [],
      enums: [],
      consts: [],
      imports: [],
      interfaces: [],
    }

    const errors = checkProgram(program)
    expect(errors).toHaveLength(0)
  })

  it('prefers executable function signature when a declared stub collides by name', () => {
    const errors = typeCheck(`
fn ext(x: string): int { return 1; }
declare fn ext(x: int): int;
fn main(): int { return ext("ok"); }
`)
    // Existing-consistent policy: executable function should win over declare-only stub.
    expect(errors).toHaveLength(0)
  })

  it('reports resource typed declared function arguments by registry', () => {
    const errors = typeCheck(`
declare fn use_fx(id: resource<particle>): void;
fn main(): void { use_fx(1); }
`)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain("Argument 1 of 'use_fx' expects resource<particle>, got int")
  })
})
