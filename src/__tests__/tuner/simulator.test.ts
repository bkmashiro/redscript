import {
  INT32_MAX,
  INT32_MIN,
  i32,
  isOverflow,
  fixedMul,
  safeAdd,
  safeSub,
  safeMul,
  safeDiv,
} from '../../tuner/simulator';

// ---------------------------------------------------------------------------
// i32 — truncates to 32-bit signed integer via bitwise OR 0
// ---------------------------------------------------------------------------

describe('i32', () => {
  test('positive value within range is unchanged', () => {
    expect(i32(42)).toBe(42);
  });

  test('negative value within range is unchanged', () => {
    expect(i32(-100)).toBe(-100);
  });

  test('INT32_MAX stays as is', () => {
    expect(i32(INT32_MAX)).toBe(INT32_MAX);
  });

  test('INT32_MIN stays as is', () => {
    expect(i32(INT32_MIN)).toBe(INT32_MIN);
  });

  test('INT32_MAX + 1 wraps to INT32_MIN (overflow)', () => {
    // Java int cast semantics: bit truncation wraps around
    expect(i32(INT32_MAX + 1)).toBe(INT32_MIN);
  });

  test('INT32_MIN - 1 wraps to INT32_MAX (underflow)', () => {
    expect(i32(INT32_MIN - 1)).toBe(INT32_MAX);
  });

  test('float is truncated toward zero', () => {
    expect(i32(3.9)).toBe(3);
    expect(i32(-3.9)).toBe(-3);
  });

  test('zero is zero', () => {
    expect(i32(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isOverflow — boundary conditions
// ---------------------------------------------------------------------------

describe('isOverflow', () => {
  test('INT32_MAX is not overflow', () => {
    expect(isOverflow(INT32_MAX)).toBe(false);
  });

  test('INT32_MIN is not overflow', () => {
    expect(isOverflow(INT32_MIN)).toBe(false);
  });

  test('INT32_MAX + 1 is overflow', () => {
    expect(isOverflow(INT32_MAX + 1)).toBe(true);
  });

  test('INT32_MIN - 1 is overflow', () => {
    expect(isOverflow(INT32_MIN - 1)).toBe(true);
  });

  test('zero is not overflow', () => {
    expect(isOverflow(0)).toBe(false);
  });

  test('Infinity is overflow', () => {
    expect(isOverflow(Infinity)).toBe(true);
  });

  test('-Infinity is overflow', () => {
    expect(isOverflow(-Infinity)).toBe(true);
  });

  test('NaN is overflow', () => {
    expect(isOverflow(NaN)).toBe(true);
  });

  test('large negative value beyond INT32_MIN is overflow', () => {
    expect(isOverflow(-3_000_000_000)).toBe(true);
  });

  test('large positive value beyond INT32_MAX is overflow', () => {
    expect(isOverflow(3_000_000_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fixedMul — precision and overflow
// ---------------------------------------------------------------------------

describe('fixedMul', () => {
  test('basic multiplication with scale 10000', () => {
    // fixedMul(20000, 15000, 10000) = i32(i32(20000*15000) / 10000) = i32(300000000/10000) = 30000
    expect(fixedMul(20000, 15000, 10000)).toBe(30000);
  });

  test('multiplying by zero returns zero', () => {
    expect(fixedMul(0, 99999, 10000)).toBe(0);
    expect(fixedMul(99999, 0, 10000)).toBe(0);
  });

  test('multiplying two ones with scale 1 returns 1', () => {
    expect(fixedMul(1, 1, 1)).toBe(1);
  });

  test('returns Infinity when product overflows int32', () => {
    // INT32_MAX * 2 exceeds int32 range
    expect(fixedMul(INT32_MAX, 2, 1)).toBe(Infinity);
  });

  test('negative × positive gives negative result', () => {
    // fixedMul(-20000, 15000, 10000) = i32(-300000000/10000) = -30000
    expect(fixedMul(-20000, 15000, 10000)).toBe(-30000);
  });

  test('result is truncated, not rounded', () => {
    // 10001 * 10001 = 100020001; i32 = 100020001; /10000 = 10002.0001 → i32 = 10002
    expect(fixedMul(10001, 10001, 10000)).toBe(10002);
  });

  test('scale of 1 is an identity fixedMul', () => {
    expect(fixedMul(5, 7, 1)).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// safeAdd / safeSub / safeMul / safeDiv
// ---------------------------------------------------------------------------

describe('safeAdd', () => {
  test('normal addition', () => {
    expect(safeAdd(10, 20)).toBe(30);
  });

  test('negative addition', () => {
    expect(safeAdd(-5, 3)).toBe(-2);
  });

  test('returns Infinity on overflow', () => {
    expect(safeAdd(INT32_MAX, 1)).toBe(Infinity);
  });

  test('returns Infinity on underflow', () => {
    expect(safeAdd(INT32_MIN, -1)).toBe(Infinity);
  });

  test('exact INT32_MAX is not overflow', () => {
    expect(safeAdd(INT32_MAX - 1, 1)).toBe(INT32_MAX);
  });
});

describe('safeSub', () => {
  test('normal subtraction', () => {
    expect(safeSub(10, 3)).toBe(7);
  });

  test('subtraction going negative', () => {
    expect(safeSub(3, 10)).toBe(-7);
  });

  test('returns Infinity on underflow', () => {
    expect(safeSub(INT32_MIN, 1)).toBe(Infinity);
  });

  test('returns Infinity on overflow', () => {
    expect(safeSub(INT32_MAX, -1)).toBe(Infinity);
  });
});

describe('safeMul', () => {
  test('normal multiplication', () => {
    expect(safeMul(6, 7)).toBe(42);
  });

  test('returns Infinity on overflow', () => {
    expect(safeMul(INT32_MAX, 2)).toBe(Infinity);
  });

  test('zero times large number is zero', () => {
    expect(safeMul(0, INT32_MAX)).toBe(0);
  });
});

describe('safeDiv', () => {
  test('normal integer division truncates toward zero', () => {
    expect(safeDiv(10, 3)).toBe(3);
    expect(safeDiv(-10, 3)).toBe(-3);
  });

  test('returns Infinity on division by zero', () => {
    expect(safeDiv(42, 0)).toBe(Infinity);
  });

  test('zero divided by any non-zero returns zero', () => {
    expect(safeDiv(0, 999)).toBe(0);
  });
});
