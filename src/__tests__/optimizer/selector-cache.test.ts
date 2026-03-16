import { selectorCache } from '../../optimizer/selector-cache'
import type { MIRFunction, MIRBlock, MIRInstr } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

describe('selectorCache', () => {
  test('replaces 2nd occurrence of repeated complex selector with tag', () => {
    const sel = '@e[type=zombie,distance=..10]'
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'call_context', fn: 'ns:attack', subcommands: [{ kind: 'as', selector: sel }] },
        { kind: 'call_context', fn: 'ns:move', subcommands: [{ kind: 'as', selector: sel }] },
      ], { kind: 'return', value: null }),
    ])
    const result = selectorCache(fn)
    const instrs = result.blocks[0].instrs

    // Should have prefix cleanup + tag-add + 2 original instrs = 4 total
    expect(instrs.length).toBe(4)

    // First two are prefix (cleanup, tag-add)
    expect(instrs[0].kind).toBe('call_context')
    expect((instrs[0] as any).fn).toMatch('__sel_cleanup_')
    expect(instrs[1].kind).toBe('call_context')
    expect((instrs[1] as any).fn).toMatch('__sel_tag_')

    // First actual use keeps original selector
    const first = instrs[2] as Extract<MIRInstr, { kind: 'call_context' }>
    const firstSub = first.subcommands[0]
    expect(firstSub.kind === 'as' || firstSub.kind === 'at').toBe(true)
    if (firstSub.kind === 'as' || firstSub.kind === 'at') {
      expect(firstSub.selector).toBe(sel)
    }

    // Second actual use uses tag selector
    const second = instrs[3] as Extract<MIRInstr, { kind: 'call_context' }>
    const secondSub = second.subcommands[0]
    expect(secondSub.kind === 'as' || secondSub.kind === 'at').toBe(true)
    if (secondSub.kind === 'as' || secondSub.kind === 'at') {
      expect(secondSub.selector).toMatch(/^@e\[tag=__cache_sel_/)
    }
  })

  test('does not cache simple selectors without [', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'call_context', fn: 'ns:a', subcommands: [{ kind: 'as', selector: '@s' }] },
        { kind: 'call_context', fn: 'ns:b', subcommands: [{ kind: 'as', selector: '@s' }] },
      ], { kind: 'return', value: null }),
    ])
    const result = selectorCache(fn)
    const instrs = result.blocks[0].instrs
    // No change — @s is simple
    expect(instrs).toHaveLength(2)
    expect((instrs[0] as any).fn).toBe('ns:a')
    expect((instrs[1] as any).fn).toBe('ns:b')
  })

  test('does not cache selector appearing only once', () => {
    const sel = '@e[type=zombie]'
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'call_context', fn: 'ns:a', subcommands: [{ kind: 'as', selector: sel }] },
      ], { kind: 'return', value: null }),
    ])
    const result = selectorCache(fn)
    expect(result.blocks[0].instrs).toHaveLength(1)
  })

  test('caches independently across blocks', () => {
    const sel = '@e[type=zombie]'
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'call_context', fn: 'ns:a', subcommands: [{ kind: 'as', selector: sel }] },
      ], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [
        { kind: 'call_context', fn: 'ns:b', subcommands: [{ kind: 'as', selector: sel }] },
        { kind: 'call_context', fn: 'ns:c', subcommands: [{ kind: 'as', selector: sel }] },
      ], { kind: 'return', value: null }),
    ])
    const result = selectorCache(fn)
    // entry block: only 1 occurrence → no change
    expect(result.blocks[0].instrs).toHaveLength(1)
    // b1 block: 2 occurrences → 2 prefix + 2 originals = 4
    expect(result.blocks[1].instrs).toHaveLength(4)
  })

  test('handles at subcommand as well as as', () => {
    const sel = '@e[type=creeper,distance=..5]'
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'call_context', fn: 'ns:a', subcommands: [{ kind: 'at', selector: sel }] },
        { kind: 'call_context', fn: 'ns:b', subcommands: [{ kind: 'at', selector: sel }] },
      ], { kind: 'return', value: null }),
    ])
    const result = selectorCache(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs).toHaveLength(4)
    const second = instrs[3] as Extract<MIRInstr, { kind: 'call_context' }>
    const secondSub = second.subcommands[0]
    expect(secondSub.kind === 'as' || secondSub.kind === 'at').toBe(true)
    if (secondSub.kind === 'as' || secondSub.kind === 'at') {
      expect(secondSub.selector).toMatch(/^@e\[tag=__cache_sel_/)
    }
  })
})
