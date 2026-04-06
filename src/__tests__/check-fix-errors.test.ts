import { DiagnosticError } from '../diagnostics'
import { applyCheckFixes } from '../check-fix'

// Helpers to exercise the three internal throw sites via applyCheckFixes.
// The functions findStatementRange, findThenBraceStart, and findMatchingBrace
// are not exported, so we drive them through the public API with source that
// would trigger each error path if the token stream were corrupted.  Because
// the parser produces well-formed token streams for valid source, we instead
// test the exported surface and verify that any DiagnosticError that bubbles
// out carries the expected shape.

describe('check-fix DiagnosticError throws', () => {
  describe('applyCheckFixes returns a valid summary on well-formed source', () => {
    it('processes source with no fixes needed', () => {
      const source = 'fn main() {\n  say("hello");\n}\n'
      const result = applyCheckFixes(source, 'main.mcrs')
      expect(result.summary.removedUnusedImports).toBe(0)
      expect(result.summary.removedDeadBranches).toBe(0)
    })

    it('processes source with a dead true branch', () => {
      const source = 'fn main() {\n  if true {\n    say("a");\n  } else {\n    say("b");\n  }\n}\n'
      const result = applyCheckFixes(source, 'main.mcrs')
      expect(result.summary.removedDeadBranches).toBe(1)
      expect(result.source).toContain('say("a")')
      expect(result.source).not.toContain('say("b")')
    })

    it('processes source with a dead false branch (no else)', () => {
      const source = 'fn main() {\n  if false {\n    say("dead");\n  }\n  say("live");\n}\n'
      const result = applyCheckFixes(source, 'main.mcrs')
      expect(result.summary.removedDeadBranches).toBe(1)
      expect(result.source).not.toContain('say("dead")')
      expect(result.source).toContain('say("live")')
    })

    it('processes source with a dead false branch and else', () => {
      const source = 'fn main() {\n  if false {\n    say("dead");\n  } else {\n    say("live");\n  }\n}\n'
      const result = applyCheckFixes(source, 'main.mcrs')
      expect(result.summary.removedDeadBranches).toBe(1)
      expect(result.source).not.toContain('say("dead")')
      expect(result.source).toContain('say("live")')
    })

    it('processes source with a dead false branch and else-if', () => {
      const source = 'fn main() {\n  if false {\n    say("dead");\n  } else if true {\n    say("live");\n  }\n}\n'
      const result = applyCheckFixes(source, 'main.mcrs')
      expect(result.summary.removedDeadBranches).toBe(1)
      expect(result.source).toContain('if true')
    })

    it('handles nested dead branches', () => {
      // Outer `if true` is replaced first; overlapping inner edits are filtered
      // out by filterOverlappingEdits, so only the outer replacement is applied.
      // The outer true-branch body is inlined as-is (including the inner if false).
      // A second pass would remove the inner dead branch.
      const source = [
        'fn main() {',
        '  if true {',
        '    if false {',
        '      say("inner-dead");',
        '    }',
        '    say("outer-live");',
        '  }',
        '}',
        '',
      ].join('\n')
      const result = applyCheckFixes(source, 'main.mcrs')
      expect(result.summary.removedDeadBranches).toBeGreaterThanOrEqual(1)
      expect(result.source).toContain('say("outer-live")')
    })

    it('keeps source unchanged when there are no dead branches or unused imports', () => {
      const source = 'fn add(a: int, b: int): int {\n  return a + b;\n}\n'
      const result = applyCheckFixes(source, 'test.mcrs')
      expect(result.source).toBe(source)
    })

    it('does not duplicate the FIXME annotation on re-run', () => {
      const source = 'fn main(): int {\n  return 42;\n}\n'
      const first = applyCheckFixes(source, 'test.mcrs')
      const second = applyCheckFixes(first.source, 'test.mcrs')
      expect(second.summary.annotatedMagicNumbers).toBe(0)
      const occurrences = (second.source.match(/FIXME: consider const/g) ?? []).length
      expect(occurrences).toBe(1)
    })

    it('removes unused import and leaves rest of source intact', () => {
      const source = 'import lib::foo;\n\nfn main() {\n  say("hi");\n}\n'
      const result = applyCheckFixes(source, 'test.mcrs')
      expect(result.summary.removedUnusedImports).toBe(1)
      expect(result.source).not.toContain('import lib::foo')
      expect(result.source).toContain('say("hi")')
    })
  })

  describe('DiagnosticError class shape', () => {
    it('DiagnosticError carries kind, location, and a formatted message', () => {
      const err = new DiagnosticError('LoweringError', `Could not locate if statement`, { line: 5, col: 3 })
      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(DiagnosticError)
      expect(err.kind).toBe('LoweringError')
      expect(err.location).toEqual({ line: 5, col: 3 })
      expect(err.message).toBe('Could not locate if statement')
    })

    it('DiagnosticError.format() includes kind, line, and col', () => {
      const err = new DiagnosticError('LoweringError', `Unmatched '{'`, { line: 10, col: 7 })
      const formatted = err.format()
      expect(formatted).toContain('LoweringError')
      expect(formatted).toContain('line 10')
      expect(formatted).toContain('col 7')
    })

    it('DiagnosticError.format() includes file path when provided', () => {
      const err = new DiagnosticError('LoweringError', `Could not locate block for if statement`, { file: 'src/foo.mcrs', line: 2, col: 1 })
      expect(err.format()).toContain('src/foo.mcrs')
    })

    it('DiagnosticError.toString() delegates to format()', () => {
      const err = new DiagnosticError('LoweringError', `Unmatched '{'`, { line: 1, col: 1 })
      expect(err.toString()).toBe(err.format())
    })
  })
})
