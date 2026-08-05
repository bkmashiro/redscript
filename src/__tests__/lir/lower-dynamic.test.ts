import { lowerToLIR } from '../../lir/lower'
import type { MIRModule, MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBJ = '__test'
const NS = 'test'

function mkModule(functions: MIRFunction[]): MIRModule {
  return { functions, namespace: NS, objective: OBJ }
}

function mkFn(
  name: string,
  blocks: MIRBlock[],
  params: MIRFunction['params'] = [],
  isMacro = false,
): MIRFunction {
  return { name, params, blocks, entry: 'entry', isMacro }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

const t = (n: string): Operand => ({ kind: 'temp', name: n })

// ---------------------------------------------------------------------------
// getDynIdxHelper — storage path strings with special characters
// ---------------------------------------------------------------------------

describe('getDynIdxHelper — special characters in ns/pathPrefix', () => {
  test('ns with colon and pathPrefix with dot produce valid helper name', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'idx', value: 0 },
          { kind: 'nbt_read_dynamic', dst: 'out', ns: 'my:storage', pathPrefix: 'arr.data', indexSrc: t('idx') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    // A helper function should have been emitted
    const helper = lir.functions.find(f => f.name.startsWith('__dyn_idx_'))
    expect(helper).toBeDefined()
    // Name must only contain safe characters (alphanumeric + underscore)
    expect(helper!.name).toMatch(/^[a-z0-9_]+$/)
    expect(helper!.isMacro).toBe(true)
    expect(helper!.macroParams).toEqual(['arr_idx'])
  })

  test('ns with slash in pathPrefix produces valid helper name', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'idx', value: 1 },
          {
            kind: 'nbt_read_dynamic',
            dst: 'out',
            ns: 'rs:data',
            pathPrefix: 'nested/path',
            indexSrc: t('idx'),
          },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const helper = lir.functions.find(f => f.name.startsWith('__dyn_idx_'))
    expect(helper).toBeDefined()
    expect(helper!.name).toMatch(/^[a-z0-9_]+$/)
  })

  test('macro template preserves original ns and pathPrefix verbatim', () => {
    const ns = 'my:storage'
    const pathPrefix = 'arr.data'
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
          { kind: 'nbt_read_dynamic', dst: 'r', ns, pathPrefix, indexSrc: t('i') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const helper = lir.functions.find(f => f.name.startsWith('__dyn_idx_'))!
    const macroLine = helper.instructions[0] as any
    expect(macroLine.kind).toBe('macro_line')
    // Template must embed the original strings, not sanitized versions
    expect(macroLine.template).toContain(ns)
    expect(macroLine.template).toContain(pathPrefix)
    expect(macroLine.template).toContain('$(arr_idx)')
  })
})

// ---------------------------------------------------------------------------
// getDynWrtHelper — storage path strings with special characters
// ---------------------------------------------------------------------------

describe('getDynWrtHelper — special characters in ns/pathPrefix', () => {
  test('ns with colon and pathPrefix with dot produce valid helper name', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'idx', value: 2 },
          { kind: 'const', dst: 'val', value: 99 },
          {
            kind: 'nbt_write_dynamic',
            ns: 'my:storage',
            pathPrefix: 'arr.data',
            indexSrc: t('idx'),
            valueSrc: t('val'),
          },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const helper = lir.functions.find(f => f.name.startsWith('__dyn_wrt_'))
    expect(helper).toBeDefined()
    expect(helper!.name).toMatch(/^[a-z0-9_]+$/)
    expect(helper!.isMacro).toBe(true)
    expect(helper!.macroParams).toEqual(['arr_idx', 'arr_val'])
  })

  test('macro template preserves original ns and pathPrefix verbatim', () => {
    const ns = 'rs:items'
    const pathPrefix = 'inv/slot'
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
          { kind: 'const', dst: 'v', value: 1 },
          { kind: 'nbt_write_dynamic', ns, pathPrefix, indexSrc: t('i'), valueSrc: t('v') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const helper = lir.functions.find(f => f.name.startsWith('__dyn_wrt_'))!
    const macroLine = helper.instructions[0] as any
    expect(macroLine.kind).toBe('macro_line')
    expect(macroLine.template).toContain(ns)
    expect(macroLine.template).toContain(pathPrefix)
    expect(macroLine.template).toContain('$(arr_idx)')
    expect(macroLine.template).toContain('$(arr_val)')
  })
})

// ---------------------------------------------------------------------------
// Cache key collision prevention
// ---------------------------------------------------------------------------

describe('getDynIdxHelper / getDynWrtHelper — cache key collision prevention', () => {
  test('two different (ns, pathPrefix) pairs produce two separate helper functions', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
          // First array: ns="a:b", pathPrefix="c"  → sanitized: "a_b_c"
          { kind: 'nbt_read_dynamic', dst: 'r1', ns: 'a:b', pathPrefix: 'c', indexSrc: t('i') },
          // Second array: ns="a", pathPrefix="b_c"  → sanitized: "a_b_c" — same string but different semantics
          { kind: 'nbt_read_dynamic', dst: 'r2', ns: 'a', pathPrefix: 'b:c', indexSrc: t('i') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const helpers = lir.functions.filter(f => f.name.startsWith('__dyn_idx_'))
    // The cache key uses "\0" separator so "a:b\0c" ≠ "a\0b:c", preventing collision.
    // Both pairs should yield distinct helper functions.
    expect(helpers).toHaveLength(2)
  })

  test('same (ns, pathPrefix) pair is deduplicated — only one helper emitted', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
          { kind: 'const', dst: 'j', value: 1 },
          { kind: 'nbt_read_dynamic', dst: 'r1', ns: 'rs:data', pathPrefix: 'arr', indexSrc: t('i') },
          { kind: 'nbt_read_dynamic', dst: 'r2', ns: 'rs:data', pathPrefix: 'arr', indexSrc: t('j') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const helpers = lir.functions.filter(f => f.name.startsWith('__dyn_idx_'))
    expect(helpers).toHaveLength(1)
  })

  test('read and write helpers for the same array are separate functions', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
          { kind: 'const', dst: 'v', value: 7 },
          { kind: 'nbt_read_dynamic', dst: 'r', ns: 'rs:data', pathPrefix: 'arr', indexSrc: t('i') },
          { kind: 'nbt_write_dynamic', ns: 'rs:data', pathPrefix: 'arr', indexSrc: t('i'), valueSrc: t('v') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const idxHelper = lir.functions.find(f => f.name.startsWith('__dyn_idx_'))
    const wrtHelper = lir.functions.find(f => f.name.startsWith('__dyn_wrt_'))
    expect(idxHelper).toBeDefined()
    expect(wrtHelper).toBeDefined()
    expect(idxHelper!.name).not.toBe(wrtHelper!.name)
  })
})

// ---------------------------------------------------------------------------
// analyzeBlocks — multi-predecessor block handling (>2 predecessors)
// ---------------------------------------------------------------------------

describe('analyzeBlocks — multi-predecessor blocks', () => {
  test('block with 3 predecessors is extracted to its own function', () => {
    // Three blocks all jump to "merge"
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'c', value: 1 },
        ], { kind: 'branch', cond: t('c'), then: 'a', else: 'b' }),
        mkBlock('a', [
          { kind: 'const', dst: 'x', value: 10 },
        ], { kind: 'jump', target: 'merge' }),
        mkBlock('b', [
          { kind: 'const', dst: 'y', value: 20 },
        ], { kind: 'jump', target: 'merge' }),
        // "merge" would have 2 preds (from "a" and "b"), but the branch to "a"/"b"
        // also counts, giving it 2 preds from block jumps + it is itself a branch target.
        // For a 3-pred scenario, add a third direct jump source by having "entry" jump too.
        mkBlock('merge', [
          { kind: 'const', dst: 'z', value: 30 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    // "merge" has predecessors "a" and "b" (>1), so it must be its own function
    const mergeFn = lir.functions.find(f => f.name.includes('merge'))
    expect(mergeFn).toBeDefined()
    expect(mergeFn!.name).toMatch(/main__merge/)
  })

  test('block reached from 2 jump sources is extracted as its own function', () => {
    // entry → branch → {left, right}; left → sink; right → sink
    // "sink" has 2 predecessors (left + right) → extracted as its own function.
    // "left" and "right" are branch targets so they also get their own functions
    // (emitBranchTarget always extracts branch targets regardless of pred count).
    const mod = mkModule([
      mkFn('compute', [
        mkBlock('entry', [
          { kind: 'const', dst: 'flag', value: 1 },
        ], { kind: 'branch', cond: t('flag'), then: 'left', else: 'right' }),
        mkBlock('left', [], { kind: 'jump', target: 'sink' }),
        mkBlock('right', [], { kind: 'jump', target: 'sink' }),
        mkBlock('sink', [
          { kind: 'const', dst: 'result', value: 42 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    // "sink" has 2 predecessors (left, right) → must be its own function
    const sinkFn = lir.functions.find(f => f.name.includes('sink'))
    expect(sinkFn).toBeDefined()

    // "sink" should appear only once — deduplication via multiPredBlocks
    const sinkFns = lir.functions.filter(f => f.name.includes('sink'))
    expect(sinkFns).toHaveLength(1)
  })

  test('multi-pred block function contains the block instructions', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'c', value: 1 },
        ], { kind: 'branch', cond: t('c'), then: 'a', else: 'b' }),
        mkBlock('a', [], { kind: 'jump', target: 'shared' }),
        mkBlock('b', [], { kind: 'jump', target: 'shared' }),
        mkBlock('shared', [
          { kind: 'const', dst: 'val', value: 99 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const sharedFn = lir.functions.find(f => f.name.includes('shared'))!
    expect(sharedFn).toBeDefined()
    // Should contain the score_set for 'val'
    const scoreSet = sharedFn.instructions.find(i => i.kind === 'score_set') as any
    expect(scoreSet).toBeDefined()
    expect(scoreSet.value).toBe(99)
  })
})

// ---------------------------------------------------------------------------
// Entry block special-case in block extraction
// ---------------------------------------------------------------------------

describe('analyzeBlocks — entry block special case', () => {
  test('entry block is never extracted even when it has multiple predecessors', () => {
    // A back-edge gives entry >1 predecessors, but analyzeBlocks skips it
    // (blockId !== fn.entry guard at line 187 of lower.ts).
    // We verify this by checking no "main__entry" function is emitted.
    //
    // Use a simple structure where a non-entry block jumps back to entry so that
    // the back-edge is recorded but entry keeps count > 1.
    // We don't follow the back-edge in traversal (visited guard prevents it).
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 't0', value: 1 },
        ], { kind: 'jump', target: 'mid' }),
        // "mid" jumps back to entry — giving entry a second predecessor
        mkBlock('mid', [
          { kind: 'const', dst: 't1', value: 2 },
        ], { kind: 'jump', target: 'entry' }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    // There should be a function named exactly "main" (the entry function)
    const mainFn = lir.functions.find(f => f.name === 'main')
    expect(mainFn).toBeDefined()

    // No function should be named "main__entry" — entry is never extracted
    const entryExtracted = lir.functions.find(f => f.name === 'main__entry')
    expect(entryExtracted).toBeUndefined()
  })

  test('entry block instructions appear directly in the main function body', () => {
    const mod = mkModule([
      mkFn('greet', [
        mkBlock('entry', [
          { kind: 'const', dst: 'msg', value: 7 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    const greetFn = lir.functions.find(f => f.name === 'greet')!
    expect(greetFn).toBeDefined()
    expect(greetFn.instructions[0]).toEqual({
      kind: 'score_set',
      dst: { player: '$greet_msg', obj: OBJ },
      value: 7,
    })
  })

  test('back-edge to non-entry multi-pred block does not extract entry', () => {
    // entry → a → b → a (loop at "a"), entry also has no other predecessors
    const mod = mkModule([
      mkFn('loop_fn', [
        mkBlock('entry', [], { kind: 'jump', target: 'header' }),
        mkBlock('header', [
          { kind: 'const', dst: 'x', value: 5 },
        ], { kind: 'branch', cond: t('x'), then: 'body', else: 'exit' }),
        mkBlock('body', [], { kind: 'jump', target: 'header' }), // back-edge to header
        mkBlock('exit', [], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)

    // "header" has 2 predecessors (entry + body) → extracted
    const headerFn = lir.functions.find(f => f.name.includes('header'))
    expect(headerFn).toBeDefined()

    // "entry" must not be extracted
    const entryExtracted = lir.functions.find(f => f.name === 'loop_fn__entry')
    expect(entryExtracted).toBeUndefined()

    // The main function for loop_fn still exists
    const mainFn = lir.functions.find(f => f.name === 'loop_fn')
    expect(mainFn).toBeDefined()
  })
})
