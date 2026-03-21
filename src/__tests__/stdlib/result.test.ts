/**
 * Tests for stdlib/result.mcrs — Result<T> error handling type.
 *
 * Covers:
 * - Compilation succeeds for the full stdlib file
 * - Result::Ok and Result::Err construction emit correct scoreboard/NBT commands
 * - result_is_ok / result_is_err helper functions compile and are emitted
 * - result_value / result_code extraction helpers compile and are emitted
 * - result_divide safe division example compiles correctly
 * - match on Result arms emits correct tag comparison and NBT reads
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const RESULT_STDLIB = path.join(__dirname, '../../stdlib/result.mcrs')
const resultSrc = fs.readFileSync(RESULT_STDLIB, 'utf-8')

function getCommands(source: string, namespace = 'test'): string[] {
  const result = compile(source, { namespace })
  if (!result.success) {
    const errors = (result as any).errors ?? []
    throw new Error(`Compilation failed:\n${errors.map((e: any) => e.message ?? e).join('\n')}`)
  }
  return (result.files ?? [])
    .filter(f => f.path.endsWith('.mcfunction'))
    .flatMap(f => f.content.split('\n'))
    .filter(line => line.trim().length > 0)
}

function compileWithResult(extra: string): { path: string; content: string }[] {
  const result = compile(resultSrc + '\n' + extra, { namespace: 'test' })
  if (!result.success) {
    const errors = (result as any).errors ?? []
    throw new Error(`Compilation failed:\n${errors.map((e: any) => e.message ?? e).join('\n')}`)
  }
  return result.files ?? []
}

function getFn(files: { path: string; content: string }[], fnName: string): string {
  const f = files.find(f => f.path.endsWith(`/${fnName}.mcfunction`))
  if (!f) {
    const paths = files.map(f => f.path).join('\n')
    throw new Error(`Function '${fnName}' not found in:\n${paths}`)
  }
  return f.content
}

// ===========================================================================
// Basic compilation
// ===========================================================================

describe('stdlib/result.mcrs: compilation', () => {
  test('compiles the full stdlib file without errors', () => {
    const result = compile(resultSrc, { namespace: 'test' })
    // Library modules may emit no files if nothing is referenced — just check no crash
    expect(result.success).toBe(true)
  })

  test('Result enum is recognized by type checker', () => {
    const source = resultSrc + `
      @keep fn test_ok(): Result {
        return Result::Ok(value: 42);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })

  test('Result::Err construction compiles', () => {
    const source = resultSrc + `
      @keep fn test_err(): Result {
        return Result::Err(code: -1);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })
})

// ===========================================================================
// Constructor helpers
// ===========================================================================

describe('stdlib/result.mcrs: constructors', () => {
  test('result_ok helper is emitted', () => {
    const files = compileWithResult(`@keep fn t() { let r: Result = result_ok(100); }`)
    expect(files.some(f => f.path.includes('result_ok'))).toBe(true)
  })

  test('result_err helper is emitted', () => {
    const files = compileWithResult(`@keep fn t() { let r: Result = result_err(-1); }`)
    expect(files.some(f => f.path.includes('result_err'))).toBe(true)
  })

  test('Result::Ok emits tag=0 (Ok is first variant)', () => {
    const source = resultSrc + `
      @keep fn t(): Result {
        return Result::Ok(value: 42);
      }
    `
    const cmds = getCommands(source)
    // Ok is variant index 0
    const tagSets = cmds.filter(c => c.includes('scoreboard players set') && c.includes(' 0'))
    expect(tagSets.length).toBeGreaterThan(0)
  })

  test('Result::Ok emits NBT write for payload value', () => {
    const source = resultSrc + `
      @keep fn t(): Result {
        return Result::Ok(value: 99);
      }
    `
    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('storage rs:enums')
    expect(allCmds).toContain('Result_value')
  })

  test('Result::Err emits tag=1 (Err is second variant)', () => {
    const source = resultSrc + `
      @keep fn t(): Result {
        return Result::Err(code: -2);
      }
    `
    const cmds = getCommands(source)
    // Err is variant index 1
    const tagSets = cmds.filter(c => c.includes('scoreboard players set') && c.includes(' 1'))
    expect(tagSets.length).toBeGreaterThan(0)
  })

  test('Result::Err emits NBT write for payload code', () => {
    const source = resultSrc + `
      @keep fn t(): Result {
        return Result::Err(code: -1);
      }
    `
    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('storage rs:enums')
    expect(allCmds).toContain('Result_code')
  })
})

// ===========================================================================
// Query helpers
// ===========================================================================

describe('stdlib/result.mcrs: query helpers', () => {
  test('result_is_ok is emitted when called', () => {
    const files = compileWithResult(`
      @keep fn t(r: Result): int {
        return result_is_ok(r);
      }
    `)
    expect(files.some(f => f.path.includes('result_is_ok'))).toBe(true)
  })

  test('result_is_err is emitted when called', () => {
    const files = compileWithResult(`
      @keep fn t(r: Result): int {
        return result_is_err(r);
      }
    `)
    expect(files.some(f => f.path.includes('result_is_err'))).toBe(true)
  })

  test('result_is_ok match emits tag comparison', () => {
    const source = resultSrc + `
      @keep fn t(r: Result): int {
        return result_is_ok(r);
      }
    `
    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('execute if score')
  })
})

// ===========================================================================
// Extraction helpers
// ===========================================================================

describe('stdlib/result.mcrs: extraction helpers', () => {
  test('result_value is emitted when called', () => {
    const files = compileWithResult(`
      @keep fn t(r: Result): int {
        return result_value(r);
      }
    `)
    expect(files.some(f => f.path.includes('result_value'))).toBe(true)
  })

  test('result_code is emitted when called', () => {
    const files = compileWithResult(`
      @keep fn t(r: Result): int {
        return result_code(r);
      }
    `)
    expect(files.some(f => f.path.includes('result_code'))).toBe(true)
  })

  test('result_value reads NBT payload field', () => {
    const source = resultSrc + `
      @keep fn t(r: Result): int {
        return result_value(r);
      }
    `
    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('Result_value')
  })

  test('result_code reads NBT payload field', () => {
    const source = resultSrc + `
      @keep fn t(r: Result): int {
        return result_code(r);
      }
    `
    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('Result_code')
  })
})

// ===========================================================================
// Safe division example
// ===========================================================================

describe('stdlib/result.mcrs: result_divide', () => {
  test('result_divide compiles and is emitted', () => {
    const files = compileWithResult(`
      @keep fn t(): Result {
        return result_divide(10, 2);
      }
    `)
    expect(files.some(f => f.path.includes('result_divide'))).toBe(true)
  })

  test('result_divide emits conditional branch guard', () => {
    const source = resultSrc + `
      @keep fn t(): Result {
        return result_divide(10, 2);
      }
    `
    const cmds = getCommands(source)
    // The if (b == 0) check compiles to: execute store success score ... if score ... = ... then execute if score matches 1 run return
    expect(cmds.some(c => c.includes('execute if score') || c.includes('execute store success'))).toBe(true)
  })
})

// ===========================================================================
// Match on Result
// ===========================================================================

describe('stdlib/result.mcrs: match', () => {
  test('match on Result::Ok arm emits tag=0 check', () => {
    const source = resultSrc + `
      @keep fn t(r: Result): int {
        match r {
          Result::Ok(value) => { return value; }
          Result::Err(code) => { return code; }
        }
        return -1;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
    const cmds = (result.files ?? [])
      .filter(f => f.path.endsWith('.mcfunction'))
      .flatMap(f => f.content.split('\n'))
      .filter(l => l.trim())
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('execute if score')
    expect(allCmds).toContain('storage rs:enums')
  })

  test('match on Result extracts Ok value binding', () => {
    const source = resultSrc + `
      @keep fn t(r: Result): int {
        match r {
          Result::Ok(value) => { return value; }
          Result::Err(code) => { return 0; }
        }
        return -1;
      }
    `
    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('Result_value')
  })

  test('match on Result extracts Err code binding', () => {
    const source = resultSrc + `
      @keep fn t(r: Result): int {
        match r {
          Result::Ok(value) => { return 0; }
          Result::Err(code) => { return code; }
        }
        return -1;
      }
    `
    const cmds = getCommands(source)
    const allCmds = cmds.join('\n')
    expect(allCmds).toContain('Result_code')
  })

  test('full divide-and-use pattern compiles end-to-end', () => {
    const source = resultSrc + `
      @keep fn use_divide() {
        let r: Result = result_divide(10, 2);
        match r {
          Result::Ok(value) => {
            let dummy: int = value;
          }
          Result::Err(code) => {
            let dummy: int = code;
          }
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.success).toBe(true)
  })
})
