/**
 * Module import system tests
 *
 * Tests for `import <name>` whole-module file imports, where:
 * - player_utils.mcrs declares `module player_utils`
 * - main.mcrs uses `import player_utils` (no `::` — imports the whole module by file)
 *
 * Unlike the Phase 5b `compileModules` API which handles multi-module datapack
 * compilation, these tests verify that the `compile()` function can resolve
 * and merge whole-module imports at the file level.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { compile } from '../../emit/compile'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse()
}

/** Create a temporary directory with given files, return its path. */
function makeTmpDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-module-'))
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf-8')
  }
  return dir
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// Parser: `import <name>` (whole-module) is parsed correctly
// ---------------------------------------------------------------------------

describe('parser: import <name> (whole-module)', () => {
  test('parses `import player_utils;` as whole-module import (no symbol)', () => {
    const ast = parse(`
      import player_utils;
      fn main() { }
    `)
    expect(ast.imports).toHaveLength(1)
    const imp = ast.imports[0]
    expect(imp.moduleName).toBe('player_utils')
    expect(imp.symbol).toBeUndefined()
  })

  test('parses `import player_utils` without semicolon', () => {
    const ast = parse(`
      import player_utils
      fn main() { }
    `)
    expect(ast.imports).toHaveLength(1)
    expect(ast.imports[0].symbol).toBeUndefined()
  })

  test('parses `import math::sin;` as symbol import (existing behaviour preserved)', () => {
    const ast = parse(`
      module main;
      import math::sin;
    `)
    const imp = ast.imports[0]
    expect(imp.moduleName).toBe('math')
    expect(imp.symbol).toBe('sin')
  })

  test('parses `import math::*;` as wildcard symbol import (existing behaviour preserved)', () => {
    const ast = parse(`
      import math::*;
    `)
    const imp = ast.imports[0]
    expect(imp.symbol).toBe('*')
  })

  test('multiple whole-module imports', () => {
    const ast = parse(`
      import player_utils;
      import math_utils;
      fn main() { }
    `)
    expect(ast.imports).toHaveLength(2)
    expect(ast.imports[0].moduleName).toBe('player_utils')
    expect(ast.imports[1].moduleName).toBe('math_utils')
    for (const imp of ast.imports) {
      expect(imp.symbol).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// Compiler: whole-module import resolution (file-based)
// ---------------------------------------------------------------------------

describe('compiler: whole-module import resolution', () => {
  test('resolves and merges a whole-module import from a relative file', () => {
    const dir = makeTmpDir({
      'player_utils.mcrs': `
module player_utils;
fn get_health_pct(name: string): int {
  return 75;
}
`,
      'main.mcrs': `
import player_utils;
fn on_tick() {
  let pct: int = get_health_pct("Steve");
}
`,
    })

    try {
      const source = fs.readFileSync(path.join(dir, 'main.mcrs'), 'utf-8')
      const result = compile(source, {
        namespace: 'test',
        filePath: path.join(dir, 'main.mcrs'),
      })
      expect(result.success).toBe(true)
      const files = result.files.filter(f => f.path.endsWith('.mcfunction'))
      // get_health_pct should be emitted (reachable from on_tick)
      const allContent = files.map(f => f.content).join('\n')
      expect(allContent.length).toBeGreaterThan(0)
    } finally {
      cleanupDir(dir)
    }
  })

  test('throws a diagnostic error when module file is not found', () => {
    expect(() => {
      compile(`
        import nonexistent_module;
        fn main() { }
      `, { namespace: 'test', filePath: '/tmp/fake/main.mcrs' })
    }).toThrow(/Module 'nonexistent_module' not found/)
  })

  test('whole-module import allows calling imported functions', () => {
    const dir = makeTmpDir({
      'utils.mcrs': `
module utils;
fn add(a: int, b: int): int {
  return a + b;
}
`,
      'main.mcrs': `
import utils;
fn compute(): int {
  return add(10, 20);
}
`,
    })

    try {
      const source = fs.readFileSync(path.join(dir, 'main.mcrs'), 'utf-8')
      const result = compile(source, {
        namespace: 'ns',
        filePath: path.join(dir, 'main.mcrs'),
      })
      expect(result.success).toBe(true)
    } finally {
      cleanupDir(dir)
    }
  })

  test('imported module functions are DCE-eligible (not exported as entry points)', () => {
    const dir = makeTmpDir({
      'helper.mcrs': `
module helper;
fn internal_fn(): int {
  return 42;
}
`,
      'main.mcrs': `
import helper;
fn main_run() {
  let x: int = internal_fn();
}
`,
    })

    try {
      const source = fs.readFileSync(path.join(dir, 'main.mcrs'), 'utf-8')
      const result = compile(source, {
        namespace: 'test',
        filePath: path.join(dir, 'main.mcrs'),
      })
      expect(result.success).toBe(true)
      // internal_fn should NOT appear in tick.json or load.json as an entry point
      const tickTag = result.files.find(f => f.path.includes('tick.json'))
      const loadTag = result.files.find(f => f.path.includes('load.json'))
      if (tickTag) expect(tickTag.content).not.toContain('internal_fn')
      if (loadTag) expect(loadTag.content).not.toContain('internal_fn')
    } finally {
      cleanupDir(dir)
    }
  })

  test('does not import the same module twice (deduplication)', () => {
    const dir = makeTmpDir({
      'shared.mcrs': `
module shared;
fn shared_fn(): int { return 1; }
`,
      'a.mcrs': `
module a;
import shared;
fn use_shared(): int { return shared_fn(); }
`,
      'main.mcrs': `
import a;
import shared;
fn main() {
  let x: int = use_shared();
  let y: int = shared_fn();
}
`,
    })

    try {
      const source = fs.readFileSync(path.join(dir, 'main.mcrs'), 'utf-8')
      // Should not throw a duplicate function error
      const result = compile(source, {
        namespace: 'test',
        filePath: path.join(dir, 'main.mcrs'),
      })
      expect(result.success).toBe(true)
    } finally {
      cleanupDir(dir)
    }
  })
})
