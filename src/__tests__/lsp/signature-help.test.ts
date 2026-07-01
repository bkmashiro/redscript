import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { TypeChecker } from '../../typechecker'
import { DiagnosticError } from '../../diagnostics'
import { BUILTIN_METADATA } from '../../builtins/metadata'
import type { Program } from '../../ast/types'
import type { SignatureHelp, SignatureInformation } from 'vscode-languageserver/node'
import { getSignatureHelp } from '../../lsp/signature-help'

function parseSource(source: string): { program: Program | null; errors: DiagnosticError[] } {
  const errors: DiagnosticError[] = []
  let program: Program | null = null

  try {
    const tokens = new Lexer(source).tokenize()
    program = new Parser(tokens, source).parse('test')
  } catch (err) {
    if (err instanceof DiagnosticError) errors.push(err)
    else errors.push(new DiagnosticError('ParseError', (err as Error).message, { line: 1, col: 1 }))
    return { program: null, errors }
  }

  try {
    const checker = new TypeChecker(source)
    errors.push(...checker.check(program))
  } catch {
    // collect errors only
  }

  return { program, errors }
}

function sigAt(source: string, offset: number): SignatureHelp | null {
  const { program } = parseSource(source)
  return getSignatureHelp({
    source,
    program,
    builtins: BUILTIN_METADATA,
    offset,
  })
}

function getSignature(help: SignatureHelp | null, index = 0): { help: SignatureHelp; signature: SignatureInformation } {
  if (!help) {
    throw new Error('Expected signature help result, got null')
  }

  const signature = help.signatures[index]
  if (!signature) {
    throw new Error(`Expected signature at index ${index}`)
  }

  return { help, signature }
}

// ---------------------------------------------------------------------------
// Track E1 — typed-resource builtin signature labels
// ---------------------------------------------------------------------------

describe('LSP signature help — typed-resource builtins', () => {
  it('shows particle signature with resource<particle> name parameter', () => {
    const source = 'fn main(): void { particle("minecraft:flame", 0, 64, 0); }'
    const callOffset = source.indexOf('particle(') + 'particle('.length
    const { help, signature } = getSignature(sigAt(source, callOffset))

    expect(help.signatures).toHaveLength(1)
    expect(signature.label).toBe('particle(name: resource<particle>, x: coord, y: coord, z: coord): void')
    expect(signature.parameters?.[0]?.label).toBe('name: resource<particle>')
    expect(help.activeParameter).toBe(0)
  })

  it('shows effect signature with resource<effect> effect parameter', () => {
    const source = 'fn main(): void { effect(@s, "minecraft:speed", 5, 1); }'
    const effectOffset = source.indexOf('"minecraft:speed"')
    const { help, signature } = getSignature(sigAt(source, effectOffset))

    expect(help.signatures).toHaveLength(1)
    expect(signature.label).toBe('effect(target: selector, effect: resource<effect>, duration: int, amplifier: int): void')
    expect(help.activeParameter).toBe(1)
    expect(signature.parameters?.[1]?.label).toBe('effect: resource<effect>')
  })
})

// ---------------------------------------------------------------------------
// Track E2 — scoreboard objective parameter help
// ---------------------------------------------------------------------------

describe('LSP signature help — scoreboard objective parameters', () => {
  it('shows #objective style for scoreboard_get', () => {
    const source = 'fn main(): void { scoreboard_get(@s, "kills"); }'
    const offset = source.indexOf('"kills"')
    const { help, signature } = getSignature(sigAt(source, offset))

    expect(signature.label).toContain('target: selector, objective: #objective')
    expect(help.activeParameter).toBe(1)
  })

  it('shows #objective style for scoreboard_set', () => {
    const source = 'fn main(): void { scoreboard_set(@s, "timer", 300); }'
    const offset = source.indexOf('"timer"') + 1
    const { help } = getSignature(sigAt(source, offset))

    const signature = help.signatures?.[0]
    expect(help.activeParameter).toBe(1)
    expect(signature?.parameters?.[1]?.label).toBe('objective: #objective')
  })
})

// ---------------------------------------------------------------------------
// Track E3 — user-defined and declare-only signatures
// ---------------------------------------------------------------------------

describe('LSP signature help — user-defined and declare-only', () => {
  it('returns user-defined function signature from parsed declarations', () => {
    const source = `
fn add(a: int, b: int): int {
  return a + b;
}
fn main(): void {
  add(1, 2);
}
`
    const offset = source.indexOf('add(') + 'add('.length
    const { help, signature } = getSignature(sigAt(source, offset))

    expect(signature.label).toBe('fn add(a: int, b: int): int')
    expect(help.activeParameter).toBe(0)
    expect(signature.parameters?.[0]?.label).toBe('a: int')
    expect(signature.parameters?.[1]?.label).toBe('b: int')
  })

  it('returns same-file declare-only function signature', () => {
    const source = `
declare fn ext(x: int, y: int): int;
fn main(): void {
  ext(1, 2);
}
`
    const offset = source.indexOf('ext(') + 'ext('.length
    const { signature, help } = getSignature(sigAt(source, offset))

    expect(signature.label).toBe('declare fn ext(x: int, y: int): int')
    expect(help.activeParameter).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Track E4 — active parameter robustness
// ---------------------------------------------------------------------------

describe('LSP signature help — active parameter robustness', () => {
  it('ignores commas from nested call arguments', () => {
    const source = `
fn inner(a: int, b: int): int {
  return a + b;
}
fn outer(x: int, y: int): int {
  return inner(x + 1, x + 2);
}
fn main(): void {
  outer(inner(1, 2), 3);
}
`
    const callOffset = source.lastIndexOf('outer(') + 'outer('.length
    const { signature: signatureStart, help: helpStart } = getSignature(sigAt(source, callOffset))

    expect(signatureStart.label).toBe('fn outer(x: int, y: int): int')
    expect(helpStart.activeParameter).toBe(0)

    const commaOffset = source.lastIndexOf('inner(1, 2),') + 'inner(1, 2)'.length + 2
    const { signature: signatureAfter, help: helpAfter } = getSignature(sigAt(source, commaOffset))

    expect(signatureAfter.label).toBe('fn outer(x: int, y: int): int')
    expect(helpAfter.activeParameter).toBe(1)
  })

  it('ignores commas inside selector arguments', () => {
    const source = `
fn inspect(target: selector, tag: int): void {}
fn main(): void {
  inspect(@e[type=minecraft:zombie,tag=!villager], 7);
}
`
    const commaOffset = source.indexOf('],') + 2
    const { help, signature } = getSignature(sigAt(source, commaOffset))

    expect(help.activeParameter).toBe(1)
    expect(signature.parameters?.[0]?.label).toBe('target: selector')
    expect(signature.parameters?.[1]?.label).toBe('tag: int')
  })

  it('ignores commas inside string literals while determining active parameter', () => {
    const source = 'fn emit(message: string, count: int): void { emit("left,right", 3); }'
    const commaOffset = source.indexOf('left,right') + 'left,'.length
    const { help, signature } = getSignature(sigAt(source, commaOffset))

    expect(help.activeParameter).toBe(0)
    expect(signature.parameters?.[0]?.label).toBe('message: string')
  })
})
