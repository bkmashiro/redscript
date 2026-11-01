// A periodic dispatcher counts native signed-i32 scoreboard ticks.
export const MAX_TICK_RATE = 2147483647
export const INVALID_TICK_RATE_MESSAGE = '@tick rate must be a positive integer literal in [1, 2147483647].'
export function isValidTickRate(rate: number): boolean {
  return Number.isInteger(rate) && rate >= 1 && rate <= MAX_TICK_RATE
}
