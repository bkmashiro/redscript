/**
 * stdlib/bigint.mcrs — runtime behavioural tests
 *
 * Tests basic BigInt operations (base 10000, 8 limbs = 32 decimal digits).
 * All arithmetic validated against known values.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import { MCRuntime } from '../runtime'

const MATH_SRC   = fs.readFileSync(path.join(__dirname, '../../src/stdlib/math.mcrs'), 'utf-8')
const BIGINT_SRC = fs.readFileSync(path.join(__dirname, '../../src/stdlib/bigint.mcrs'), 'utf-8')

function run(driver: string): MCRuntime {
  const result = compile(driver, {
    namespace: 'bitest',
    librarySources: [MATH_SRC, BIGINT_SRC],
  })
  if (!result.success) throw new Error(result.error?.message ?? 'compile failed')
  const rt = new MCRuntime('bitest')
  for (const file of result.files ?? []) {
    if (!file.path.endsWith('.mcfunction')) continue
    const match = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!match) continue
    rt.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
  }
  rt.load()
  return rt
}

function sc(rt: MCRuntime, key: string): number {
  return rt.getScore('out', `bitest.${key}`) ?? 0
}

// ── storage_set_int roundtrip ─────────────────────────────────────────────────

describe('storage_set_int roundtrip', () => {
  it('static index: write 99 to arr[2], read back', () => {
    const rt = run(`fn test() {
      storage_set_array("rs:t", "arr", "[10,20,30,40]");
      storage_set_int("rs:t", "arr", 2, 99);
      scoreboard_set("out", "r", storage_get_int("rs:t", "arr", 2));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(99)
  })

  it('runtime index: write 777 to arr[idx], read back', () => {
    const rt = run(`fn test() {
      storage_set_array("rs:t", "arr", "[1,2,3,4,5]");
      let idx: int = 3;
      storage_set_int("rs:t", "arr", idx, 777);
      scoreboard_set("out", "r", storage_get_int("rs:t", "arr", idx));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(777)
  })

  it('loop write: fill arr[0..3] with 10,20,30,40', () => {
    const rt = run(`fn test() {
      storage_set_array("rs:t", "arr", "[0,0,0,0]");
      let i: int = 0;
      while (i < 4) {
        storage_set_int("rs:t", "arr", i, (i + 1) * 10);
        i = i + 1;
      }
      scoreboard_set("out", "a", storage_get_int("rs:t", "arr", 0));
      scoreboard_set("out", "b", storage_get_int("rs:t", "arr", 1));
      scoreboard_set("out", "c", storage_get_int("rs:t", "arr", 2));
      scoreboard_set("out", "d", storage_get_int("rs:t", "arr", 3));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'a')).toBe(10)
    expect(sc(rt, 'b')).toBe(20)
    expect(sc(rt, 'c')).toBe(30)
    expect(sc(rt, 'd')).toBe(40)
  })
})

// ── bigint_init + from_int ────────────────────────────────────────────────────

describe('bigint init and load', () => {
  it('bigint_init zeros registers', () => {
    const rt = run(`fn test() {
      bigint_init();
      scoreboard_set("out", "r", bigint_get_a(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(0)
  })

  it('bigint_from_int_a(12345678): limb0=5678, limb1=1234', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(12345678);
      scoreboard_set("out", "l0", bigint_get_a(0));
      scoreboard_set("out", "l1", bigint_get_a(1));
      scoreboard_set("out", "l2", bigint_get_a(2));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(5678)
    expect(sc(rt, 'l1')).toBe(1234)
    expect(sc(rt, 'l2')).toBe(0)
  })

  it('bigint_from_int_a(2000000000): limb0=0, limb1=0, limb2=20', () => {
    // 2000000000 = 20 × 10000^2 (not 2000: 20 × 10^8 = 2×10^9 ✓)
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(2000000000);
      scoreboard_set("out", "l0", bigint_get_a(0));
      scoreboard_set("out", "l1", bigint_get_a(1));
      scoreboard_set("out", "l2", bigint_get_a(2));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(0)
    expect(sc(rt, 'l1')).toBe(0)
    expect(sc(rt, 'l2')).toBe(20)
  })
})

// ── bigint_add ────────────────────────────────────────────────────────────────

describe('bigint_add', () => {
  it('1 + 1 = 2 (simple)', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(1);
      bigint_from_int_b(1);
      bigint_add();
      scoreboard_set("out", "r", bigint_get_c(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(2)
  })

  it('9999 + 1 = 10000: carry across limb boundary', () => {
    // a=[9999,0,...] + b=[1,0,...] = c=[0,1,0,...] (carry to limb1)
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(9999);
      bigint_from_int_b(1);
      bigint_add();
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(0)
    expect(sc(rt, 'l1')).toBe(1)
  })

  it('99990000 + 10000 = 100000000: multi-limb carry', () => {
    // a=[0,9999,...] + b=[0,1,...] = c=[0,0,1,...] (carry to limb2)
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(99990000);
      bigint_from_int_b(10000);
      bigint_add();
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
      scoreboard_set("out", "l2", bigint_get_c(2));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(0)
    expect(sc(rt, 'l1')).toBe(0)
    expect(sc(rt, 'l2')).toBe(1)
  })

  it('large add: 999999999 + 999999999', () => {
    // 999999999 = [9999, 9999, 9, 0, ...]
    // + same = [9998, 9999, 18, 0, ...] after carry
    // = 1999999998: l0=9998, l1=9999, l2=19 (carry: 9+9=18, no carry from l2)
    // Wait: l0=9999+9999=19998, carry=1, l0=9998
    //       l1=9999+9999+1=19999, carry=1, l1=9999
    //       l2=9+9+1=19, carry=0, l2=19
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(999999999);
      bigint_from_int_b(999999999);
      bigint_add();
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
      scoreboard_set("out", "l2", bigint_get_c(2));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(9998)  // 1999999998 % 10000 = 9998
    expect(sc(rt, 'l1')).toBe(9999)  // floor(1999999998 / 10000) % 10000 = 9999
    expect(sc(rt, 'l2')).toBe(19)    // floor(1999999998 / 100000000) = 19
  })
})

// ── bigint_sub ────────────────────────────────────────────────────────────────

describe('bigint_sub', () => {
  it('10 - 3 = 7', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(10);
      bigint_from_int_b(3);
      bigint_sub();
      scoreboard_set("out", "r", bigint_get_c(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(7)
  })

  it('10000 - 1 = 9999: borrow across limb boundary', () => {
    // a=[0,1,...] - b=[1,0,...] = c=[9999,0,...] (borrow from limb1)
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(10000);
      bigint_from_int_b(1);
      bigint_sub();
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(9999)
    expect(sc(rt, 'l1')).toBe(0)
  })
})

// ── bigint_compare ────────────────────────────────────────────────────────────

describe('bigint_compare', () => {
  it('1 == 1 → 0', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(1);
      bigint_from_int_b(1);
      scoreboard_set("out", "r", bigint_compare());
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(0)
  })

  it('2 > 1 → 1', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(2);
      bigint_from_int_b(1);
      scoreboard_set("out", "r", bigint_compare());
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(1)
  })

  it('1 < 2 → -1', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(1);
      bigint_from_int_b(2);
      scoreboard_set("out", "r", bigint_compare());
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(-1)
  })
})

// ── bigint_mul_small ──────────────────────────────────────────────────────────

describe('bigint_mul_small', () => {
  it('12345 * 2 = 24690', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(12345);
      bigint_mul_small(2);
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(4690)
    expect(sc(rt, 'l1')).toBe(2)
  })

  it('9999 * 9999 = 99980001: carry', () => {
    // c[0] = 99980001 % 10000 = 1
    // c[1] = floor(99980001 / 10000) = 9998
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(9999);
      bigint_mul_small(9999);
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(1)      // 99980001 % 10000 = 1  (actually 0001)
    expect(sc(rt, 'l1')).toBe(9998)   // 9998
  })
})

// ── bigint_mul ────────────────────────────────────────────────────────────────

describe('bigint_mul', () => {
  it('3 * 4 = 12', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(3);
      bigint_from_int_b(4);
      bigint_mul();
      scoreboard_set("out", "r", bigint_get_c(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(12)
  })

  it('9999 * 9999 = 99980001', () => {
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(9999);
      bigint_from_int_b(9999);
      bigint_mul();
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(1)
    expect(sc(rt, 'l1')).toBe(9998)
  })

  it('100000 * 100000 = 10^10: spans 3 limbs', () => {
    // 10^10 = [0, 0, 0, 1, 0, ...] in base 10000 (1 * 10000^3 = 10^12? no)
    // 10^10 / 10000^0 % 10000 = 0
    // 10^10 / 10000^1 % 10000 = 0
    // 10^10 / 10000^2 % 10000 = 10000 → wait: 10^10 / 10^8 = 100, 100 % 10000 = 100
    // Actually: 10^10 = 100 * 10^8 = 100 * (10^4)^2
    //   l0 = 10^10 % 10^4 = 0
    //   l1 = floor(10^10 / 10^4) % 10^4 = floor(10^6) % 10000 = 0
    //   l2 = floor(10^10 / 10^8) % 10^4 = 100 % 10000 = 100
    const rt = run(`fn test() {
      bigint_init();
      bigint_from_int_a(100000);
      bigint_from_int_b(100000);
      bigint_mul();
      scoreboard_set("out", "l0", bigint_get_c(0));
      scoreboard_set("out", "l1", bigint_get_c(1));
      scoreboard_set("out", "l2", bigint_get_c(2));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(0)
    expect(sc(rt, 'l1')).toBe(0)
    expect(sc(rt, 'l2')).toBe(100)
  })
})

// ── bigint_fib ────────────────────────────────────────────────────────────────

describe('bigint_fib', () => {
  it('F(0) = 0', () => {
    const rt = run(`fn test() {
      bigint_fib(0);
      scoreboard_set("out", "r", bigint_get_a(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(0)
  })

  it('F(1) = 1', () => {
    const rt = run(`fn test() {
      bigint_fib(1);
      scoreboard_set("out", "r", bigint_get_a(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(1)
  })

  it('F(10) = 55', () => {
    const rt = run(`fn test() {
      bigint_fib(10);
      scoreboard_set("out", "r", bigint_get_a(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(55)
  })

  it('F(20) = 6765', () => {
    const rt = run(`fn test() {
      bigint_fib(20);
      scoreboard_set("out", "r", bigint_get_a(0));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'r')).toBe(6765)
  })

  it('F(50) = 12586269025: limb0=9025, limb1=8626, limb2=125', () => {
    // F(50) = 12,586,269,025
    // 12586269025 % 10000 = 9025
    // floor(12586269025 / 10000) % 10000 = 1258626 % 10000 = 8626
    // floor(12586269025 / 10^8) = 125
    const rt = run(`fn test() {
      bigint_fib(50);
      scoreboard_set("out", "l0", bigint_get_a(0));
      scoreboard_set("out", "l1", bigint_get_a(1));
      scoreboard_set("out", "l2", bigint_get_a(2));
    }`)
    rt.execFunction('test')
    expect(sc(rt, 'l0')).toBe(9025)
    expect(sc(rt, 'l1')).toBe(8626)
    expect(sc(rt, 'l2')).toBe(125)
  })

  it('F(100) low limbs check', () => {
    // F(100) = 354224848179261915075
    // % 10000 = 5075
    // floor / 10000 % 10000 = floor(35422484817926191.5075) % 10000 = ...
    // Let's compute:
    // 354224848179261915075 % 10000 = 5075
    // floor(354224848179261915075 / 10000) = 35422484817926191507 (JS BigInt)
    // 35422484817926191507 % 10000 = 1507
    // floor(35422484817926191507 / 10000) = 3542248481792619 (roughly)
    // % 10000 = 2619
    const rt = run(`fn test() {
      bigint_fib(100);
      scoreboard_set("out", "l0", bigint_get_a(0));
      scoreboard_set("out", "l1", bigint_get_a(1));
      scoreboard_set("out", "l2", bigint_get_a(2));
    }`)
    rt.execFunction('test')
    const f100 = BigInt('354224848179261915075')
    const b = BigInt(10000)
    expect(sc(rt, 'l0')).toBe(Number(f100 % b))
    expect(sc(rt, 'l1')).toBe(Number((f100 / b) % b))
    expect(sc(rt, 'l2')).toBe(Number((f100 / b / b) % b))
  })
})
