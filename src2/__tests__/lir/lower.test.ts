import { lowerToLIR } from '../../lir/lower'
import type { MIRModule, MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'
import type { LIRInstr, Slot } from '../../lir/types'

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

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

function slot(name: string): Slot {
  return { player: `$${name}`, obj: OBJ }
}

function findInstr(instrs: LIRInstr[], kind: string): LIRInstr | undefined {
  return instrs.find(i => i.kind === kind)
}

function findAllInstrs(instrs: LIRInstr[], kind: string): LIRInstr[] {
  return instrs.filter(i => i.kind === kind)
}

// ---------------------------------------------------------------------------
// Constant lowering
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — constants', () => {
  test('const → score_set', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 't0', value: 42 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions[0]).toEqual({
      kind: 'score_set',
      dst: slot('t0'),
      value: 42,
    })
  })
})

// ---------------------------------------------------------------------------
// Copy lowering
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — copy', () => {
  test('copy temp → score_copy', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 't0', value: 5 },
          { kind: 'copy', dst: 't1', src: t('t0') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions[1]).toEqual({
      kind: 'score_copy',
      dst: slot('t1'),
      src: slot('t0'),
    })
  })

  test('copy const → score_set', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'copy', dst: 't0', src: c(10) },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions[0]).toEqual({
      kind: 'score_set',
      dst: slot('t0'),
      value: 10,
    })
  })
})

// ---------------------------------------------------------------------------
// Arithmetic lowering
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — arithmetic', () => {
  test('add temps → score_copy + score_add', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'a', value: 3 },
          { kind: 'const', dst: 'b', value: 4 },
          { kind: 'add', dst: 'r', a: t('a'), b: t('b') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    // After two score_sets for a and b, we should see:
    // score_copy $r = $a
    // score_add $r += $b
    const instrs = main.instructions
    expect(instrs[2]).toEqual({ kind: 'score_copy', dst: slot('r'), src: slot('a') })
    expect(instrs[3]).toEqual({ kind: 'score_add', dst: slot('r'), src: slot('b') })
  })

  test('add with const operand → score_set + score_copy + score_set const + score_add', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'a', value: 3 },
          { kind: 'add', dst: 'r', a: t('a'), b: c(7) },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions
    // score_set $a 3
    // score_copy $r = $a
    // score_set $__const_7 7
    // score_add $r += $__const_7
    expect(instrs[1]).toEqual({ kind: 'score_copy', dst: slot('r'), src: slot('a') })
    expect(instrs[2]).toEqual({ kind: 'score_set', dst: { player: '$__const_7', obj: OBJ }, value: 7 })
    expect(instrs[3]).toEqual({ kind: 'score_add', dst: slot('r'), src: { player: '$__const_7', obj: OBJ } })
  })

  test('sub, mul, div, mod all produce correct score ops', () => {
    const ops = ['sub', 'mul', 'div', 'mod'] as const
    const scoreOps = ['score_sub', 'score_mul', 'score_div', 'score_mod'] as const

    for (let i = 0; i < ops.length; i++) {
      const mod = mkModule([
        mkFn('main', [
          mkBlock('entry', [
            { kind: 'const', dst: 'a', value: 10 },
            { kind: 'const', dst: 'b', value: 3 },
            { kind: ops[i], dst: 'r', a: t('a'), b: t('b') } as MIRInstr,
          ], { kind: 'return', value: null }),
        ]),
      ])
      const lir = lowerToLIR(mod)
      const main = lir.functions.find(f => f.name === 'main')!
      const instrs = main.instructions
      expect(instrs[2]).toEqual({ kind: 'score_copy', dst: slot('r'), src: slot('a') })
      expect(instrs[3]).toEqual({ kind: scoreOps[i], dst: slot('r'), src: slot('b') })
    }
  })
})

// ---------------------------------------------------------------------------
// Negation
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — negation', () => {
  test('neg → score_set 0, score_sub', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'x', value: 5 },
          { kind: 'neg', dst: 'r', src: t('x') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions
    // score_set $x 5
    // score_set $r 0
    // score_sub $r -= $x
    expect(instrs[1]).toEqual({ kind: 'score_set', dst: slot('r'), value: 0 })
    expect(instrs[2]).toEqual({ kind: 'score_sub', dst: slot('r'), src: slot('x') })
  })
})

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — comparison', () => {
  test('cmp eq → score_set 0, store_cmd_to_score', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'a', value: 1 },
          { kind: 'const', dst: 'b', value: 2 },
          { kind: 'cmp', dst: 'r', op: 'eq', a: t('a'), b: t('b') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions
    // After score_set for a and b:
    // score_set $r 0
    // store_cmd_to_score $r (call_if_score '' $a eq $b)
    const setCmp = instrs.find(i => i.kind === 'score_set' && (i as any).dst.player === '$r')
    expect(setCmp).toEqual({ kind: 'score_set', dst: slot('r'), value: 0 })
    const store = instrs.find(i => i.kind === 'store_cmd_to_score') as any
    expect(store).toBeDefined()
    expect(store.dst).toEqual(slot('r'))
    expect(store.cmd.kind).toBe('call_if_score')
    expect(store.cmd.op).toBe('eq')
  })
})

// ---------------------------------------------------------------------------
// Boolean logic
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — boolean logic', () => {
  test('and → score_copy + score_mul', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'a', value: 1 },
          { kind: 'const', dst: 'b', value: 1 },
          { kind: 'and', dst: 'r', a: t('a'), b: t('b') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions
    expect(instrs[2]).toEqual({ kind: 'score_copy', dst: slot('r'), src: slot('a') })
    expect(instrs[3]).toEqual({ kind: 'score_mul', dst: slot('r'), src: slot('b') })
  })

  test('not → score_set 1, score_sub', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'x', value: 1 },
          { kind: 'not', dst: 'r', src: t('x') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions
    // score_set $x 1
    // score_set $r 1
    // score_sub $r -= $x
    expect(instrs[1]).toEqual({ kind: 'score_set', dst: slot('r'), value: 1 })
    expect(instrs[2]).toEqual({ kind: 'score_sub', dst: slot('r'), src: slot('x') })
  })

  test('or → score_copy + score_add + score_min(1)', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'a', value: 1 },
          { kind: 'const', dst: 'b', value: 0 },
          { kind: 'or', dst: 'r', a: t('a'), b: t('b') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions
    // score_set $a 1, score_set $b 0
    // score_copy $r = $a
    // score_add $r += $b
    // score_set $__const_1 1
    // score_min $r, $__const_1
    expect(instrs[2]).toEqual({ kind: 'score_copy', dst: slot('r'), src: slot('a') })
    expect(instrs[3]).toEqual({ kind: 'score_add', dst: slot('r'), src: slot('b') })
    const minInstr = instrs.find(i => i.kind === 'score_min') as any
    expect(minInstr).toBeDefined()
    expect(minInstr.dst).toEqual(slot('r'))
  })
})

// ---------------------------------------------------------------------------
// NBT operations
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — NBT', () => {
  test('nbt_read → store_nbt_to_score', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'nbt_read', dst: 't0', ns: 'rs:data', path: 'val', scale: 1 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions[0]).toEqual({
      kind: 'store_nbt_to_score',
      dst: slot('t0'),
      ns: 'rs:data',
      path: 'val',
      scale: 1,
    })
  })

  test('nbt_write → store_score_to_nbt', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 't0', value: 10 },
          { kind: 'nbt_write', ns: 'rs:data', path: 'val', type: 'int', scale: 1, src: t('t0') },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions[1]).toEqual({
      kind: 'store_score_to_nbt',
      ns: 'rs:data',
      path: 'val',
      type: 'int',
      scale: 1,
      src: slot('t0'),
    })
  })
})

// ---------------------------------------------------------------------------
// Function calls
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — calls', () => {
  test('call with args → set $p0, $p1, call, copy $ret', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'a', value: 1 },
          { kind: 'const', dst: 'b', value: 2 },
          { kind: 'call', dst: 'r', fn: 'add', args: [t('a'), t('b')] },
        ], { kind: 'return', value: null }),
      ]),
      mkFn('add', [
        mkBlock('entry', [], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions

    // $p0 = $a
    expect(instrs[2]).toEqual({
      kind: 'score_copy',
      dst: { player: '$p0', obj: OBJ },
      src: slot('a'),
    })
    // $p1 = $b
    expect(instrs[3]).toEqual({
      kind: 'score_copy',
      dst: { player: '$p1', obj: OBJ },
      src: slot('b'),
    })
    // call test:add
    expect(instrs[4]).toEqual({ kind: 'call', fn: 'test:add' })
    // $r = $ret
    expect(instrs[5]).toEqual({
      kind: 'score_copy',
      dst: slot('r'),
      src: { player: '$ret', obj: OBJ },
    })
  })

  test('call with no dst does not copy $ret', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'call', dst: null, fn: 'side_effect', args: [] },
        ], { kind: 'return', value: null }),
      ]),
      mkFn('side_effect', [
        mkBlock('entry', [], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions).toEqual([
      { kind: 'call', fn: 'test:side_effect' },
    ])
  })

  test('raw command via __raw: prefix', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'call', dst: null, fn: '__raw:say hello', args: [] },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions[0]).toEqual({ kind: 'raw', cmd: 'say hello' })
  })
})

// ---------------------------------------------------------------------------
// Macro calls
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — macro calls', () => {
  test('call_macro → store args to NBT + call_macro', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'px', value: 100 },
          {
            kind: 'call_macro',
            dst: null,
            fn: 'draw_pt',
            args: [{ name: 'px', value: t('px'), type: 'int' as const, scale: 1 }],
          },
        ], { kind: 'return', value: null }),
      ]),
      mkFn('draw_pt', [
        mkBlock('entry', [], { kind: 'return', value: null }),
      ], [{ name: 'px', isMacroParam: true }], true),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const instrs = main.instructions

    // store_score_to_nbt for px
    const storeNbt = instrs.find(i => i.kind === 'store_score_to_nbt') as any
    expect(storeNbt).toBeDefined()
    expect(storeNbt.ns).toBe('rs:macro_args')
    expect(storeNbt.path).toBe('px')

    // call_macro
    const callMacro = instrs.find(i => i.kind === 'call_macro') as any
    expect(callMacro).toBeDefined()
    expect(callMacro.fn).toBe('test:draw_pt')
    expect(callMacro.storage).toBe('rs:macro_args')
  })
})

// ---------------------------------------------------------------------------
// Context calls
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — context calls', () => {
  test('call_context → call_context with qualified name', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          {
            kind: 'call_context',
            fn: 'helper',
            subcommands: [{ kind: 'as', selector: '@e[tag=foo]' }, { kind: 'at_self' }],
          },
        ], { kind: 'return', value: null }),
      ]),
      mkFn('helper', [
        mkBlock('entry', [], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions[0]).toEqual({
      kind: 'call_context',
      fn: 'test:helper',
      subcommands: [{ kind: 'as', selector: '@e[tag=foo]' }, { kind: 'at_self' }],
    })
  })
})

// ---------------------------------------------------------------------------
// Return
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — return', () => {
  test('return with value → return_value', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 't0', value: 42 },
        ], { kind: 'return', value: t('t0') }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    const ret = main.instructions.find(i => i.kind === 'return_value') as any
    expect(ret).toBeDefined()
    expect(ret.slot).toEqual(slot('t0'))
  })

  test('return void → no return_value instruction', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    expect(main.instructions.find(i => i.kind === 'return_value')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Control flow — jump
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — jump (inlining)', () => {
  test('jump to single-pred block inlines instructions', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 't0', value: 1 },
        ], { kind: 'jump', target: 'next' }),
        mkBlock('next', [
          { kind: 'const', dst: 't1', value: 2 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!
    // Both blocks inlined: score_set t0, score_set t1
    expect(main.instructions).toEqual([
      { kind: 'score_set', dst: slot('t0'), value: 1 },
      { kind: 'score_set', dst: slot('t1'), value: 2 },
    ])
  })
})

// ---------------------------------------------------------------------------
// Control flow — branch
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — branch', () => {
  test('branch emits call_if_matches and call_unless_matches', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [
          { kind: 'const', dst: 'cond', value: 1 },
        ], { kind: 'branch', cond: t('cond'), then: 'yes', else: 'no' }),
        mkBlock('yes', [
          { kind: 'const', dst: 'a', value: 10 },
        ], { kind: 'return', value: null }),
        mkBlock('no', [
          { kind: 'const', dst: 'b', value: 20 },
        ], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    const main = lir.functions.find(f => f.name === 'main')!

    // Should have: score_set $cond 1, call_if_matches ..., call_unless_matches ...
    const ifMatch = main.instructions.find(i => i.kind === 'call_if_matches') as any
    expect(ifMatch).toBeDefined()
    expect(ifMatch.slot).toEqual(slot('cond'))
    expect(ifMatch.range).toBe('1')

    const unlessMatch = main.instructions.find(i => i.kind === 'call_unless_matches') as any
    expect(unlessMatch).toBeDefined()
    expect(unlessMatch.slot).toEqual(slot('cond'))
    expect(unlessMatch.range).toBe('1')

    // The then/else blocks should be separate functions
    const yesFn = lir.functions.find(f => f.name.includes('yes'))
    const noFn = lir.functions.find(f => f.name.includes('no'))
    expect(yesFn).toBeDefined()
    expect(noFn).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Module structure
// ---------------------------------------------------------------------------

describe('MIR→LIR lowering — module', () => {
  test('preserves namespace and objective', () => {
    const mod = mkModule([
      mkFn('main', [
        mkBlock('entry', [], { kind: 'return', value: null }),
      ]),
    ])
    const lir = lowerToLIR(mod)
    expect(lir.namespace).toBe(NS)
    expect(lir.objective).toBe(OBJ)
  })

  test('macro function carries isMacro and macroParams', () => {
    const mod = mkModule([
      mkFn('draw', [
        mkBlock('entry', [], { kind: 'return', value: null }),
      ], [{ name: 'px', isMacroParam: true }, { name: 'py', isMacroParam: true }], true),
    ])
    const lir = lowerToLIR(mod)
    const drawFn = lir.functions.find(f => f.name === 'draw')!
    expect(drawFn.isMacro).toBe(true)
    expect(drawFn.macroParams).toEqual(['px', 'py'])
  })
})
