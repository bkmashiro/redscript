import { DECORATOR_NAMES, isDecoratorName } from '../../ast/decorators'

describe('AST decorator metadata', () => {
  test('centralizes supported decorator names', () => {
    expect(DECORATOR_NAMES).toEqual(expect.arrayContaining(['tick', 'load', 'on', 'function_tag', 'memoize', 'test']))
    expect(isDecoratorName('function_tag')).toBe(true)
    expect(isDecoratorName('BlockBreak')).toBe(false)
  })
})
