jest.mock(
  'vscode',
  () => {
    class MockPosition {
      constructor(
        public line: number,
        public character: number
      ) {}
    }

    class MockRange {
      constructor(
        public start: MockPosition,
        public end: MockPosition
      ) {}
    }

    class MockWorkspaceEdit {
      // keep parity with VSCode API enough for helper tests
      replace = jest.fn()
    }

    class MockCodeAction {
      diagnostics?: unknown[]
      isPreferred?: boolean
      edit?: MockWorkspaceEdit

      constructor(
        public title: string,
        public kind: string
      ) {}
    }

    return {
      CodeActionProvider: class {},
      CodeActionKind: {
        QuickFix: 'quickfix',
      },
      CodeAction: MockCodeAction,
      Position: MockPosition,
      Range: MockRange,
      WorkspaceEdit: MockWorkspaceEdit,
      languages: {
        registerCodeActionsProvider: jest.fn(),
      },
    }
  },
  { virtual: true }
)

import { getMigrationQuickFixesFromLine } from '../../editors/vscode/src/codeaction-helpers'

describe('getMigrationQuickFixesFromLine', () => {
  it('preserves existing selector type migration quick fix', () => {
    const line = 'fn foo() { type=zombie; }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(fixes).toHaveLength(1)
    expect(fixes[0]).toEqual(
      expect.objectContaining({
        startColumn: line.indexOf('zombie'),
        endColumn: line.indexOf('zombie') + 'zombie'.length,
        replacement: 'minecraft:zombie',
        title: 'Add namespace: type=minecraft:zombie',
      })
    )
  })

  it('adds scoreboard objective quick fix for score-like builtins', () => {
    const line = 'fn foo() { score(@s, "kills"); }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(
      fixes.some(
        fix =>
          fix.replacement === '#kills' &&
          fix.title === 'Convert objective string to #objective: #kills'
      )
    ).toBe(true)
  })

  it('adds resource quick fix for known quoted resources in supported resource argument slots', () => {
    const line = 'fn foo() { give(@s, "minecraft:diamond", 1); summon("minecraft:zombie", (0,0,0)); }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(
      fixes.some(
        fix =>
          fix.replacement === 'minecraft:diamond' && fix.title === 'Unquote resource: minecraft:diamond'
      )
    ).toBe(true)
    expect(
      fixes.some(
        fix =>
          fix.replacement === 'minecraft:zombie' && fix.title === 'Unquote resource: minecraft:zombie'
      )
    ).toBe(true)
  })

  it('does not offer resource quick fix when resource id is not known', () => {
    const line = 'fn foo() { give(@s, "minecraft:totally_unknown_resource", 1); }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(fixes.some(fix => fix.replacement === 'minecraft:totally_unknown_resource')).toBe(false)
  })

  it('does not offer migration quick fix for ordinary quoted strings', () => {
    const line = 'fn foo() { log(@s, "minecraft:diamond"); }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(fixes).toHaveLength(0)
  })

  it('handles multiple migration candidates in one line', () => {
    const line = 'fn foo() { scoreboard_set(@s, "timer", 3); give(@a, "minecraft:diamond", 1); }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(
      fixes.filter(fix => fix.replacement === '#timer').length,
    ).toBe(1)
    expect(
      fixes.filter(fix => fix.replacement === 'minecraft:diamond').length,
    ).toBe(1)
  })

  it('suggests fixed for deprecated float only in type-like contexts', () => {
    const line = 'fn scale(x: float) -> float { let y: float = x as float; log("float"); return y }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(fixes.filter(fix => fix.title === 'Replace deprecated float type with fixed')).toHaveLength(4)
    expect(fixes.every(fix => fix.replacement !== 'fixed' || fix.startColumn !== line.indexOf('"float"') + 1)).toBe(true)
  })

  it('suggests f-string conversion for legacy ${...} interpolation', () => {
    const line = 'fn foo() { tellraw(@a, "Score: ${score}"); }'
    const fixes = getMigrationQuickFixesFromLine(line)

    expect(fixes).toContainEqual(
      expect.objectContaining({
        replacement: 'f"Score: {score}"',
        title: 'Convert legacy ${...} interpolation to f-string',
      })
    )
  })

  it('does not rewrite current f-strings or literal dollars without legacy braces', () => {
    expect(getMigrationQuickFixesFromLine('tellraw(@a, f"Score: {score}")')).toHaveLength(0)
    expect(getMigrationQuickFixesFromLine('tellraw(@a, "Price: $5")')).toHaveLength(0)
  })
})
