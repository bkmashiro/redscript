import * as fs from 'fs'

import { compileToStructure } from '../codegen/structure'
import { nbt, readNbt, TagType, writeNbt, type CompoundTag } from '../nbt'

describe('NBT codec', () => {
  test('round-trips a compound tag', () => {
    const tag = nbt.compound({ x: nbt.int(42), name: nbt.string('test') })
    const buf = writeNbt(tag, 'root')
    const parsed = readNbt(buf)

    expect(parsed.name).toBe('root')
    expect(parsed.tag).toEqual(tag)
  })

  test('round-trips nested lists and arrays', () => {
    const tag = nbt.compound({
      nested: nbt.list(TagType.Compound, [
        nbt.compound({ values: nbt.intArray([1, 2, 3]) }),
        nbt.compound({ bytes: nbt.byteArray([-1, 0, 1]) }),
      ]),
      longs: { type: TagType.LongArray, value: BigInt64Array.from([1n, 2n, 3n]) },
    })

    const buf = writeNbt(tag, 'root')
    const parsed = readNbt(buf)

    expect(parsed.tag).toEqual(tag)
  })

  test('handles longs correctly', () => {
    const tag = nbt.compound({ ts: nbt.long(9007199254740993n) })
    const buf = writeNbt(tag, '')
    const parsed = readNbt(buf)
    const root = parsed.tag as CompoundTag

    expect(root.entries.get('ts')).toEqual(nbt.long(9007199254740993n))
    expect((root.entries.get('ts') as { value: bigint }).value).toBe(9007199254740993n)
  })
})

describe('Structure generator', () => {
  test('compiles counter.mcrs to a non-empty structure', () => {
    const filePath = 'src/examples/counter.mcrs'
    const src = fs.readFileSync(filePath, 'utf-8')
    const { buffer, blockCount } = compileToStructure(src, 'counter', filePath)

    expect(buffer.length).toBeGreaterThan(100)
    expect(blockCount).toBeGreaterThan(0)

    const parsed = readNbt(buffer)
    const root = parsed.tag as CompoundTag
    const blocks = root.entries.get('blocks')

    expect(parsed.name).toBe('')
    expect(blocks?.type).toBe(TagType.List)
  })
})
