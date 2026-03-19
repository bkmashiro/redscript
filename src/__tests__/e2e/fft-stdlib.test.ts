/**
 * End-to-end tests for fft.mcrs (DFT stdlib).
 *
 * Tests dft_real, dft_magnitude, dft_power, dft_coro, and dft_freq_bin by
 * compiling with librarySources, loading into MCRuntime, and asserting values.
 *
 * NOTE on trig: sin_fixed/cos_fixed depend on storage_get_int, which the new
 * emit pipeline emits as `function ns:storage_get_int` (an unresolved stub).
 * We work around this by registering a synthetic storage_get_int function that
 * implements the 91-entry sin lookup table via execute-if branches, exactly
 * mirroring the in-game behaviour.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../emit/compile'
import { MCRuntime } from '../../runtime'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NS = 'test'
const OBJ = `__${NS}`

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/math.mcrs'),
  'utf-8',
)
const FFT_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/fft.mcrs'),
  'utf-8',
)

// sin lookup table from math.mcrs (sin(i°) × 1000, i = 0..90)
const SIN_TABLE = [
  0, 17, 35, 52, 70, 87, 105, 122, 139, 156,
  174, 191, 208, 225, 242, 259, 276, 292, 309, 326,
  342, 358, 375, 391, 407, 423, 438, 454, 469, 485,
  500, 515, 530, 545, 559, 574, 588, 602, 616, 629,
  643, 656, 669, 682, 695, 707, 719, 731, 743, 755,
  766, 777, 788, 799, 809, 819, 829, 839, 848, 857,
  866, 875, 883, 891, 899, 906, 914, 921, 927, 934,
  940, 946, 951, 956, 961, 966, 970, 974, 978, 982,
  985, 988, 990, 993, 995, 996, 998, 999, 999, 1000,
  1000,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Register a synthetic `storage_get_int` function that emulates the NBT
 * sin-table lookup via per-score execute-if branches.
 *
 * The new emit pipeline lowers storage_get_int(ns, key, idx) to:
 *   scoreboard players operation $p2 __NS = <idx_var> __NS
 *   function NS:storage_get_int
 *
 * So we can read $p2 and branch on it to return the correct sin value.
 */
function registerStorageGetInt(rt: MCRuntime): void {
  const lines: string[] = []
  for (let i = 0; i <= 90; i++) {
    lines.push(
      `execute if score $p2 ${OBJ} matches ${i} run scoreboard players set $ret ${OBJ} ${SIN_TABLE[i]}`,
    )
  }
  rt.loadFunction(`${NS}:storage_get_int`, lines)
}

/**
 * Compile source with math + fft stdlib, load into MCRuntime, init objective,
 * and register the trig stub.
 */
function makeRuntime(source: string, libs: string[] = [MATH_SRC, FFT_SRC]): MCRuntime {
  const result = compile(source, { namespace: NS, librarySources: libs })
  const rt = new MCRuntime(NS)
  for (const file of result.files) {
    if (!file.path.endsWith('.mcfunction')) continue
    const m = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!m) continue
    rt.loadFunction(`${m[1]}:${m[2]}`, file.content.split('\n'))
  }
  // Register synthetic sin lookup stub before load
  registerStorageGetInt(rt)
  rt.execFunction(`${NS}:load`)
  return rt
}

/** Execute a function and return the $ret score. */
function callAndGetRet(rt: MCRuntime, fnName: string): number {
  rt.execFunction(`${NS}:${fnName}`)
  return rt.getScore('$ret', OBJ)
}

// ===========================================================================
// dft_freq_bin — pure integer arithmetic, no trig required
// ===========================================================================

describe('fft.mcrs — dft_freq_bin', () => {
  const rt = makeRuntime(`
    fn test_freq_bin_0(): int { return dft_freq_bin(44100, 16, 0); }
    fn test_freq_bin_4(): int { return dft_freq_bin(44100, 16, 4); }
    fn test_freq_bin_8(): int { return dft_freq_bin(44100, 16, 8); }
    fn test_freq_bin_tick(): int { return dft_freq_bin(20, 8, 1); }
    fn test_freq_bin_nyquist(): int { return dft_freq_bin(44100, 16, 8); }
  `)

  test('bin 0 is always DC (0 Hz)', () =>
    expect(callAndGetRet(rt, 'test_freq_bin_0')).toBe(0))

  test('dft_freq_bin(44100, 16, 4) == 11025', () =>
    expect(callAndGetRet(rt, 'test_freq_bin_4')).toBe(11025))

  test('dft_freq_bin(44100, 16, 8) == 22050 (Nyquist)', () =>
    expect(callAndGetRet(rt, 'test_freq_bin_nyquist')).toBe(22050))

  test('dft_freq_bin(20, 8, 1) == 2 Hz (Minecraft tick rate)', () =>
    expect(callAndGetRet(rt, 'test_freq_bin_tick')).toBe(2))
})

// ===========================================================================
// dft_power — pure integer arithmetic on pre-set arrays
// ===========================================================================

describe('fft.mcrs — dft_power', () => {
  const rt = makeRuntime(`
    fn test_power_dc(): int {
      let re: int[] = [40000, 0, 0, 0]
      let im: int[] = [0, 0, 0, 0]
      return dft_power(re, im, 0)
    }
    fn test_power_zero(): int {
      let re: int[] = [0, 0, 0, 0]
      let im: int[] = [0, 0, 0, 0]
      return dft_power(re, im, 0)
    }
    fn test_power_complex(): int {
      // re=30000, im=40000 → power = 30000²/10000 + 40000²/10000 = 90000000/10000 + 160000000/10000 = 9000+16000 = 25000
      let re: int[] = [30000, 0, 0, 0]
      let im: int[] = [40000, 0, 0, 0]
      return dft_power(re, im, 0)
    }
    fn test_power_negative(): int {
      // re=-20000, im=0 → power = 400000000/10000 = 40000
      let re: int[] = [-20000, 0, 0, 0]
      let im: int[] = [0, 0, 0, 0]
      return dft_power(re, im, 0)
    }
  `)

  test('dft_power with re=40000, im=0 → 160000', () =>
    expect(callAndGetRet(rt, 'test_power_dc')).toBe(160000))

  test('dft_power with re=0, im=0 → 0', () =>
    expect(callAndGetRet(rt, 'test_power_zero')).toBe(0))

  test('dft_power 3-4-5 triangle: re=30000, im=40000 → 25000×10000÷10000... wait', () =>
    // re²/10000 + im²/10000 = 900000000/10000 + 1600000000/10000 = 90000+160000=250000
    // NOTE: 30000² = 900,000,000 — fits in int32
    expect(callAndGetRet(rt, 'test_power_complex')).toBe(250000))

  test('dft_power is symmetric: power(-20000, 0) == power(20000, 0)', () =>
    expect(callAndGetRet(rt, 'test_power_negative')).toBe(40000))
})

// ===========================================================================
// dft_magnitude — uses isqrt (no storage/trig required)
// ===========================================================================

describe('fft.mcrs — dft_magnitude', () => {
  const rt = makeRuntime(`
    fn test_mag_dc(): int {
      // |40000 + 0j| = 40000
      let re: int[] = [40000, 0, 0, 0]
      let im: int[] = [0, 0, 0, 0]
      return dft_magnitude(re, im, 0)
    }
    fn test_mag_zero(): int {
      let re: int[] = [0, 0, 0, 0]
      let im: int[] = [0, 0, 0, 0]
      return dft_magnitude(re, im, 0)
    }
    fn test_mag_pythagorean(): int {
      // |30000 + 40000j| = 50000
      let re: int[] = [30000, 0, 0, 0]
      let im: int[] = [40000, 0, 0, 0]
      return dft_magnitude(re, im, 0)
    }
    fn test_mag_negative(): int {
      // |-20000 + 0j| = 20000
      let re: int[] = [-20000, 0, 0, 0]
      let im: int[] = [0, 0, 0, 0]
      return dft_magnitude(re, im, 0)
    }
    fn test_mag_imag_only(): int {
      // |0 + 10000j| = 10000
      let re: int[] = [0, 0, 0, 0]
      let im: int[] = [10000, 0, 0, 0]
      return dft_magnitude(re, im, 0)
    }
  `)

  test('magnitude of pure real 40000 → 40000', () =>
    expect(callAndGetRet(rt, 'test_mag_dc')).toBe(40000))

  test('magnitude of zero → 0', () =>
    expect(callAndGetRet(rt, 'test_mag_zero')).toBe(0))

  test('magnitude of 3-4-5: |30000+40000j| → 50000', () =>
    expect(callAndGetRet(rt, 'test_mag_pythagorean')).toBe(50000))

  test('magnitude of negative real: |-20000| → 20000', () =>
    expect(callAndGetRet(rt, 'test_mag_negative')).toBe(20000))

  test('magnitude of pure imaginary: |10000j| → 10000', () =>
    expect(callAndGetRet(rt, 'test_mag_imag_only')).toBe(10000))
})

// ===========================================================================
// dft_real — requires trig (sin_fixed / cos_fixed via storage stub)
// ===========================================================================

describe('fft.mcrs — dft_real (requires trig stub)', () => {
  const rt = makeRuntime(`
    fn test_dft_dc_re0(): int {
      // DC input: all same value 10000 ×10000
      // X[0] = sum * cos(0) = 4 * 10000 * 1000/1000 = 40000
      let input: int[] = [10000, 10000, 10000, 10000]
      let out_re: int[] = [0, 0, 0, 0]
      let out_im: int[] = [0, 0, 0, 0]
      dft_real(input, 4, out_re, out_im)
      return out_re[0]
    }
    fn test_dft_dc_re1(): int {
      // X[1] real part for DC input should be near 0
      let input: int[] = [10000, 10000, 10000, 10000]
      let out_re: int[] = [0, 0, 0, 0]
      let out_im: int[] = [0, 0, 0, 0]
      dft_real(input, 4, out_re, out_im)
      return out_re[1]
    }
    fn test_dft_quarter_wave_mag1(): int {
      // Quarter-wave: [10000, 0, -10000, 0] → X[1] magnitude ≈ 20000
      let input: int[] = [10000, 0, -10000, 0]
      let out_re: int[] = [0, 0, 0, 0]
      let out_im: int[] = [0, 0, 0, 0]
      dft_real(input, 4, out_re, out_im)
      return dft_magnitude(out_re, out_im, 1)
    }
    fn test_dft_dc_im0(): int {
      // DC input: imaginary part of X[0] should be 0
      let input: int[] = [10000, 10000, 10000, 10000]
      let out_re: int[] = [0, 0, 0, 0]
      let out_im: int[] = [0, 0, 0, 0]
      dft_real(input, 4, out_re, out_im)
      return out_im[0]
    }
  `)

  test('DC input: out_re[0] == 40000 (sum of inputs × cos(0°))', () =>
    expect(callAndGetRet(rt, 'test_dft_dc_re0')).toBe(40000))

  test('DC input: out_im[0] == 0 (imaginary part = 0 for DC)', () =>
    expect(callAndGetRet(rt, 'test_dft_dc_im0')).toBe(0))

  test('DC input: out_re[1] ≈ 0 (harmonics cancel)', () => {
    const val = callAndGetRet(rt, 'test_dft_dc_re1')
    expect(Math.abs(val)).toBeLessThan(100)
  })

  test('quarter-wave [10000,0,-10000,0]: X[1] magnitude ≈ 20000', () => {
    const val = callAndGetRet(rt, 'test_dft_quarter_wave_mag1')
    expect(val).toBeGreaterThanOrEqual(19500)
    expect(val).toBeLessThanOrEqual(20500)
  })
})

// ===========================================================================
// dft_coro — compile test (verify @coroutine decorator compiles)
// ===========================================================================

describe('fft.mcrs — dft_coro (compile test)', () => {
  test('@coroutine(batch=4) generates tick dispatcher', () => {
    const source = `fn noop(): void { let x: int = 0; }`
    const result = compile(source, {
      namespace: NS,
      librarySources: [MATH_SRC, FFT_SRC],
    })
    const tickJson = result.files.find(f => f.path.includes('tick.json'))
    // The dft_coro coroutine should register a tick function
    expect(tickJson).toBeDefined()
    const parsed = JSON.parse(tickJson!.content)
    const hasCoroutineTick = parsed.values.some((v: string) =>
      v.includes('_coro_') || v.includes('dft_coro'),
    )
    expect(hasCoroutineTick).toBe(true)
  })

  test('dft_coro generates continuation mcfunction files', () => {
    const source = `fn noop(): void { let x: int = 0; }`
    const result = compile(source, {
      namespace: NS,
      librarySources: [MATH_SRC, FFT_SRC],
    })
    const coroFiles = result.files.filter(
      f => f.path.includes('dft_coro') && f.path.endsWith('.mcfunction'),
    )
    expect(coroFiles.length).toBeGreaterThanOrEqual(1)
  })
})
