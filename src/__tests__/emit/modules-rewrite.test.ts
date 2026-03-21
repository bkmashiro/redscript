/**
 * Coverage for src/emit/modules.ts — rewriteCallsInProgram and rewriteStmt/rewriteExpr
 *
 * Targets the rewriting of various AST node types when module imports are resolved:
 * - while stmt with imported call
 * - for_range stmt with imported call
 * - match stmt with imported call in arm
 * - execute stmt with imported call in body
 * - let_destruct with imported call
 * - member/member_assign/index/index_assign expressions using imported fn
 * - array_lit, struct_lit, tuple_lit with imported fn
 * - invoke, assign, binary, unary expressions
 * - implBlock methods are rewritten
 * - return stmt with value using imported fn
 * - if stmt with else using imported fn
 */

import { compileModules } from '../../emit/modules'

function modules(main: string, libBody: string, namespace = 'rw') {
  return compileModules([
    {
      name: 'lib',
      source: `
        module lib;
        export fn helper(): int { return 42; }
        ${libBody}
      `,
    },
    {
      name: 'main',
      source: `
        import lib::helper;
        ${main}
      `,
    },
  ], { namespace })
}

// ── while stmt ─────────────────────────────────────────────────────────────

test('rewrite: while stmt with imported call in cond', () => {
  const result = modules(`
    fn entry(): int {
      while (helper() > 0) {
        return 1;
      }
      return 0;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── return stmt ─────────────────────────────────────────────────────────────

test('rewrite: return stmt with imported call', () => {
  const result = modules(`
    fn entry(): int { return helper(); }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── if with else ────────────────────────────────────────────────────────────

test('rewrite: if stmt with else using imported call', () => {
  const result = modules(`
    fn entry(): int {
      if (helper() > 0) {
        return 1;
      } else {
        return 0;
      }
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── binary / unary / assign ─────────────────────────────────────────────────

test('rewrite: binary expr with imported call', () => {
  const result = modules(`
    fn entry(): int {
      let x = helper() + helper();
      return x;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

test('rewrite: assign expr with imported call', () => {
  const result = modules(`
    fn entry(): int {
      let x = 0;
      x = helper();
      return x;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── member / member_assign ──────────────────────────────────────────────────

test('rewrite: member access with imported call', () => {
  const result = modules(`
    struct Wrapper { val: int }
    fn make(): Wrapper { return Wrapper { val: helper() }; }
    fn entry(): int {
      let w = make();
      return w.val;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── array_lit ─────────────────────────────────────────────────────────────

test('rewrite: array_lit with imported call', () => {
  const result = modules(`
    fn entry(): int {
      let arr: int[] = [helper(), helper()];
      return 0;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── for_range stmt ─────────────────────────────────────────────────────────

test('rewrite: for_range with imported call in bounds', () => {
  const result = modules(`
    fn entry(): int {
      let sum = 0;
      for i in 0..helper() {
        sum = sum + i;
      }
      return sum;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── struct_lit ─────────────────────────────────────────────────────────────

test('rewrite: struct_lit with imported call in field', () => {
  const result = modules(`
    struct Pair { a: int, b: int }
    fn entry(): int {
      let p = Pair { a: helper(), b: 0 };
      return p.a;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── impl block methods rewriting ───────────────────────────────────────────

test('rewrite: impl block method uses imported symbol', () => {
  const result = modules(`
    struct Calculator { offset: int }
    impl Calculator {
      fn compute(self): int {
        return self.offset + helper();
      }
    }
    fn entry(): int {
      let c = Calculator { offset: 10 };
      return c.compute();
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry') || f.path.includes('compute'))).toBe(true)
})

// ── match stmt ────────────────────────────────────────────────────────────

test('rewrite: match stmt with imported call in arm body', () => {
  const result = modules(`
    enum Status { Active, Inactive }
    fn entry(): int {
      let s: Status = Status::Active;
      match s {
        Status::Active => { return helper(); }
        Status::Inactive => { return 0; }
      }
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── execute stmt ─────────────────────────────────────────────────────────

test('rewrite: execute block with imported call', () => {
  const result = modules(`
    fn entry(): int {
      execute as @a run {
        let x = helper();
      }
      return 0;
    }
  `, '')
  expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
})

// ── 3 modules — pack.mcmeta only emitted once ─────────────────────────────

test('pack.mcmeta emitted only once in multi-module output', () => {
  const result = compileModules([
    { name: 'a', source: 'module a;\nexport fn fa(): int { return 1; }' },
    { name: 'b', source: 'module b;\nexport fn fb(): int { return 2; }' },
    { name: 'main', source: 'import a::fa;\nimport b::fb;\nfn entry(): int { return fa() + fb(); }' },
  ], { namespace: 'multi' })

  const packMeta = result.files.filter(f => f.path === 'pack.mcmeta')
  expect(packMeta).toHaveLength(1)
})

// ── @tick and @load functions in modules ──────────────────────────────────

test('modules with @tick and @load functions emit tick/load tags', () => {
  const result = compileModules([
    {
      name: 'game',
      source: `
        module game;
        @tick
        fn on_tick(): void { raw("say tick"); }
      `,
    },
  ], { namespace: 'ticked' })

  const tickTag = result.files.find(f => f.path.includes('tick.json'))
  expect(tickTag).toBeDefined()
})
