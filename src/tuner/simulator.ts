/**
 * MC int32 arithmetic simulation.
 * Minecraft scoreboards use 32-bit signed integers (Java int).
 */

export const INT32_MAX = 2147483647;
export const INT32_MIN = -2147483648;

/**
 * Truncate to int32 using JavaScript bitwise (same as Java int cast).
 */
export function i32(x: number): number {
  return x | 0;
}

/**
 * Check if a value is within int32 range (before truncation).
 */
export function isOverflow(x: number): boolean {
  return x > INT32_MAX || x < INT32_MIN || !isFinite(x) || isNaN(x);
}

/**
 * Fixed-point multiply: compute i32(i32(a * b) / scale).
 * Returns Infinity if overflow is detected before truncation.
 */
export function fixedMul(a: number, b: number, scale: number): number {
  const product = a * b;
  if (isOverflow(product)) return Infinity;
  const truncated = i32(product);
  const divided = truncated / scale;
  if (isOverflow(divided)) return Infinity;
  return i32(divided);
}

/**
 * Safe i32 addition - returns Infinity on overflow.
 */
export function safeAdd(a: number, b: number): number {
  const result = a + b;
  if (isOverflow(result)) return Infinity;
  return i32(result);
}

/**
 * Safe i32 subtraction - returns Infinity on overflow.
 */
export function safeSub(a: number, b: number): number {
  const result = a - b;
  if (isOverflow(result)) return Infinity;
  return i32(result);
}

/**
 * Safe i32 multiply - returns Infinity on overflow.
 */
export function safeMul(a: number, b: number): number {
  const result = a * b;
  if (isOverflow(result)) return Infinity;
  return i32(result);
}

/**
 * Safe i32 division - returns Infinity on division by zero.
 */
export function safeDiv(a: number, b: number): number {
  if (b === 0) return Infinity;
  return i32(a / b);
}
