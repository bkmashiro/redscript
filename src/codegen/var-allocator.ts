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

  /**
   * Look up the allocated name for a raw scoreboard fake-player name such as
   * "$_2", "$x", "$p0", or "$ret".  Returns the mangled name when mangle=true,
   * or the original name when mangle=false or the name is not yet known.
   *
   * Unlike alloc/internal/constant this does NOT create a new slot — it only
   * resolves names that were already registered.  Used by the codegen to
   * rewrite variable references inside `raw` IR instructions.
   */
  resolve(rawName: string): string {
    const clean = rawName.startsWith('$') ? rawName.slice(1) : rawName
    // Check every cache in priority order: vars, internals, consts
    return (
      this.varCache.get(clean) ??
      this.internalCache.get(clean) ??
      rawName  // not registered → return as-is (literal fake player, not a var)
    )
  }

  /**
   * Rewrite all $varname tokens in a raw mcfunction command string so that
   * IR variable names are replaced by their allocated (possibly mangled) names.
   * Tokens that are not registered in the allocator are left untouched (they
   * are literal scoreboard fake-player names like "out" or "#rs").
   */
  resolveRaw(cmd: string): string {
    return cmd.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, (tok) => this.resolve(tok))
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

  /**
   * Returns a sourcemap object mapping allocated name → original name.
   * Useful for debugging: write to <output>.map.json alongside the datapack.
   * Only meaningful when mangle=true.
   */
  toSourceMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const [orig, alloc] of this.varCache) {
      // Skip compiler-generated temporaries (start with _ followed by digits)
      if (/^_\d+$/.test(orig)) continue
      map[alloc] = orig
    }
    for (const [val,  alloc] of this.constCache)    map[alloc] = `const:${val}`
    for (const [suf,  alloc] of this.internalCache) map[alloc] = `internal:${suf}`
    return map
  }
}
