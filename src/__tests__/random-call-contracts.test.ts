import { compile } from '../compile'

test.each(['random', 'random_native'])('%s returns the native command result for inclusive runtime bounds', name => {
  const result = compile(`fn roll(low: int, high: int): int { return ${name}(low, high); } fn main(): int { return roll(2, 5); }`, { namespace: 'rng' })
  const commands = result.files.map(file => file.content).join('\n')
  expect(commands).toMatch(/random value \$\([^)]+\)\.\.\$\([^)]+\)/)
  expect(commands).toMatch(/execute store result score .* run random value/)
  expect(commands).not.toMatch(/function rng:random(?:_native)?(?:\s|$)/)
})

test('random calls validate types and arity in check-only mode too', () => {
  expect(() => compile('fn main(): int { return random(1); }', { stopAfterCheck: true })).toThrow(/expects|argument/i)
  expect(() => compile('fn main(): int { return random("1", 2); }', { stopAfterCheck: true })).toThrow(/expects|int/i)
})
