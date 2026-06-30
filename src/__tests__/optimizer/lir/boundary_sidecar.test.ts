import {
  deriveBoundarySidecar,
  type BoundaryProvenance,
  type BoundaryConfidence,
  type StorageRef,
  type BoundarySidecar,
} from '../../../optimizer/lir/boundary_sidecar'
import type { LIRInstr, Slot } from '../../../lir/types'

const TEST_OBJ = '__bc'

function slot(player: string): Slot {
  return { player, obj: TEST_OBJ }
}

function storage(namespace: string, path: string): StorageRef {
  return { namespace, path }
}

type SidecarExpectation = Omit<BoundarySidecar, 'confidence' | 'provenance'> & {
  confidence: BoundaryConfidence
  provenance: BoundaryProvenance
}

const ALL_LIR_KINDS: Array<LIRInstr['kind']> = [
  'score_set',
  'score_delta',
  'score_copy',
  'score_add',
  'score_sub',
  'score_mul',
  'score_div',
  'score_mod',
  'score_min',
  'score_max',
  'score_swap',
  'store_cmd_to_score',
  'store_score_to_nbt',
  'store_nbt_to_score',
  'nbt_set_literal',
  'nbt_copy',
  'call',
  'call_macro',
  'call_if_matches',
  'call_unless_matches',
  'call_if_score',
  'call_unless_score',
  'call_context',
  'return_value',
  'macro_line',
  'raw',
]

describe('deriveBoundarySidecar()', () => {
  const cases: Array<{ kind: string; instr: LIRInstr; expected: SidecarExpectation }> = [
    {
      kind: 'score_set',
      instr: { kind: 'score_set', dst: slot('$a'), value: 7 },
      expected: {
        reads: [],
        writes: [slot('$a')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_delta',
      instr: { kind: 'score_delta', dst: slot('$b'), value: 3 },
      expected: {
        reads: [slot('$b')],
        writes: [slot('$b')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_copy',
      instr: { kind: 'score_copy', dst: slot('$c'), src: slot('$d') },
      expected: {
        reads: [slot('$d')],
        writes: [slot('$c')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_add',
      instr: { kind: 'score_add', dst: slot('$x'), src: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_sub',
      instr: { kind: 'score_sub', dst: slot('$x'), src: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_mul',
      instr: { kind: 'score_mul', dst: slot('$x'), src: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_div',
      instr: { kind: 'score_div', dst: slot('$x'), src: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_mod',
      instr: { kind: 'score_mod', dst: slot('$x'), src: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_min',
      instr: { kind: 'score_min', dst: slot('$x'), src: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_max',
      instr: { kind: 'score_max', dst: slot('$x'), src: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'score_swap',
      instr: { kind: 'score_swap', a: slot('$x'), b: slot('$y') },
      expected: {
        reads: [slot('$x'), slot('$y')],
        writes: [slot('$x'), slot('$y')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'store_cmd_to_score',
      instr: {
        kind: 'store_cmd_to_score',
        dst: slot('$out'),
        cmd: { kind: 'score_add', dst: slot('$acc'), src: slot('$rhs') },
      },
      expected: {
        reads: [slot('$out'), slot('$acc'), slot('$rhs')],
        writes: [slot('$out'), slot('$acc')],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'store_score_to_nbt',
      instr: {
        kind: 'store_score_to_nbt',
        ns: 'rs:data',
        path: 'health',
        type: 'int',
        scale: 1,
        src: slot('$src'),
      },
      expected: {
        reads: [slot('$src')],
        writes: [],
        storageReads: [],
        storageWrites: [{ namespace: 'rs:data', path: 'health', type: 'int', scale: 1 }],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'store_nbt_to_score',
      instr: {
        kind: 'store_nbt_to_score',
        dst: slot('$dst'),
        ns: 'rs:data',
        path: 'health',
        scale: 1,
      },
      expected: {
        reads: [],
        writes: [slot('$dst')],
        storageReads: [storage('rs:data', 'health')],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'nbt_set_literal',
      instr: {
        kind: 'nbt_set_literal',
        ns: 'rs:data',
        path: 'foo',
        value: '{a:1}',
      },
      expected: {
        reads: [],
        writes: [],
        storageReads: [],
        storageWrites: [storage('rs:data', 'foo')],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'nbt_copy',
      instr: {
        kind: 'nbt_copy',
        srcNs: 'rs:src',
        srcPath: 'a',
        dstNs: 'rs:dst',
        dstPath: 'b',
      },
      expected: {
        reads: [],
        writes: [],
        storageReads: [storage('rs:src', 'a')],
        storageWrites: [storage('rs:dst', 'b')],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'call',
      instr: { kind: 'call', fn: 'test:leaf' },
      expected: {
        reads: [],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: true,
        opaqueScoreboardWrite: true,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'lowering-compat',
      },
    },
    {
      kind: 'call_macro',
      instr: { kind: 'call_macro', fn: 'test:macro', storage: 'rs:macro_args' },
      expected: {
        reads: [],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: true,
        opaqueScoreboardWrite: true,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: true,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'macro-helper',
      },
    },
    {
      kind: 'call_if_matches',
      instr: {
        kind: 'call_if_matches',
        fn: 'test:then',
        slot: slot('$cond'),
        range: '1',
      },
      expected: {
        reads: [slot('$cond')],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'lowering-compat',
      },
    },
    {
      kind: 'call_unless_matches',
      instr: {
        kind: 'call_unless_matches',
        fn: 'test:else',
        slot: slot('$cond'),
        range: '1',
      },
      expected: {
        reads: [slot('$cond')],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'lowering-compat',
      },
    },
    {
      kind: 'call_if_score',
      instr: {
        kind: 'call_if_score',
        fn: 'test:then',
        a: slot('$left'),
        op: 'gt',
        b: slot('$right'),
      },
      expected: {
        reads: [slot('$left'), slot('$right')],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'lowering-compat',
      },
    },
    {
      kind: 'call_unless_score',
      instr: {
        kind: 'call_unless_score',
        fn: 'test:else',
        a: slot('$left'),
        op: 'lt',
        b: slot('$right'),
      },
      expected: {
        reads: [slot('$left'), slot('$right')],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'lowering-compat',
      },
    },
    {
      kind: 'call_context',
      instr: {
        kind: 'call_context',
        fn: 'test:body',
        subcommands: [{ kind: 'if_matches', score: '$cond __bc', range: '1..' }],
      },
      expected: {
        reads: [slot('$cond')],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: true,
        opaqueScoreboardWrite: true,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: false,
        barrier: true,
        confidence: 'conservative',
        provenance: 'lowering-compat',
      },
    },
    {
      kind: 'return_value',
      instr: { kind: 'return_value', slot: slot('$ret') },
      expected: {
        reads: [slot('$ret')],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
        opaqueStorageWrite: false,
        macroSubstitution: false,
        rawText: false,
        barrier: false,
        confidence: 'exact',
        provenance: 'typed-lir',
      },
    },
    {
      kind: 'macro_line',
      instr: {
        kind: 'macro_line',
        template: '$say $(value)',
      },
      expected: {
        reads: [],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: true,
        opaqueScoreboardWrite: true,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: true,
        rawText: true,
        barrier: true,
        confidence: 'opaque',
        provenance: 'macro-helper',
      },
    },
    {
      kind: 'raw',
      instr: {
        kind: 'raw',
        cmd: 'scoreboard players set #x test 1',
      },
      expected: {
        reads: [],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: true,
        opaqueScoreboardWrite: true,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: true,
        barrier: true,
        confidence: 'opaque',
        provenance: 'raw-user-command',
      },
    },
  ]

  test.each(cases)('$kind', ({ instr, expected }) => {
    const sidecar = deriveBoundarySidecar(instr)
    expect(sidecar).toEqual(expected)
  })

  test('covers all known LIR instruction kinds', () => {
    const coveredKinds = new Set(cases.map(entry => entry.kind))
    expect(Array.from(coveredKinds).sort()).toEqual(Array.from(new Set(ALL_LIR_KINDS)).sort())
  })

  test('store_cmd_to_score keeps nested boundary and demotes exact confidence', () => {
    const sidecar = deriveBoundarySidecar({
      kind: 'store_cmd_to_score',
      dst: slot('$dst'),
      cmd: { kind: 'call_macro', fn: 'test:helper', storage: 'rs:macro_args' },
    })

    expect(sidecar.confidence).toBe('conservative')
    expect(sidecar.barrier).toBe(true)
    expect(sidecar.reads).toEqual([slot('$dst')])
    expect(sidecar.writes).toEqual([slot('$dst')])
    expect(sidecar.macroSubstitution).toBe(true)
    expect(sidecar.provenance).toBe('macro-helper')
    expect(sidecar.rawText).toBe(false)
    expect(sidecar.opaqueScoreboardRead).toBe(true)
    expect(sidecar.opaqueScoreboardWrite).toBe(true)
    expect(sidecar.opaqueStorageRead).toBe(true)
    expect(sidecar.opaqueStorageWrite).toBe(true)
  })

  test('raw and macro text are always opaque and carry rawText flag', () => {
    const raw = deriveBoundarySidecar({ kind: 'raw', cmd: 'if score $x __bc matches 1 run return run function t:foo' })
    const macro = deriveBoundarySidecar({ kind: 'macro_line', template: '$return run function $(target)' })

    expect(raw.confidence).toBe('opaque')
    expect(raw.rawText).toBe(true)
    expect(raw.opaqueScoreboardRead).toBe(true)
    expect(raw.opaqueScoreboardWrite).toBe(true)
    expect(macro.confidence).toBe('opaque')
    expect(macro.provenance).toBe('macro-helper')
    expect(macro.rawText).toBe(true)
    expect(macro.macroSubstitution).toBe(true)
    expect(macro.opaqueStorageRead).toBe(true)
  })

  test('store_cmd_to_score propagates nested opacity when nested text is opaque', () => {
    const sidecar = deriveBoundarySidecar({
      kind: 'store_cmd_to_score',
      dst: slot('$dst'),
      cmd: { kind: 'raw', cmd: '$say $(value)' },
    })

    expect(sidecar.confidence).toBe('opaque')
    expect(sidecar.barrier).toBe(true)
    expect(sidecar.opaqueScoreboardRead).toBe(true)
    expect(sidecar.opaqueScoreboardWrite).toBe(true)
    expect(sidecar.opaqueStorageRead).toBe(true)
    expect(sidecar.opaqueStorageWrite).toBe(true)
    expect(sidecar.rawText).toBe(true)
    expect(sidecar.provenance).toBe('raw-user-command')
  })
})
