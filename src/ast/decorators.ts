export const DECORATOR_NAMES = [
  'tick',
  'load',
  'watch',
  'on',
  'function_tag',
  'on_trigger',
  'on_advancement',
  'on_craft',
  'on_death',
  'on_login',
  'on_join_team',
  'keep',
  'require_on_load',
  'coroutine',
  'schedule',
  'deprecated',
  'inline',
  'no-inline',
  'config',
  'singleton',
  'profile',
  'benchmark',
  'throttle',
  'retry',
  'memoize',
  'test',
] as const

export type DecoratorName = typeof DECORATOR_NAMES[number]

export function isDecoratorName(name: string): name is DecoratorName {
  return (DECORATOR_NAMES as readonly string[]).includes(name)
}
