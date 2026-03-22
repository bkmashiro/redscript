/**
 * Tests for Execute Chain Optimization
 *
 * MC allows chaining execute conditions:
 *   execute if A run execute if B run X
 * →  execute if A if B run X
 *
 * This reduces command parsing overhead and improves TPS.
 */

import { flattenExecute } from '../../emit'
import { emit } from '../../emit'
import type { LIRModule, LIRFunction, LIRInstr } from '../../lir/types'
import { McVersion } from '../../types/mc-version'

// ---------------------------------------------------------------------------
// Unit tests: flattenExecute()
// ---------------------------------------------------------------------------

describe('flattenExecute()', () => {
  test('double-level if: merges nested execute if into single execute', () => {
    const input = 'execute if score A rs.vars matches 1 run execute if score B rs.vars matches 1 run function rs:foo'
    const expected = 'execute if score A rs.vars matches 1 if score B rs.vars matches 1 run function rs:foo'
    expect(flattenExecute(input)).toBe(expected)
  })

  test('triple-level if: recursively merges three levels into one execute', () => {
    const input =
      'execute if score A rs.vars matches 1 run execute if score B rs.vars matches 1 run execute if score C rs.vars matches 1 run function rs:bar'
    const expected =
      'execute if score A rs.vars matches 1 if score B rs.vars matches 1 if score C rs.vars matches 1 run function rs:bar'
    expect(flattenExecute(input)).toBe(expected)
  })

  test('if + unless mix: does NOT merge (semantics differ)', () => {
    const input = 'execute if score A rs.vars matches 1 run execute unless score B rs.vars matches 1 run function rs:baz'
    // Should remain unchanged — "unless" is not the same as another "if"
    expect(flattenExecute(input)).toBe(input)
  })

  test('non-execute command is returned unchanged', () => {
    const input = 'scoreboard players set $x rs.vars 42'
    expect(flattenExecute(input)).toBe(input)
  })

  test('plain execute without nested run execute is returned unchanged', () => {
    const input = 'execute if score A rs.vars matches 1 run function rs:simple'
    expect(flattenExecute(input)).toBe(input)
  })

  test('execute run execute with "as" subcmd is NOT merged (not an if clause)', () => {
    const input = 'execute if score A rs.vars matches 1 run execute as @a run function rs:ctx'
    // Inner starts with "as", not "if" — should not be merged
    expect(flattenExecute(input)).toBe(input)
  })

  test('execute if score using score comparison: merges correctly', () => {
    const input = 'execute if score $a rs.vars = $b rs.vars run execute if score $c rs.vars = $d rs.vars run function rs:check'
    const expected = 'execute if score $a rs.vars = $b rs.vars if score $c rs.vars = $d rs.vars run function rs:check'
    expect(flattenExecute(input)).toBe(expected)
  })

  test('four-level nesting: recursively flattens all levels', () => {
    const input =
      'execute if score A o matches 1 run execute if score B o matches 2 run execute if score C o matches 3 run execute if score D o matches 4 run function ns:deep'
    const expected =
      'execute if score A o matches 1 if score B o matches 2 if score C o matches 3 if score D o matches 4 run function ns:deep'
    expect(flattenExecute(input)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// Integration tests: actual compilation output
// ---------------------------------------------------------------------------

describe('execute chain optimization: compilation output', () => {
  function buildModule(instructions: LIRInstr[]): LIRModule {
    const fn: LIRFunction = {
      name: 'test_fn',
      instructions,
      params: [],
      returnType: 'void',
    }
    return {
      functions: [fn],
      objective: 'rs.vars',
      namespace: 'rs',
    }
  }

  function getFile(files: { path: string; content: string }[], pathSubstr: string): string {
    const f = files.find(f => f.path.includes(pathSubstr))
    if (!f) throw new Error(`Missing file matching: ${pathSubstr}\nFiles: ${files.map(f => f.path).join(', ')}`)
    return f.content
  }

  test('call_if_matches + nested raw execute if: flattened in emitted output', () => {
    // Emit a raw execute that already contains a nested execute if to verify post-processing
    const instructions: LIRInstr[] = [
      {
        kind: 'raw',
        cmd: 'execute if score $cond rs.vars matches 1 run execute if score $cond2 rs.vars matches 2 run function rs:target',
      },
    ]
    const files = emit(buildModule(instructions), { namespace: 'rs' })
    const content = getFile(files, 'test_fn.mcfunction')
    expect(content).toContain(
      'execute if score $cond rs.vars matches 1 if score $cond2 rs.vars matches 2 run function rs:target',
    )
    expect(content).not.toContain('run execute if')
  })
})
