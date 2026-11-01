import { compile } from '../index'

const options = { namespace: 'contracts', filePath: '/virtual/consumer/main.mcrs' }

describe('source call and match contracts', () => {
  test('strict compilation rejects an unresolved bare function', () => {
    expect(() => compile('fn main(): int { return sni_fixed(30); }', options)).toThrow(/Unknown function 'sni_fixed'/)
  })
  test('check-only rejects the same unresolved function', () => {
    expect(() => compile('fn main(): int { return missing(1); }', { ...options, stopAfterCheck: true })).toThrow(/Unknown function 'missing'/)
  })
  test('known stdlib functions still validate arguments and forward calls work', () => {
    expect(() => compile('import math;\nfn main(): int { return sin_fixed(30); }', options)).not.toThrow()
    expect(() => compile('fn main(): int { return later(3); } fn later(x: int): int { return x; }', options)).not.toThrow()
    expect(() => compile('import math;\nfn main(): int { return sin_fixed("wrong"); }', options)).toThrow(/expects int, got string/)
  })
  test('explicit external declarations retain their typed call contract', () => {
    expect(() => compile('declare fn external(x: int): int; fn main(): int { return external(2); }', options)).not.toThrow()
    expect(() => compile('declare fn external(x: int): int; fn main(): int { return external("bad"); }', options)).toThrow(/expects int, got string/)
  })
  test('generic arguments infer from nested function-call results', () => {
    expect(() => compile('import math;\nfn scalar(): int { return -4; } fn main(): int { return abs(scalar()); }', options)).not.toThrow()
  })
  test('a generic instantiation cannot emit an unresolved call', () => {
    expect(() => compile('fn helper<T>(x: T): int { return absent(x); } fn main(): int { return helper(3); }', options)).toThrow(/absent/)
  })
  test('lenient typing does not authorize a missing emitted function', () => {
    expect(() => compile('fn main(): int { return absent(3); }', { ...options, lenient: true })).toThrow(/absent/)
  })
  test('explicit raw interop remains supported', () => {
    expect(() => compile('fn main(): void { raw("function addon:entry"); }', options)).not.toThrow()
  })
  test.each(['import vec;', 'import "stdlib/vec";'])('stdlib transitive dependencies close for %s', imported => {
    expect(() => compile(`${imported}\nfn main(): int { return normalize2d_x(3, 4); }`, options)).not.toThrow()
  })
  test.each([
    'import math; fn main(): int { return math::sin_fixed(30); }',
    'import "stdlib/math" as trig; fn main(): int { return trig::sin_fixed(30); }',
    'import cooldown; fn main(): int { return cooldown::cooldown_start(10, 3); }',
  ])('single-file module-qualified calls resolve: %s', source => {
    expect(() => compile(source, options)).not.toThrow()
  })
  test('runtime wildcard imports expose actual stdlib definitions', () => {
    expect(() => compile('import effects::*;\nfn main(): void { speed(@s, 2, 1); }', options)).not.toThrow()
    expect(() => compile('import random::*;\nfn main(): int { return next_lcg(42); }', options)).not.toThrow()
  })
  test('inferred named struct literals retain their identity for method calls', () => {
    expect(() => compile('struct Counter { value: int } impl Counter { fn get(self): int { return self.value; } } fn main(): int { let c = Counter { value: 4 }; return c.get(); }', options)).not.toThrow()
  })
  test('Option Some binding is visible inside its arm', () => {
    expect(() => compile(`fn main(): int {
      let x: Option<int> = Some(4); let out: int = 0;
      match x { Some(v) => { out = v; } None => { out = 0; } }
      return out;
    }`, options)).not.toThrow()
  })
  test('Option binding has its payload type, not an assumed int', () => {
    expect(() => compile(`fn main(): int {
      let x: Option<bool> = Some(true);
      match x { Some(v) => { let wrong: int = v; } None => {} }
      return 0;
    }`, options)).toThrow(/expected int, got bool/)
  })
  test('match-arm local declarations do not escape or pollute other arms', () => {
    expect(() => compile(`fn main(): int {
      let x: Option<int> = Some(4);
      match x { Some(v) => { let local: int = v; } None => { let bad: int = local; } }
      return 0;
    }`, options)).toThrow(/Variable 'local' used before declaration/)
  })
  test('an Option pattern requires an Option subject', () => {
    expect(() => compile('fn main(): int { match 3 { Some(v) => { return v; } None => { return 0; } } return 0; }', options)).toThrow(/Option/)
  })
})
