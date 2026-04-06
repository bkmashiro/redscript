/**
 * Inlay Hint — walkBlock traversal tests
 *
 * Mirrors the walkBlock logic from lsp/server.ts and verifies that
 * let-binding hints are collected from every statement kind that can
 * contain a nested block.  Each test uses an explicit Stmt[] so we
 * are not at the mercy of the parser or TypeChecker.
 */

import type { Stmt, Block, TypeNode } from '../../ast/types'

// ---------------------------------------------------------------------------
// Mirror of collectLocals from lsp/server.ts
// ---------------------------------------------------------------------------

function collectLocals(stmts: Block): Map<string, TypeNode> {
  const map = new Map<string, TypeNode>()
  function walk(block: Block): void {
    for (const s of block) {
      if (s.kind === 'let' && s.type) map.set(s.name, s.type)
    }
  }
  walk(stmts)
  return map
}

// ---------------------------------------------------------------------------
// Mirror of walkBlock from lsp/server.ts (the fixed version)
// ---------------------------------------------------------------------------

function walkBlock(stmts: Stmt[]): string[] {
  const found: string[] = []

  function walk(block: Stmt[]): void {
    const locals = collectLocals(block as Block)
    for (const [name] of locals) found.push(name)

    for (const stmt of block) {
      if (stmt.kind === 'if' || stmt.kind === 'if_let_some') {
        walk(stmt.then)
        if (stmt.else_) walk(stmt.else_)
      } else if (
        stmt.kind === 'while' ||
        stmt.kind === 'do_while' ||
        stmt.kind === 'repeat' ||
        stmt.kind === 'for' ||
        stmt.kind === 'foreach' ||
        stmt.kind === 'for_range' ||
        stmt.kind === 'for_in_array' ||
        stmt.kind === 'for_each' ||
        stmt.kind === 'while_let_some' ||
        stmt.kind === 'as_block' ||
        stmt.kind === 'at_block' ||
        stmt.kind === 'as_at' ||
        stmt.kind === 'execute'
      ) {
        walk(stmt.body)
      } else if (stmt.kind === 'labeled_loop') {
        walk([stmt.body])
      } else if (stmt.kind === 'match') {
        for (const arm of stmt.arms) walk(arm.body)
      }
    }
  }

  walk(stmts)
  return found
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INT: TypeNode = { kind: 'named', name: 'int' }
const BOOL: TypeNode = { kind: 'named', name: 'bool' }

function letStmt(name: string, type: TypeNode = INT): Stmt {
  return { kind: 'let', name, type, init: { kind: 'int_lit', value: 0 } }
}

function trueExpr() {
  return { kind: 'bool_lit', value: true } as const
}

// ---------------------------------------------------------------------------
// Happy-path: top-level let
// ---------------------------------------------------------------------------

describe('walkBlock — top-level let declarations', () => {
  it('collects a single annotated let', () => {
    const stmts: Stmt[] = [letStmt('x', INT)]
    expect(walkBlock(stmts)).toContain('x')
  })

  it('ignores let without a type annotation', () => {
    const stmts: Stmt[] = [{ kind: 'let', name: 'y', init: { kind: 'int_lit', value: 1 } }]
    expect(walkBlock(stmts)).not.toContain('y')
  })
})

// ---------------------------------------------------------------------------
// if / else
// ---------------------------------------------------------------------------

describe('walkBlock — if statement', () => {
  it('recurses into then branch', () => {
    const stmts: Stmt[] = [{
      kind: 'if',
      cond: trueExpr(),
      then: [letStmt('inThen', BOOL)],
    }]
    expect(walkBlock(stmts)).toContain('inThen')
  })

  it('recurses into else branch', () => {
    const stmts: Stmt[] = [{
      kind: 'if',
      cond: trueExpr(),
      then: [],
      else_: [letStmt('inElse', INT)],
    }]
    expect(walkBlock(stmts)).toContain('inElse')
  })

  it('does not crash when else_ is absent', () => {
    const stmts: Stmt[] = [{
      kind: 'if',
      cond: trueExpr(),
      then: [letStmt('a', INT)],
    }]
    expect(() => walkBlock(stmts)).not.toThrow()
    expect(walkBlock(stmts)).toContain('a')
  })
})

// ---------------------------------------------------------------------------
// if_let_some
// ---------------------------------------------------------------------------

describe('walkBlock — if_let_some statement', () => {
  it('recurses into then branch', () => {
    const stmts: Stmt[] = [{
      kind: 'if_let_some',
      binding: 'v',
      init: { kind: 'int_lit', value: 0 },
      then: [letStmt('innerSome', INT)],
    }]
    expect(walkBlock(stmts)).toContain('innerSome')
  })

  it('recurses into else_ branch when present', () => {
    const stmts: Stmt[] = [{
      kind: 'if_let_some',
      binding: 'v',
      init: { kind: 'int_lit', value: 0 },
      then: [],
      else_: [letStmt('elseVar', BOOL)],
    }]
    expect(walkBlock(stmts)).toContain('elseVar')
  })
})

// ---------------------------------------------------------------------------
// while / do_while / repeat
// ---------------------------------------------------------------------------

describe('walkBlock — while variants', () => {
  it('recurses into while body', () => {
    const stmts: Stmt[] = [{
      kind: 'while',
      cond: trueExpr(),
      body: [letStmt('whileVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('whileVar')
  })

  it('recurses into do_while body', () => {
    const stmts: Stmt[] = [{
      kind: 'do_while',
      cond: trueExpr(),
      body: [letStmt('doVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('doVar')
  })

  it('recurses into repeat body', () => {
    const stmts: Stmt[] = [{
      kind: 'repeat',
      count: 3,
      body: [letStmt('repeatVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('repeatVar')
  })

  it('recurses into while_let_some body', () => {
    const stmts: Stmt[] = [{
      kind: 'while_let_some',
      binding: 'opt',
      init: { kind: 'int_lit', value: 0 },
      body: [letStmt('wlsVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('wlsVar')
  })
})

// ---------------------------------------------------------------------------
// for variants
// ---------------------------------------------------------------------------

describe('walkBlock — for variants', () => {
  it('recurses into for body', () => {
    const stmts: Stmt[] = [{
      kind: 'for',
      cond: trueExpr(),
      step: { kind: 'int_lit', value: 1 },
      body: [letStmt('forVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('forVar')
  })

  it('recurses into foreach body', () => {
    const stmts: Stmt[] = [{
      kind: 'foreach',
      binding: 'e',
      iterable: { kind: 'int_lit', value: 0 },
      body: [letStmt('feVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('feVar')
  })

  it('recurses into for_range body', () => {
    const stmts: Stmt[] = [{
      kind: 'for_range',
      varName: 'i',
      start: { kind: 'int_lit', value: 0 },
      end: { kind: 'int_lit', value: 10 },
      body: [letStmt('rangeVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('rangeVar')
  })

  it('recurses into for_in_array body', () => {
    const stmts: Stmt[] = [{
      kind: 'for_in_array',
      binding: 'item',
      arrayName: 'arr',
      lenExpr: { kind: 'int_lit', value: 5 },
      body: [letStmt('arrVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('arrVar')
  })

  it('recurses into for_each body', () => {
    const stmts: Stmt[] = [{
      kind: 'for_each',
      binding: 'item',
      array: { kind: 'int_lit', value: 0 },
      body: [letStmt('eachVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('eachVar')
  })
})

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------

describe('walkBlock — match statement', () => {
  it('recurses into each arm body', () => {
    const stmts: Stmt[] = [{
      kind: 'match',
      expr: { kind: 'int_lit', value: 0 },
      arms: [
        {
          pattern: { kind: 'PatWild' },
          body: [letStmt('arm0Var', INT)],
        },
        {
          pattern: { kind: 'PatWild' },
          body: [letStmt('arm1Var', BOOL)],
        },
      ],
    }]
    const found = walkBlock(stmts)
    expect(found).toContain('arm0Var')
    expect(found).toContain('arm1Var')
  })

  it('handles a match with zero arms without crashing', () => {
    const stmts: Stmt[] = [{
      kind: 'match',
      expr: { kind: 'int_lit', value: 0 },
      arms: [] as { pattern: import('../../ast/types').MatchPattern; body: Block }[],
    }]
    expect(() => walkBlock(stmts)).not.toThrow()
    expect(walkBlock(stmts)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// execute / as_block / at_block / as_at
// ---------------------------------------------------------------------------

describe('walkBlock — execute-context statements', () => {
  it('recurses into execute body', () => {
    const stmts: Stmt[] = [{
      kind: 'execute',
      subcommands: [],
      body: [letStmt('execVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('execVar')
  })

  it('recurses into as_block body', () => {
    const stmts: Stmt[] = [{
      kind: 'as_block',
      selector: { kind: '@a' },
      body: [letStmt('asVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('asVar')
  })

  it('recurses into at_block body', () => {
    const stmts: Stmt[] = [{
      kind: 'at_block',
      selector: { kind: '@a' },
      body: [letStmt('atVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('atVar')
  })

  it('recurses into as_at body', () => {
    const stmts: Stmt[] = [{
      kind: 'as_at',
      as_sel: { kind: '@a' },
      at_sel: { kind: '@a' },
      body: [letStmt('asAtVar', INT)],
    }]
    expect(walkBlock(stmts)).toContain('asAtVar')
  })
})

// ---------------------------------------------------------------------------
// labeled_loop
// ---------------------------------------------------------------------------

describe('walkBlock — labeled_loop statement', () => {
  it('recurses into the wrapped statement when it has a body', () => {
    const inner: Stmt = {
      kind: 'while',
      cond: trueExpr(),
      body: [letStmt('loopVar', INT)],
    }
    const stmts: Stmt[] = [{ kind: 'labeled_loop', label: 'outer', body: inner }]
    expect(walkBlock(stmts)).toContain('loopVar')
  })

  it('does not crash when wrapping a leaf statement', () => {
    const inner: Stmt = { kind: 'break' }
    const stmts: Stmt[] = [{ kind: 'labeled_loop', label: 'lbl', body: inner }]
    expect(() => walkBlock(stmts)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Deep nesting — let found at arbitrary depth
// ---------------------------------------------------------------------------

describe('walkBlock — deep nesting', () => {
  it('finds a let three levels deep (if > while > for_range)', () => {
    const deep: Stmt[] = [{
      kind: 'if',
      cond: trueExpr(),
      then: [{
        kind: 'while',
        cond: trueExpr(),
        body: [{
          kind: 'for_range',
          varName: 'i',
          start: { kind: 'int_lit', value: 0 },
          end: { kind: 'int_lit', value: 5 },
          body: [letStmt('deepVar', INT)],
        }],
      }],
    }]
    expect(walkBlock(deep)).toContain('deepVar')
  })

  it('collects lets from sibling branches independently', () => {
    const stmts: Stmt[] = [
      {
        kind: 'if',
        cond: trueExpr(),
        then: [letStmt('thenVar', INT)],
        else_: [letStmt('elseVar', BOOL)],
      },
      {
        kind: 'while',
        cond: trueExpr(),
        body: [letStmt('whileVar', INT)],
      },
    ]
    const found = walkBlock(stmts)
    expect(found).toContain('thenVar')
    expect(found).toContain('elseVar')
    expect(found).toContain('whileVar')
  })
})

// ---------------------------------------------------------------------------
// Edge cases — empty/leaf statements don't throw
// ---------------------------------------------------------------------------

describe('walkBlock — edge cases', () => {
  it('handles an empty statement list', () => {
    expect(() => walkBlock([])).not.toThrow()
    expect(walkBlock([])).toHaveLength(0)
  })

  it('ignores leaf statements without nested blocks', () => {
    const stmts: Stmt[] = [
      { kind: 'return' },
      { kind: 'break' },
      { kind: 'continue' },
      { kind: 'raw', cmd: '/say hi' },
    ]
    expect(() => walkBlock(stmts)).not.toThrow()
    expect(walkBlock(stmts)).toHaveLength(0)
  })
})
