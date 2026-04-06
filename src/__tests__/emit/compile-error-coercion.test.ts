/**
 * Tests for safe error message extraction in the compile catch block.
 *
 * Guards against the bug where `(err as Error).message` silently produced
 * `undefined` when the thrown value was a string, number, or a custom object
 * without a `.message` property.
 */

const STANDARD_MOCKS = {
  compile: () => ({
    preprocessSourceWithMetadata: jest.fn((source: string) => ({ source })),
  }),
  lexer: () => ({
    Lexer: jest.fn().mockImplementation(() => ({ tokenize: () => [] })),
  }),
  parser: (declarations: unknown[] = []) => ({
    Parser: jest.fn().mockImplementation(() => ({
      warnings: [],
      parseErrors: [],
      parse: () => ({
        imports: [],
        declarations,
        structs: [],
        implBlocks: [],
        enums: [],
        consts: [],
        globals: [],
      }),
    })),
  }),
  typechecker: () => ({
    TypeChecker: jest.fn().mockImplementation(() => ({
      check: () => [],
      getWarnings: () => [],
    })),
  }),
  hirDeprecated: () => ({ checkDeprecatedCalls: jest.fn(() => []) }),
  mirLower: () => ({ lowerToMIR: jest.fn(() => ({ functions: [] })) }),
  optimizer: () => ({ optimizeModule: jest.fn((x: unknown) => x) }),
  coroutine: () => ({
    coroutineTransform: jest.fn((module: unknown) => ({ module, generatedTickFunctions: [], warnings: [] })),
  }),
  lirLower: () => ({ lowerToLIR: jest.fn(() => ({ functions: [] })) }),
  lirOptimizer: () => ({ lirOptimizeModule: jest.fn((x: unknown) => x) }),
  budget: () => ({ analyzeBudget: jest.fn(() => []) }),
  events: () => ({ isEventTypeName: jest.fn(() => false) }),
  emitIndex: () => ({ emit: jest.fn(() => []) }),
}

function applyStandardMocks(except: Record<string, () => unknown> = {}): void {
  jest.doMock('../../compile', STANDARD_MOCKS.compile)
  jest.doMock('../../lexer', STANDARD_MOCKS.lexer)
  jest.doMock('../../parser', STANDARD_MOCKS.parser)
  jest.doMock('../../typechecker', STANDARD_MOCKS.typechecker)
  jest.doMock('../../hir/deprecated', STANDARD_MOCKS.hirDeprecated)
  jest.doMock('../../mir/lower', STANDARD_MOCKS.mirLower)
  jest.doMock('../../optimizer/pipeline', STANDARD_MOCKS.optimizer)
  jest.doMock('../../optimizer/coroutine', STANDARD_MOCKS.coroutine)
  jest.doMock('../../lir/lower', STANDARD_MOCKS.lirLower)
  jest.doMock('../../optimizer/lir/pipeline', STANDARD_MOCKS.lirOptimizer)
  jest.doMock('../../lir/budget', STANDARD_MOCKS.budget)
  jest.doMock('../../events/types', STANDARD_MOCKS.events)
  jest.doMock('../../emit/index', STANDARD_MOCKS.emitIndex)
  for (const [mod, factory] of Object.entries(except)) {
    jest.doMock(mod, factory)
  }
}

describe('emit/compile: safe error message extraction', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('thrown Error uses err.message', () => {
    jest.isolateModules(() => {
      applyStandardMocks({
        '../../hir/lower': () => ({
          lowerToHIR: jest.fn(() => { throw new Error('something went wrong') }),
        }),
      })

      const { compile } = require('../../emit/compile')
      const { DiagnosticError } = require('../../diagnostics')

      expect(() => compile('fn f(): void {}', { namespace: 'ns' }))
        .toThrow(DiagnosticError)

      try {
        compile('fn f(): void {}', { namespace: 'ns' })
      } catch (err) {
        expect((err as { message: string }).message).toContain('something went wrong')
      }
    })
  })

  test('thrown string is preserved (not "undefined")', () => {
    jest.isolateModules(() => {
      applyStandardMocks({
        '../../hir/lower': () => ({
          lowerToHIR: jest.fn(() => { throw 'string error from lowering' }),
        }),
      })

      const { compile } = require('../../emit/compile')
      const { DiagnosticError } = require('../../diagnostics')

      try {
        compile('fn f(): void {}', { namespace: 'ns' })
        fail('expected compile to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(DiagnosticError)
        expect((err as { message: string }).message).toBe('string error from lowering')
        expect((err as { message: string }).message).not.toBe('undefined')
      }
    })
  })

  test('thrown number is stringified, not "undefined"', () => {
    jest.isolateModules(() => {
      applyStandardMocks({
        '../../hir/lower': () => ({
          lowerToHIR: jest.fn(() => { throw 42 }),
        }),
      })

      const { compile } = require('../../emit/compile')
      const { DiagnosticError } = require('../../diagnostics')

      try {
        compile('fn f(): void {}', { namespace: 'ns' })
        fail('expected compile to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(DiagnosticError)
        expect((err as { message: string }).message).toBe('42')
        expect((err as { message: string }).message).not.toBe('undefined')
      }
    })
  })

  test('object without .message is stringified, not "undefined"', () => {
    jest.isolateModules(() => {
      applyStandardMocks({
        '../../hir/lower': () => ({
          lowerToHIR: jest.fn(() => { throw { code: 'ERR_LOWERING', details: 'bad state' } }),
        }),
      })

      const { compile } = require('../../emit/compile')
      const { DiagnosticError } = require('../../diagnostics')

      try {
        compile('fn f(): void {}', { namespace: 'ns' })
        fail('expected compile to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(DiagnosticError)
        expect((err as { message: string }).message).not.toBe('undefined')
        expect((err as { message: string }).message).toBeTruthy()
      }
    })
  })

  test('Error with empty .message falls back to "unknown error"', () => {
    jest.isolateModules(() => {
      applyStandardMocks({
        '../../hir/lower': () => ({
          lowerToHIR: jest.fn(() => { throw new Error('') }),
        }),
      })

      const { compile } = require('../../emit/compile')
      const { DiagnosticError } = require('../../diagnostics')

      try {
        compile('fn f(): void {}', { namespace: 'ns' })
        fail('expected compile to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(DiagnosticError)
        expect((err as { message: string }).message).toBe('unknown error')
      }
    })
  })

  test('stopAfterCheck: thrown string produces CheckFailedError with non-undefined message', () => {
    jest.isolateModules(() => {
      applyStandardMocks({
        '../../hir/lower': () => ({
          lowerToHIR: jest.fn(() => { throw 'check-phase string error' }),
        }),
      })

      const { compile } = require('../../emit/compile')
      const { CheckFailedError } = require('../../diagnostics')

      try {
        compile('fn f(): void {}', { namespace: 'ns', stopAfterCheck: true })
        fail('expected compile to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(CheckFailedError)
        const diagnostics = (err as { diagnostics: { message: string }[] }).diagnostics
        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0].message).toBe('check-phase string error')
        expect(diagnostics[0].message).not.toBe('undefined')
      }
    })
  })

  test('stopAfterCheck: thrown number produces CheckFailedError with stringified message', () => {
    jest.isolateModules(() => {
      applyStandardMocks({
        '../../hir/lower': () => ({
          lowerToHIR: jest.fn(() => { throw 99 }),
        }),
      })

      const { compile } = require('../../emit/compile')
      const { CheckFailedError } = require('../../diagnostics')

      try {
        compile('fn f(): void {}', { namespace: 'ns', stopAfterCheck: true })
        fail('expected compile to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(CheckFailedError)
        const diagnostics = (err as { diagnostics: { message: string }[] }).diagnostics
        expect(diagnostics[0].message).toBe('99')
      }
    })
  })
})
