/** Minecraft scoreboard signed-i32 division and remainder (floor, not JS truncation). */
export function scoreboardFloorDiv(left: number, right: number): number {
  if (right === 0) throw new RangeError('scoreboard division by zero')
  return Math.floor(left / right) | 0
}

export function scoreboardFloorMod(left: number, right: number): number {
  if (right === 0) throw new RangeError('scoreboard modulo by zero')
  // Use the unwrapped quotient: MIN / -1 wraps as a score, but its remainder
  // must still be zero. The intermediate product is exact for i32 operands.
  return (left - Math.floor(left / right) * right) | 0
}
