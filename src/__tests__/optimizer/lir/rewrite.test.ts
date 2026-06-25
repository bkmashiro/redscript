import type { LIRFunction, LIRInstr, Slot } from '../../../lir/types'
import { hasConservativeBarrierBetween, applyLocalRewriteWindows } from '../../../optimizer/lir/rewrite'
import { isConservativeBarrierInstruction } from '../../../optimizer/lir/analysis'
import type { RewriteRule } from '../../../optimizer/lir/rewrite'

function mkSlot(player: string): Slot {
  return { player, obj: '__test' }
}

function mkFn(instructions: LIRInstr[], name = 'main'): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

const collapseRule: RewriteRule = (context): { replacement: LIRInstr[]; consume: number } | null => {
  const first = context.window[0]
  const second = context.window[1]
  if (!first || !second) return null
  if (first.kind === 'score_copy' && second.kind === 'score_copy' && first.dst.player === second.src.player && first.dst.obj === second.src.obj) {
    return { replacement: [second], consume: 2 }
  }
  return null
}

const skipOnBarrierRule: RewriteRule = (context): { replacement: LIRInstr[]; consume: number } | null => {
  const first = context.window[0]
  const second = context.window[1]
  const third = context.window[2]
  if (!first || !second || !third) return null
  if (
    first.kind === 'score_copy' &&
    second.kind === 'raw' &&
    third.kind === 'score_copy'
  ) {
    return { replacement: [first, third], consume: 3 }
  }
  return null
}

describe('local rewrite window harness', () => {
  test('rewrites adjacent windows deterministically and preserves unaffected sections', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_add', dst: mkSlot('$sum'), src: mkSlot('$one') },
    ])

    const result = applyLocalRewriteWindows(fn, [collapseRule], { maxWindowSize: 2 })

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_add', dst: mkSlot('$sum'), src: mkSlot('$one') },
    ])
  })

  test('does not rewrite through conservative barriers', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'raw', cmd: 'say barrier' },
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src2') },
    ])

    const result = applyLocalRewriteWindows(fn, [skipOnBarrierRule], {
      maxWindowSize: 3,
      isBarrier: isConservativeBarrierInstruction,
    })

    expect(result).toEqual(fn)
  })

  test('exposes conservative barrier helper for shared use', () => {
    const instructions: LIRInstr[] = [
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'raw', cmd: 'say barrier' },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]

    expect(hasConservativeBarrierBetween(instructions, 0, 2)).toBe(true)
    expect(hasConservativeBarrierBetween(instructions, 0, 1)).toBe(false)
  })
})
