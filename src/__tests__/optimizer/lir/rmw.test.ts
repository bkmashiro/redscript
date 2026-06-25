import fc from 'fast-check'
import { scoreboardRmwPass, scoreboardRmwPassModule } from '../../../optimizer/lir/rmw'
import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'
import { isProtectedSlot } from '../../../optimizer/lir/analysis'
import type { SourceLoc } from '../../../mir/types'

const obj = '__test'

function mkSlot(player: string, objective = obj): Slot {
  return { player, obj: objective }
}

function mkFn(instructions: LIRInstr[], name = 'main'): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function mkModule(functions: LIRFunction[]): LIRModule {
  return { functions, namespace: 'test', objective: obj }
}

describe('LIR scoreboard RMW optimizer', () => {
  test('self-copy no-op removal is idempotent', () => {
    fc.assert(fc.property(
      fc.stringMatching(/^\$[a-z]{1,8}$/),
      fc.stringMatching(/^__[A-Za-z0-9_.:-]{1,8}$/),
      (player, obj) => {
        const x = mkSlot(player, obj)
        const rhs = mkSlot('$rhs', obj)
        const fn = mkFn([
          { kind: 'score_copy', dst: x, src: x },
          { kind: 'score_add', dst: x, src: rhs },
        ])

        const once = scoreboardRmwPass(fn)
        const twice = scoreboardRmwPass(once)
        expect(twice).toEqual(once)
      },
    ))
  })

  test('collapses randomized longer copy chains through dead temporaries', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 2 }),
      (chainLength) => {
        const src = mkSlot('$src')
        const out = mkSlot('$out')
        const copies = Array.from({ length: chainLength + 1 }).map((_, index) => mkSlot(`$tmp${index}`))
        const sourceLoc: SourceLoc = { file: 'test', line: 1, col: 1 }
        const instrs: LIRInstr[] = [
          { kind: 'score_copy', dst: copies[0], src, sourceLoc },
          ...copies.slice(0, -1).map((dst, index) => ({
            kind: 'score_copy',
            dst: copies[index + 1],
            src: copies[index],
          } as const)),
          { kind: 'score_copy', dst: out, src: copies[copies.length - 1] } as const,
        ]

        const result = scoreboardRmwPass(mkFn(instrs))

        expect(result.instructions).toEqual([
          { kind: 'score_copy', dst: out, src, sourceLoc },
        ])
      },
    ))
  })

  test('removes scoreboard self-copy no-ops', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$tmp') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
    ])
  })

  test('does not remove same-player copy across different objectives', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: { player: '$tmp', obj: '__left' }, src: { player: '$tmp', obj: '__right' } },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('collapses adjacent copy chain through dead temporary', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
    ])
  })

  test('collapses longer copy chains while preserving source location on retained copies', () => {
    const copied = {
      kind: 'score_copy' as const,
      dst: mkSlot('$tmp0'),
      src: mkSlot('$src'),
      sourceLoc: { file: 'test', line: 1, col: 1 } as const,
    }
    const fn = mkFn([
      copied,
      { kind: 'score_copy', dst: mkSlot('$tmp1'), src: mkSlot('$tmp0') },
      { kind: 'score_copy', dst: mkSlot('$tmp2'), src: mkSlot('$tmp1') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp2') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src'), sourceLoc: copied.sourceLoc },
    ])
  })

  test('removes temporary writes that are immediately overwritten without intervening reads', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_set', dst: mkSlot('$tmp'), value: 1 },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$tmp'), value: 1 },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])
  })

  test('does not remove overwrite candidate when immediate overwrite reads the slot again', () => {
    fc.assert(fc.property(
      fc.stringMatching(/^\$[a-z]{1,8}$/),
      fc.integer({ min: 1, max: 16 }),
      fc.integer({ min: -12, max: 12 }),
      (tempName, rhsValue, rhsScore) => {
        fc.pre(!isProtectedSlot(mkSlot(tempName)))
        const temp = mkSlot(tempName)
        const result = scoreboardRmwPass(mkFn([
          { kind: 'score_copy', dst: temp, src: mkSlot('$src') },
          { kind: 'store_score_to_nbt', ns: 'rs', path: 'x', type: 'int', scale: 1, src: temp },
          { kind: 'score_set', dst: temp, value: rhsValue },
          { kind: 'score_set', dst: mkSlot(`$out${rhsScore}`), value: rhsScore },
        ]))

        expect(result.instructions).toEqual([
          { kind: 'score_copy', dst: temp, src: mkSlot('$src') },
          { kind: 'store_score_to_nbt', ns: 'rs', path: 'x', type: 'int', scale: 1, src: temp },
          { kind: 'score_set', dst: temp, value: rhsValue },
          { kind: 'score_set', dst: mkSlot(`$out${rhsScore}`), value: rhsScore },
        ])
      },
    ))
  })

  test('does not remove overwrite candidate when temporary is read by immediate consumer', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('collapses copy followed by return through dead temporary', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
    ])
  })

  test('does not collapse copy chain when temporary is read later', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_add', dst: mkSlot('$later'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('collapses temp copy/op/output-copy into direct output RMW', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])
  })

  test.each([
    'score_sub',
    'score_mul',
    'score_div',
    'score_mod',
    'score_min',
    'score_max',
  ] as const)('collapses %s temp/output RMW shape', kind => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind, dst: mkSlot('$tmp'), src: mkSlot('$rhs') } as const,
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind, dst: mkSlot('$out'), src: mkSlot('$rhs') } as const,
    ])
  })

  test('collapses temp copy/op/return into direct $ret RMW', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$ret'), src: mkSlot('$rhs') },
    ])
  })

  test('does not rewrite return collapse when $ret is the original RHS', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$ret') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite return collapse when a later raw command references the temporary slot', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
      { kind: 'raw', cmd: 'execute if score $tmp __test matches 1.. run say tmp' },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when temporary is read later', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_add', dst: mkSlot('$later'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when output slot is also the original RHS', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$out') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite protected temporary slots', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$ret'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$ret') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when a later raw command references the temporary slot', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'raw', cmd: 'execute if score $tmp __test matches 1.. run say tmp' },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when a later macro line references the temporary slot', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'macro_line', template: '$execute if score $tmp __test matches $(range) run say tmp' },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite non-adjacent shapes across raw barriers', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'raw', cmd: 'say barrier' },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('returns same reference when nothing changes', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })
})

describe('LIR scoreboard RMW optimizer (module-level safety)', () => {
  test('does not remove a temporary assignment read by another function call_context', () => {
    const producer = mkFn([
      { kind: 'score_copy', dst: mkSlot('$shared_tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$shared_tmp') },
    ], 'producer')
    const consumer = mkFn([
      {
        kind: 'call_context',
        fn: 'test:consumer_body',
        subcommands: [{ kind: 'if_matches', score: '$shared_tmp __test', range: '1..' }],
      },
    ], 'consumer')

    const result = scoreboardRmwPassModule(mkModule([producer, consumer]))

    expect(result.functions[0].instructions).toEqual(producer.instructions)
  })

  test('does not remove a temporary assignment read by another function', () => {
    const producer = mkFn([
      { kind: 'score_copy', dst: mkSlot('$shared_tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$shared_tmp') },
    ], 'producer')
    const consumer = mkFn([
      { kind: 'score_add', dst: mkSlot('$use'), src: mkSlot('$shared_tmp') },
    ], 'consumer')

    const result = scoreboardRmwPassModule(mkModule([producer, consumer]))

    expect(result.functions[0].instructions).toEqual(producer.instructions)
  })
})
