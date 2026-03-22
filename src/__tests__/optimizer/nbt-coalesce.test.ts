import { nbtCoalesce } from '../../optimizer/nbt-coalesce'
import type { MIRBlock, MIRFunction, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const c = (value: number): Operand => ({ kind: 'const', value })
const t = (name: string): Operand => ({ kind: 'temp', name })

describe('nbt write coalescing', () => {
  test('removes all but the last write to the same path', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(1) },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(2) },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(3) },
      ], { kind: 'return', value: null }),
    ])

    const result = nbtCoalesce(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs).toHaveLength(1)
    expect(instrs[0]).toMatchObject({ kind: 'nbt_write', src: c(3) })
  })

  test('keeps write when followed by a read of the same path', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(1) },
        { kind: 'nbt_read', dst: 't0', ns: 'rs:vars', path: 'Foo', scale: 1 },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = nbtCoalesce(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs).toHaveLength(2)
    expect(instrs[0]).toMatchObject({ kind: 'nbt_write' })
    expect(instrs[1]).toMatchObject({ kind: 'nbt_read' })
  })

  test('write before read then another write — first kept, second coalesced', () => {
    // write(1), read, write(2), write(3) → write(1), read, write(3)
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(1) },
        { kind: 'nbt_read', dst: 't0', ns: 'rs:vars', path: 'Foo', scale: 1 },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(2) },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(3) },
      ], { kind: 'return', value: null }),
    ])

    const result = nbtCoalesce(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs).toHaveLength(3)
    expect(instrs[0]).toMatchObject({ kind: 'nbt_write', src: c(1) })
    expect(instrs[1]).toMatchObject({ kind: 'nbt_read' })
    expect(instrs[2]).toMatchObject({ kind: 'nbt_write', src: c(3) })
  })

  test('call interrupts coalescing — write before call is kept', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(1) },
        { kind: 'call', dst: null, fn: 'some_fn', args: [] },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(2) },
      ], { kind: 'return', value: null }),
    ])

    const result = nbtCoalesce(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs).toHaveLength(3)
    expect(instrs[0]).toMatchObject({ kind: 'nbt_write', src: c(1) })
    expect(instrs[2]).toMatchObject({ kind: 'nbt_write', src: c(2) })
  })

  test('different paths do not interfere with each other', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(1) },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Bar', type: 'int', scale: 1, src: c(10) },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(2) },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Bar', type: 'int', scale: 1, src: c(20) },
      ], { kind: 'return', value: null }),
    ])

    const result = nbtCoalesce(fn)
    const instrs = result.blocks[0].instrs

    // Only the last write to each path survives
    expect(instrs).toHaveLength(2)
    expect(instrs[0]).toMatchObject({ kind: 'nbt_write', path: 'Foo', src: c(2) })
    expect(instrs[1]).toMatchObject({ kind: 'nbt_write', path: 'Bar', src: c(20) })
  })

  test('same path different namespaces are treated independently', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(1) },
        { kind: 'nbt_write', ns: 'rs:other', path: 'Foo', type: 'int', scale: 1, src: c(2) },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'Foo', type: 'int', scale: 1, src: c(3) },
      ], { kind: 'return', value: null }),
    ])

    const result = nbtCoalesce(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs).toHaveLength(2)
    expect(instrs[0]).toMatchObject({ ns: 'rs:other', src: c(2) })
    expect(instrs[1]).toMatchObject({ ns: 'rs:vars', src: c(3) })
  })

  test('nbt_list_len read prevents deletion of preceding write', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:vars', path: 'MyList', type: 'int', scale: 1, src: c(0) },
        { kind: 'nbt_list_len', dst: 't0', ns: 'rs:vars', path: 'MyList' },
        { kind: 'nbt_write', ns: 'rs:vars', path: 'MyList', type: 'int', scale: 1, src: c(99) },
      ], { kind: 'return', value: null }),
    ])

    const result = nbtCoalesce(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs).toHaveLength(3)
  })

  test('no writes — block is unchanged', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: 'rs:vars', path: 'Foo', scale: 1 },
        { kind: 'add', dst: 't1', a: t('t0'), b: c(1) },
      ], { kind: 'return', value: t('t1') }),
    ])

    const result = nbtCoalesce(fn)
    expect(result.blocks[0].instrs).toHaveLength(2)
  })
})
