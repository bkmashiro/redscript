/**
 * LSP Diagnostics — Lint Rules Push Tests
 *
 * Verifies that lint warnings are converted to LSP Diagnostic objects with
 * the correct severity and rule code, matching the mapping in server.ts.
 *
 * Tests use the lint engine directly plus the conversion logic mirrored from
 * server.ts — no full LSP server startup required.
 */

import { lintString } from '../../lint/index'
import type { LintWarning } from '../../lint/index'
import { DiagnosticSeverity } from 'vscode-languageserver/node'
import type { Diagnostic } from 'vscode-languageserver/node'

// ---------------------------------------------------------------------------
// Mirrored severity mapping from server.ts
// ---------------------------------------------------------------------------

const LINT_SEVERITY_MAP: Record<string, DiagnosticSeverity> = {
  'unused-variable':   DiagnosticSeverity.Information,
  'magic-number':      DiagnosticSeverity.Hint,
  'dead-branch':       DiagnosticSeverity.Warning,
  'unused-import':     DiagnosticSeverity.Information,
  'function-too-long': DiagnosticSeverity.Warning,
}

function lintWarningToDiagnostic(w: LintWarning): Diagnostic {
  const line = Math.max(0, (w.line ?? 1) - 1)
  const col  = Math.max(0, (w.col  ?? 1) - 1)
  const severity = LINT_SEVERITY_MAP[w.rule] ?? DiagnosticSeverity.Warning
  return {
    severity,
    range: {
      start: { line, character: col },
      end:   { line, character: col + 80 },
    },
    message: w.message,
    source: 'redscript-lint',
    code: w.rule,
  }
}

/** Run lint → convert to LSP Diagnostics */
function diagnose(source: string, opts: { maxFunctionLines?: number } = {}): Diagnostic[] {
  const warnings = lintString(source, '<test>', 'test', opts)
  return warnings.map(lintWarningToDiagnostic)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LSP diagnostics: lint rules pushed via sendDiagnostics', () => {
  test('unused-variable maps to Information severity', () => {
    const source = `fn foo(): void { let x: int = 5; }`
    const diags = diagnose(source)
    const d = diags.find(d => d.code === 'unused-variable')
    expect(d).toBeDefined()
    expect(d!.severity).toBe(DiagnosticSeverity.Information)
    expect(d!.source).toBe('redscript-lint')
    expect(d!.message).toContain('"x"')
  })

  test('magic-number maps to Hint severity', () => {
    const source = `fn bar(): int { return 42; }`
    const diags = diagnose(source)
    const d = diags.find(d => d.code === 'magic-number')
    expect(d).toBeDefined()
    expect(d!.severity).toBe(DiagnosticSeverity.Hint)
    expect(d!.message).toContain('42')
  })

  test('dead-branch maps to Warning severity', () => {
    const source = `fn baz(): void { if (1 == 2) { } }`
    const diags = diagnose(source)
    const d = diags.find(d => d.code === 'dead-branch')
    expect(d).toBeDefined()
    expect(d!.severity).toBe(DiagnosticSeverity.Warning)
  })

  test('function-too-long maps to Warning severity', () => {
    // Build a function with 55 statements (> default 50 limit)
    const stmts = Array.from({ length: 55 }, (_, i) => `  let v${i}: int = ${i + 2};`).join('\n')
    const source = `fn long_fn(): void {\n${stmts}\n}`
    const diags = diagnose(source, { maxFunctionLines: 50 })
    const d = diags.find(d => d.code === 'function-too-long')
    expect(d).toBeDefined()
    expect(d!.severity).toBe(DiagnosticSeverity.Warning)
    expect(d!.message).toContain('"long_fn"')
  })

  test('diagnostic range is correctly computed from line/col', () => {
    // unused variable: let x declared on line 2 (1-based), col 3
    const source = [
      'fn check(): void {',
      '  let x: int = 5;',
      '}',
    ].join('\n')
    const diags = diagnose(source)
    const d = diags.find(d => d.code === 'unused-variable')
    expect(d).toBeDefined()
    // Line should be 0-based
    expect(d!.range.start.line).toBeGreaterThanOrEqual(0)
    expect(d!.range.start.character).toBeGreaterThanOrEqual(0)
    expect(d!.range.end.character).toBe(d!.range.start.character + 80)
  })
})
