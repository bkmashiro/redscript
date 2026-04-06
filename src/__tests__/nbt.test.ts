import { nbt, readNbt, writeNbt, TagType } from '../nbt/index'

// ─── helpers ────────────────────────────────────────────────────────────────

function roundtrip(tag: ReturnType<typeof nbt[keyof typeof nbt]>, name = 'root') {
  const buf = writeNbt(tag as Parameters<typeof writeNbt>[0], name)
  return readNbt(buf)
}

// ─── UTF-8 encoding edge cases ──────────────────────────────────────────────

describe('encodeModifiedUtf8 / decodeModifiedUtf8', () => {
  it('roundtrips an empty string', () => {
    const { name, tag } = roundtrip(nbt.string(''), 'key')
    expect(name).toBe('key')
    expect((tag as { value: string }).value).toBe('')
  })

  it('roundtrips ASCII text unchanged', () => {
    const { tag } = roundtrip(nbt.string('hello world'), 'k')
    expect((tag as { value: string }).value).toBe('hello world')
  })

  it('encodes null character (\\u0000) as two-byte sequence', () => {
    // Modified UTF-8: U+0000 → 0xC0 0x80 (not a single 0x00 byte)
    const { tag } = roundtrip(nbt.string('\u0000'), 'k')
    expect((tag as { value: string }).value).toBe('\u0000')
  })

  it('roundtrips two-byte unicode characters (U+0080–U+07FF)', () => {
    const { tag } = roundtrip(nbt.string('\u00e9\u00e0\u00fc'), 'k') // é à ü
    expect((tag as { value: string }).value).toBe('\u00e9\u00e0\u00fc')
  })

  it('roundtrips three-byte unicode characters (U+0800–U+FFFF)', () => {
    const { tag } = roundtrip(nbt.string('\u4e2d\u6587'), 'k') // 中文
    expect((tag as { value: string }).value).toBe('\u4e2d\u6587')
  })

  it('roundtrips a string whose name also contains unicode', () => {
    const tag = nbt.byte(1)
    const buf = writeNbt(tag, '\u4e2d')
    const { name } = readNbt(buf)
    expect(name).toBe('\u4e2d')
  })

  it('throws when encoded bytes exceed 0xffff', () => {
    // Each three-byte code-unit contributes 3 bytes; ~22000 of them > 65535
    const longStr = '\u4e2d'.repeat(22000)
    expect(() => nbt.string(longStr) && writeNbt(nbt.string(longStr), 'k')).toThrow(
      'NBT string is too long'
    )
  })

  it('does not throw for a string exactly at the 0xffff byte boundary', () => {
    // ASCII chars are 1 byte each; 65535 'a' chars produce exactly 0xffff bytes
    const maxStr = 'a'.repeat(0xffff)
    expect(() => writeNbt(nbt.string(maxStr), 'k')).not.toThrow()
  })
})

// ─── roundtrip for all 12 tag types ─────────────────────────────────────────

describe('roundtrip serialization', () => {
  it('byte: positive value', () => {
    const { tag } = roundtrip(nbt.byte(42))
    expect(tag).toEqual({ type: TagType.Byte, value: 42 })
  })

  it('byte: negative value', () => {
    const { tag } = roundtrip(nbt.byte(-1))
    expect(tag).toEqual({ type: TagType.Byte, value: -1 })
  })

  it('byte: boundary values (-128 and 127)', () => {
    expect((roundtrip(nbt.byte(-128)).tag as { value: number }).value).toBe(-128)
    expect((roundtrip(nbt.byte(127)).tag as { value: number }).value).toBe(127)
  })

  it('short: positive and negative', () => {
    expect((roundtrip(nbt.short(32767)).tag as { value: number }).value).toBe(32767)
    expect((roundtrip(nbt.short(-32768)).tag as { value: number }).value).toBe(-32768)
  })

  it('int: positive and negative', () => {
    expect((roundtrip(nbt.int(2147483647)).tag as { value: number }).value).toBe(2147483647)
    expect((roundtrip(nbt.int(-2147483648)).tag as { value: number }).value).toBe(-2147483648)
  })

  it('int: zero', () => {
    expect((roundtrip(nbt.int(0)).tag as { value: number }).value).toBe(0)
  })

  it('long: large positive bigint', () => {
    const val = 9223372036854775807n
    expect((roundtrip(nbt.long(val)).tag as { value: bigint }).value).toBe(val)
  })

  it('long: large negative bigint', () => {
    const val = -9223372036854775808n
    expect((roundtrip(nbt.long(val)).tag as { value: bigint }).value).toBe(val)
  })

  it('long: zero', () => {
    expect((roundtrip(nbt.long(0n)).tag as { value: bigint }).value).toBe(0n)
  })

  it('float: ordinary value', () => {
    // Floats lose precision in 32-bit representation
    const buf = writeNbt(nbt.float(3.14), 'root')
    const { tag } = readNbt(buf)
    expect((tag as { value: number }).value).toBeCloseTo(3.14, 5)
  })

  it('float: zero and negative', () => {
    expect((roundtrip(nbt.float(0)).tag as { value: number }).value).toBe(0)
    const buf = writeNbt(nbt.float(-1.5), 'root')
    const { tag } = readNbt(buf)
    expect((tag as { value: number }).value).toBeCloseTo(-1.5, 5)
  })

  it('double: full 64-bit precision', () => {
    const val = Math.PI
    expect((roundtrip(nbt.double(val)).tag as { value: number }).value).toBe(val)
  })

  it('byteArray: empty array', () => {
    const { tag } = roundtrip(nbt.byteArray([]))
    expect((tag as { value: Int8Array }).value).toEqual(new Int8Array(0))
  })

  it('byteArray: values roundtrip correctly', () => {
    const { tag } = roundtrip(nbt.byteArray([1, -1, 127, -128]))
    expect(Array.from((tag as { value: Int8Array }).value)).toEqual([1, -1, 127, -128])
  })

  it('string: empty', () => {
    const { tag } = roundtrip(nbt.string(''))
    expect((tag as { value: string }).value).toBe('')
  })

  it('string: unicode content', () => {
    const { tag } = roundtrip(nbt.string('hello \u4e16\u754c'))
    expect((tag as { value: string }).value).toBe('hello \u4e16\u754c')
  })

  it('list: empty list of ints', () => {
    const { tag } = roundtrip(nbt.list(TagType.Int, []))
    const list = tag as { elementType: TagType; items: unknown[] }
    expect(list.elementType).toBe(TagType.Int)
    expect(list.items).toHaveLength(0)
  })

  it('list: list of bytes', () => {
    const { tag } = roundtrip(nbt.list(TagType.Byte, [nbt.byte(1), nbt.byte(2), nbt.byte(3)]))
    const list = tag as { elementType: TagType; items: Array<{ value: number }> }
    expect(list.elementType).toBe(TagType.Byte)
    expect(list.items.map(i => i.value)).toEqual([1, 2, 3])
  })

  it('list: nested list of strings', () => {
    const { tag } = roundtrip(nbt.list(TagType.String, [nbt.string('a'), nbt.string('b')]))
    const list = tag as { items: Array<{ value: string }> }
    expect(list.items.map(i => i.value)).toEqual(['a', 'b'])
  })

  it('compound: empty', () => {
    const { tag } = roundtrip(nbt.compound({}))
    const compound = tag as { entries: Map<string, unknown> }
    expect(compound.entries.size).toBe(0)
  })

  it('compound: single entry', () => {
    const { tag } = roundtrip(nbt.compound({ health: nbt.int(20) }))
    const compound = tag as { entries: Map<string, { value: number }> }
    expect(compound.entries.get('health')?.value).toBe(20)
  })

  it('compound: multiple mixed entries', () => {
    const { tag } = roundtrip(
      nbt.compound({ x: nbt.int(1), name: nbt.string('Steve'), alive: nbt.byte(1) })
    )
    const entries = (tag as { entries: Map<string, NbtValue> }).entries
    expect((entries.get('x') as { value: number }).value).toBe(1)
    expect((entries.get('name') as { value: string }).value).toBe('Steve')
    expect((entries.get('alive') as { value: number }).value).toBe(1)
  })

  it('compound: nested compound', () => {
    const inner = nbt.compound({ level: nbt.int(5) })
    const { tag } = roundtrip(nbt.compound({ player: inner }))
    const outer = (tag as { entries: Map<string, { entries: Map<string, { value: number }> }> }).entries
    expect(outer.get('player')?.entries.get('level')?.value).toBe(5)
  })

  it('intArray: empty', () => {
    const { tag } = roundtrip(nbt.intArray([]))
    expect((tag as { value: Int32Array }).value).toEqual(new Int32Array(0))
  })

  it('intArray: values roundtrip correctly', () => {
    const { tag } = roundtrip(nbt.intArray([0, 1, -1, 2147483647, -2147483648]))
    expect(Array.from((tag as { value: Int32Array }).value)).toEqual([0, 1, -1, 2147483647, -2147483648])
  })

  it('longArray: empty', () => {
    // nbt helper does not expose longArray, build manually
    const buf = writeNbt({ type: TagType.LongArray, value: new BigInt64Array(0) }, 'root')
    const { tag } = readNbt(buf)
    expect((tag as { value: BigInt64Array }).value).toEqual(new BigInt64Array(0))
  })

  it('longArray: values roundtrip correctly', () => {
    const values = new BigInt64Array([0n, 1n, -1n, 9223372036854775807n])
    const buf = writeNbt({ type: TagType.LongArray, value: values }, 'root')
    const { tag } = readNbt(buf)
    expect(Array.from((tag as { value: BigInt64Array }).value)).toEqual(Array.from(values))
  })
})

// ─── unsupported tag type error path (line 281) ──────────────────────────────

describe('readPayload unsupported tag type', () => {
  it('throws for an unknown tag type id in a buffer', () => {
    // Craft a buffer with type byte = 99 (unrecognised), followed by an empty name (2 zero bytes)
    // and no payload. readNbt reads the type byte then delegates to readPayload.
    const buf = Buffer.from([99, 0, 0]) // type=99, name length=0
    expect(() => readNbt(buf)).toThrow('Unsupported NBT tag type: 99')
  })
})

// ─── readNbt: invalid root tag ────────────────────────────────────────────────

describe('readNbt root-tag validation', () => {
  it('throws when root tag is TAG_End (type 0)', () => {
    const buf = Buffer.from([0])
    expect(() => readNbt(buf)).toThrow('Invalid root tag: TAG_End')
  })
})

// ─── writeNbt: root name is preserved ────────────────────────────────────────

describe('writeNbt', () => {
  it('preserves the root tag name on read', () => {
    const buf = writeNbt(nbt.int(42), 'myTag')
    const { name } = readNbt(buf)
    expect(name).toBe('myTag')
  })

  it('preserves an empty root name', () => {
    const buf = writeNbt(nbt.int(1), '')
    const { name } = readNbt(buf)
    expect(name).toBe('')
  })
})

// helper type to avoid 'any' in compound assertions
type NbtValue = { value: unknown; entries?: Map<string, NbtValue> }
