/**
 * Tests for the RedScript test framework (runner.test.ts)
 *
 * Covers:
 * - @test decorator parsing
 * - assert builtin compilation output
 * - test runner command arguments
 * - dry-run mode output
 */

import { compile } from '../../emit/compile'
import { parseTestFunctions, dryRunTests } from '../../testing/runner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// ---------------------------------------------------------------------------
// 1. @test decorator parsing
// ---------------------------------------------------------------------------

describe('@test decorator parsing', () => {
  test('parses single @test function with label', () => {
    const source = `
      @test("加法基本测试")
      fn test_add(): void {
        let result: int = 1 + 2;
      }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(1)
    expect(tests[0].fnName).toBe('test_add')
    expect(tests[0].label).toBe('加法基本测试')
  })

  test('parses multiple @test functions', () => {
    const source = `
      @test("first test")
      fn test_one(): void { }

      @test("second test")
      fn test_two(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(2)
    expect(tests[0].label).toBe('first test')
    expect(tests[1].label).toBe('second test')
  })

  test('returns empty array when no @test functions', () => {
    const source = `
      fn normal_fn(): void { }

      @load
      fn on_load(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(0)
  })

  test('@test without label defaults to empty string', () => {
    const source = `
      @test("")
      fn test_no_label(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(1)
    expect(tests[0].label).toBe('')
  })

  test('only @test functions are returned, not @load/@tick', () => {
    const source = `
      @load
      fn on_load(): void { }

      @test("my test")
      fn test_thing(): void { }

      fn helper(): void { }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(1)
    expect(tests[0].fnName).toBe('test_thing')
  })
})

// ---------------------------------------------------------------------------
// 2. assert builtin compilation output
// ---------------------------------------------------------------------------

describe('assert builtin compilation', () => {
  test('assert compiles without errors', () => {
    const source = `
      @keep
      fn test_assert(): void {
        let x: int = 1;
        assert(x == 1);
      }
    `
    expect(() => compile(source, { namespace: 'test' })).not.toThrow()
  })

  test('assert emits execute unless score run tellraw on false branch', () => {
    const source = `
      @keep
      fn test_assert(): void {
        let x: int = 1;
        assert(x == 1);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test_assert.mcfunction')
    expect(fn).toBeDefined()
    // Should contain execute unless score ... matches 1 run tellraw
    expect(fn).toMatch(/execute unless score .+ matches 1 run tellraw @a/)
  })

  test('assert emits scoreboard add for rs.test_failed counter', () => {
    const source = `
      @keep
      fn test_assert(): void {
        let x: int = 2;
        assert(x == 2);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test_assert.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('rs.test_failed')
    expect(fn).toContain('rs.meta')
  })

  test('assert with boolean expression compiles correctly', () => {
    const source = `
      @keep
      fn test_bool_assert(): void {
        let a: int = 5;
        let b: int = 5;
        assert(a == b);
      }
    `
    expect(() => compile(source, { namespace: 'test' })).not.toThrow()
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'test_bool_assert.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toMatch(/execute unless score .+ matches 1 run tellraw @a/)
  })
})

// ---------------------------------------------------------------------------
// 3. Test runner command arguments / dry-run mode
// ---------------------------------------------------------------------------

describe('dry-run mode', () => {
  test('dryRunTests returns ok:true for valid test source', () => {
    const source = `
      @test("basic test")
      fn test_basic(): void {
        let x: int = 1;
        assert(x == 1);
      }
    `
    const tests = parseTestFunctions(source)
    const result = dryRunTests(source, 'test.mcrs', 'test', tests)
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  test('dryRunTests returns ok:false for invalid source', () => {
    // Source with a type error
    const source = `
      @test("bad test")
      fn test_bad(): void {
        let x: string = 42;
        assert(x == "hello");
      }
    `
    const tests = parseTestFunctions(source)
    const result = dryRunTests(source, 'test.mcrs', 'test', tests)
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  test('dryRunTests with multiple tests returns ok when all valid', () => {
    const source = `
      @test("test one")
      fn test_one(): void {
        let a: int = 1;
        assert(a == 1);
      }

      @test("test two")
      fn test_two(): void {
        let b: int = 2;
        assert(b == 2);
      }
    `
    const tests = parseTestFunctions(source)
    expect(tests).toHaveLength(2)
    const result = dryRunTests(source, 'test.mcrs', 'test', tests)
    expect(result.ok).toBe(true)
  })
})
