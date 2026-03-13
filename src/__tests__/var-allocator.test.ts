import { VarAllocator } from '../codegen/var-allocator'

describe('VarAllocator', () => {
  describe('mangle mode (default)', () => {
    it('generates sequential names: a, b, ..., z, aa, ab', () => {
      const alloc = new VarAllocator(true)
      const names: string[] = []
      for (let i = 0; i < 28; i++) {
        names.push(alloc.alloc(`var${i}`))
      }
      expect(names[0]).toBe('$a')
      expect(names[1]).toBe('$b')
      expect(names[25]).toBe('$z')
      expect(names[26]).toBe('$aa')
      expect(names[27]).toBe('$ab')
    })

    it('caches: same name returns same result', () => {
      const alloc = new VarAllocator(true)
      const first = alloc.alloc('x')
      const second = alloc.alloc('x')
      expect(first).toBe(second)
    })

    it('constant() is content-addressed: same value returns same result', () => {
      const alloc = new VarAllocator(true)
      const first = alloc.constant(42)
      const second = alloc.constant(42)
      expect(first).toBe(second)
    })

    it('different variables get different names', () => {
      const alloc = new VarAllocator(true)
      const a = alloc.alloc('foo')
      const b = alloc.alloc('bar')
      expect(a).not.toBe(b)
    })

    it('alloc, constant, and internal share the same sequential pool', () => {
      const alloc = new VarAllocator(true)
      const v = alloc.alloc('x')       // $a
      const c = alloc.constant(1)       // $b
      const i = alloc.internal('ret')   // $c
      expect(v).toBe('$a')
      expect(c).toBe('$b')
      expect(i).toBe('$c')
    })

    it('strips $ prefix from variable names', () => {
      const alloc = new VarAllocator(true)
      const a = alloc.alloc('$foo')
      const b = alloc.alloc('foo')
      expect(a).toBe(b) // same underlying name
    })
  })

  describe('no-mangle mode', () => {
    it('uses $<name> for user vars', () => {
      const alloc = new VarAllocator(false)
      expect(alloc.alloc('counter')).toBe('$counter')
    })

    it('uses $const_<value> for constants', () => {
      const alloc = new VarAllocator(false)
      expect(alloc.constant(10)).toBe('$const_10')
      expect(alloc.constant(-3)).toBe('$const_-3')
    })

    it('uses $<suffix> for internals', () => {
      const alloc = new VarAllocator(false)
      expect(alloc.internal('ret')).toBe('$ret')
      expect(alloc.internal('p0')).toBe('$p0')
    })
  })
})
