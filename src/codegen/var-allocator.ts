/**
 * VarAllocator — assigns scoreboard fake-player names to variables.
 *
 * mangle=true:  sequential short names ($a, $b, ..., $z, $aa, $ab, ...)
 * mangle=false: legacy names ($<name> for vars, $const_<v> for consts, $p0/$ret for internals)
 */

export class VarAllocator {
  private readonly mangle: boolean
  private seq = 0
  private readonly varCache = new Map<string, string>()
  private readonly constCache = new Map<number, string>()
  private readonly internalCache = new Map<string, string>()

  constructor(mangle = true) {
    this.mangle = mangle
  }

  /** Allocate a name for a user variable. Strips leading '$' if present. */
  alloc(originalName: string): string {
    const clean = originalName.startsWith('$') ? originalName.slice(1) : originalName
    const cached = this.varCache.get(clean)
    if (cached) return cached
    const name = this.mangle ? `$${this.nextSeqName()}` : `$${clean}`
    this.varCache.set(clean, name)
    return name
  }

  /** Allocate a name for a constant value (content-addressed). */
  constant(value: number): string {
    const cached = this.constCache.get(value)
    if (cached) return cached
    const name = this.mangle ? `$${this.nextSeqName()}` : `$const_${value}`
    this.constCache.set(value, name)
    return name
  }

  /** Allocate a name for a compiler internal (e.g. "ret", "p0"). */
  internal(suffix: string): string {
    const cached = this.internalCache.get(suffix)
    if (cached) return cached
    const name = this.mangle ? `$${this.nextSeqName()}` : `$${suffix}`
    this.internalCache.set(suffix, name)
    return name
  }

  /** Generate the next sequential name: a, b, ..., z, aa, ab, ..., az, ba, ... */
  private nextSeqName(): string {
    const n = this.seq++
    let result = ''
    let remaining = n
    do {
      result = String.fromCharCode(97 + (remaining % 26)) + result
      remaining = Math.floor(remaining / 26) - 1
    } while (remaining >= 0)
    return result
  }
}
