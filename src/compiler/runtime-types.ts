/** Shared admission for the compiler-owned static Timer representation. */
export function isIntrinsicTimerType(name: string, fields: Iterable<string>): boolean {
  const names = new Set(fields)
  return name === 'Timer' && names.has('_id') && names.has('_duration')
}
