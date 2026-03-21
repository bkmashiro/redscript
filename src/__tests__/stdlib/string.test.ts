/**
 * Tests for stdlib/strings.mcrs — string manipulation helpers.
 *
 * NOTE: These tests verify compilation output structure only.
 * No Minecraft server is required. Real runtime behaviour (NBT storage
 * reads/writes) depends on the target server having rs:strings populated
 * correctly before these functions are called.
 *
 * Key limitation: MC 1.21.4 has very limited string operation support.
 * See individual function docs in strings.mcrs for details.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const STRINGS_STDLIB = path.join(__dirname, '../../stdlib/strings.mcrs')
const stringsSrc = fs.readFileSync(STRINGS_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(stringsSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

function getFn(files: { path: string; content: string }[], fnName: string): string {
  // Match exact name or specialized variants (e.g. str_concat__const_0_0)
  const f = files.find(f => f.path.endsWith(`/${fnName}.mcfunction`))
    ?? files.find(f => {
      const base = f.path.split('/').pop()!
      return base === `${fnName}.mcfunction` || base.startsWith(`${fnName}__`)
    })
  if (!f) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found. Files:\n${paths}`)
  }
  return f.content
}

// ── Compilation ─────────────────────────────────────────────────────────────

describe('stdlib/strings.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      const result = compile(stringsSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  // ── str_len ──────────────────────────────────────────────────────────────

  describe('str_len', () => {
    test('str_len function is emitted', () => {
      const files = compileWith(`@keep fn t() -> int { return str_len("A"); }`)
      expect(files.some(f => f.path.includes('str_len'))).toBe(true)
    })

    test('str_len delegates to data_get helper (reads NBT storage)', () => {
      const files = compileWith(`@keep fn t() -> int { return str_len("A"); }`)
      // data_get builtin compiles into a helper function call
      // The helper itself uses: execute store result score ... run data get storage rs:strings ...
      const allContent = files.map(f => f.content).join('\n')
      // Either a direct data get storage command or a call to the data_get helper function
      const usesDataGet = allContent.includes('data get storage') || allContent.includes('function test:data_get')
      expect(usesDataGet).toBe(true)
    })

    test('str_len compiles for any string key', () => {
      const files = compileWith(`@keep fn t() -> int { return str_len("MyField"); }`)
      expect(files.some(f => f.path.includes('str_len'))).toBe(true)
    })

    test('str_len return value is passed through scoreboard', () => {
      const files = compileWith(`@keep fn t() -> int { return str_len("A"); }`)
      const allContent = files.map(f => f.content).join('\n')
      // Result propagated via scoreboard operations
      expect(allContent).toContain('scoreboard players operation')
    })
  })

  // ── str_concat ───────────────────────────────────────────────────────────

  describe('str_concat', () => {
    test('str_concat function is emitted', () => {
      const files = compileWith(`@keep fn t() { str_concat("A", "B"); }`)
      expect(files.some(f => f.path.includes('str_concat'))).toBe(true)
    })

    test('str_concat initialises Result as an empty list', () => {
      const files = compileWith(`@keep fn t() { str_concat("A", "B"); }`)
      const body = getFn(files, 'str_concat')
      expect(body).toContain('data modify storage rs:strings Result set value []')
    })

    test('str_concat appends two elements to Result list', () => {
      const files = compileWith(`@keep fn t() { str_concat("A", "B"); }`)
      const body = getFn(files, 'str_concat')
      // Two append operations expected
      const appendCount = (body.match(/data modify storage rs:strings Result append from/g) || []).length
      expect(appendCount).toBe(2)
    })

    test('str_concat generates data modify commands for storage', () => {
      const files = compileWith(`@keep fn t() { str_concat("X", "Y"); }`)
      const allContent = files.map(f => f.content).join('\n')
      expect(allContent).toContain('data modify storage rs:strings')
    })
  })

  // ── str_contains ─────────────────────────────────────────────────────────

  describe('str_contains', () => {
    test('str_contains function is emitted', () => {
      const files = compileWith(`@keep fn t() -> int { return str_contains("A", "sub"); }`)
      expect(files.some(f => f.path.includes('str_contains'))).toBe(true)
    })

    test('str_contains returns 0 (documented MC 1.21.4 limitation)', () => {
      const files = compileWith(`@keep fn t() -> int { return str_contains("A", "sub"); }`)
      // str_contains always returns 0; compiler may constant-fold this
      const body = getFn(files, 'str_contains')
      // Either constant-folded (sets return to 0) or returns scoreboard 0
      expect(body).toContain('0')
    })

    test('str_contains result can be stored and compared', () => {
      const files = compileWith(`
        @keep fn t() -> int {
          let found: int = str_contains("Text", "sub");
          if (found == 1) { return 1; }
          return 0;
        }
      `)
      expect(files.length).toBeGreaterThan(0)
    })
  })

  // ── str_slice ─────────────────────────────────────────────────────────────

  describe('str_slice', () => {
    test('str_slice function is emitted', () => {
      const files = compileWith(`@keep fn t() { str_slice("A", 0, 5); }`)
      expect(files.some(f => f.path.includes('str_slice'))).toBe(true)
    })

    test('str_slice emits data modify ... set string storage command (MC 1.20.2+)', () => {
      const files = compileWith(`@keep fn t() { str_slice("A", 0, 5); }`)
      const body = getFn(files, 'str_slice')
      expect(body).toContain('data modify storage rs:strings Result set string storage rs:strings')
    })

    test('str_slice writes to rs:strings.Result', () => {
      const files = compileWith(`@keep fn t() { str_slice("A", 2, 8); }`)
      const body = getFn(files, 'str_slice')
      expect(body).toContain('rs:strings Result')
    })

    test('str_slice compiles with int variables as start/end', () => {
      const files = compileWith(`
        @keep fn t() {
          let start: int = 2;
          let end: int = 7;
          str_slice("A", start, end);
        }
      `)
      expect(files.some(f => f.path.includes('str_slice'))).toBe(true)
    })
  })

  // ── Combined usage ────────────────────────────────────────────────────────

  describe('combined string operations', () => {
    test('str_len and str_concat compile together', () => {
      const files = compileWith(`
        @keep fn process() {
          let len: int = str_len("Input");
          str_concat("Hello", "World");
        }
      `)
      expect(files.length).toBeGreaterThan(0)
    })

    test('str_slice after str_len compiles', () => {
      const files = compileWith(`
        @keep fn excerpt() {
          let len: int = str_len("A");
          str_slice("A", 0, len);
        }
      `)
      expect(files.length).toBeGreaterThan(0)
    })

    test('all four string functions referenced in one fn compile', () => {
      expect(() => {
        compileWith(`
          @keep fn test_all() {
            let len: int = str_len("A");
            str_concat("A", "B");
            let has: int = str_contains("A", "x");
            str_slice("A", 0, 4);
          }
        `)
      }).not.toThrow()
    })
  })
})
