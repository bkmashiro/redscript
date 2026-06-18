import type { FnDecl, TypeNode } from '../../ast/types'
import { validateFunctionDecorators } from '../../typechecker/decorators'

const voidType: TypeNode = { kind: 'named', name: 'void' }
const intType: TypeNode = { kind: 'named', name: 'int' }
const stringType: TypeNode = { kind: 'named', name: 'string' }

function fn(overrides: Partial<FnDecl>): FnDecl {
  return {
    name: 'handler',
    params: [],
    returnType: voidType,
    decorators: [],
    body: [],
    ...overrides,
  }
}

function validate(decl: FnDecl): string[] {
  const messages: string[] = []
  validateFunctionDecorators(decl, {
    report: message => messages.push(message),
    normalizeType: type => type,
    typesMatch: (expected, actual) => JSON.stringify(expected) === JSON.stringify(actual),
    typeToString: type => {
      if (type.kind === 'named') return type.name
      if (type.kind === 'entity') return type.entityType
      return type.kind
    },
  })
  return messages
}

describe('typechecker decorator validation helper', () => {
  test('validates runtime wrapper decorators without a TypeChecker instance', () => {
    expect(validate(fn({
      name: 'watched',
      decorators: [{ name: 'watch', args: { objective: 'rs.kills' } }],
      params: [{ name: 'value', type: intType }],
    }))).toEqual(["@watch handler 'watched' cannot declare parameters"])

    expect(validate(fn({
      name: 'memoized',
      decorators: [{ name: 'memoize' }],
      params: [{ name: 'key', type: stringType }],
    }))).toEqual(["@memoize on 'memoized' only supports int parameters (got 'string')"])
  })

  test('validates legacy event decorators and zero-parameter compatibility', () => {
    expect(validate(fn({
      name: 'death_zero_param',
      decorators: [{ name: 'on', args: { eventType: 'PlayerDeath' } }],
      params: [],
    }))).toEqual([])

    expect(validate(fn({
      name: 'death_bad_type',
      decorators: [{ name: 'on', args: { eventType: 'PlayerDeath' } }],
      params: [{ name: 'player', type: stringType }],
    }))).toEqual(["Event handler 'death_bad_type' parameter 1 must be Player, got string"])

    expect(validate(fn({
      name: 'unknown_event',
      decorators: [{ name: 'on', args: { eventType: 'BlockBreak' } }],
    }))).toEqual(["Unknown event type 'BlockBreak'"])
  })
})
