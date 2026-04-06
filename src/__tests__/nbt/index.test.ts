import { nbt, readNbt, writeNbt, TagType } from '../../nbt/index'

// ─── helpers ──────────────────────────────────────────────────────────────────

function roundtrip<T extends Parameters<typeof writeNbt>[0]>(tag: T, name = 'root') {
  const buf = writeNbt(tag, name)
  return readNbt(buf)
}

// ─── modified UTF-8: supplementary characters (surrogate pairs) ───────────────

describe('modified UTF-8: supplementary characters', () => {
  it('roundtrips a supplementary character (U+1F600 😀)', () => {
    // JS represents U+1F600 as two UTF-16 code units: \uD83D\uDE00
    // encodeModifiedUtf8 encodes each surrogate as a 3-byte sequence
    const emoji = '\u{1F600}'
    const { tag } = roundtrip(nbt.string(emoji))
    expect((tag as { value: string }).value).toBe(emoji)
  })

  it('roundtrips a string mixing ASCII, BMP, and supplementary chars', () => {
    const mixed = 'hi\u4e2d\u{1F4A1}end'
    const { tag } = roundtrip(nbt.string(mixed))
    expect((tag as { value: string }).value).toBe(mixed)
  })

  it('roundtrips a string containing only supplementary characters', () => {
    const str = '\u{10000}\u{10FFFF}'
    const { tag } = roundtrip(nbt.string(str))
    expect((tag as { value: string }).value).toBe(str)
  })
})

// ─── modified UTF-8: null byte encoding ──────────────────────────────────────

describe('modified UTF-8: null byte', () => {
  it('encodes \\u0000 as 0xC0 0x80, not a raw zero byte', () => {
    const buf = writeNbt(nbt.string('\u0000'), 'k')
    // Layout: [type:1][name-len:2][name:0][str-len:2][encoded-bytes...]
    // type=8(String), name='k'(1 byte) → offset of string payload = 1+2+1 = 4
    // str-len at offset 4, encoded bytes start at offset 6
    const strLen = buf.readUInt16BE(4)
    expect(strLen).toBe(2) // 2-byte modified UTF-8 encoding of U+0000
    expect(buf[6]).toBe(0xc0)
    expect(buf[7]).toBe(0x80)
  })

  it('roundtrips a string with null bytes at start, middle, and end', () => {
    const str = '\u0000hello\u0000world\u0000'
    const { tag } = roundtrip(nbt.string(str))
    expect((tag as { value: string }).value).toBe(str)
  })

  it('roundtrips a string composed entirely of null bytes', () => {
    const str = '\u0000\u0000\u0000'
    const { tag } = roundtrip(nbt.string(str))
    expect((tag as { value: string }).value).toBe(str)
  })
})

// ─── decodeModifiedUtf8: bounds checking on truncated buffers ─────────────────

describe('decodeModifiedUtf8: truncated buffer errors', () => {
  // Helper: craft a raw buffer as if returned by writeNbt for a string tag,
  // then lop off bytes from the end to simulate truncation.
  function truncatedStringBuffer(value: string, chopBytes: number): Buffer {
    const full = writeNbt(nbt.string(value), 'k')
    return full.subarray(0, full.length - chopBytes) as Buffer
  }

  it('throws on a truncated 2-byte sequence (missing continuation byte)', () => {
    // '\u00e9' (é) encodes as 0xC3 0xA9 — remove last byte
    const buf = truncatedStringBuffer('\u00e9', 1)
    expect(() => readNbt(buf)).toThrow('Malformed NBT string')
  })

  it('throws on a truncated 3-byte sequence (missing second byte)', () => {
    // '\u4e2d' (中) encodes as 0xE4 0xB8 0xAD — remove last two bytes
    const buf = truncatedStringBuffer('\u4e2d', 2)
    expect(() => readNbt(buf)).toThrow('Malformed NBT string')
  })

  it('throws on a truncated 3-byte sequence (missing third byte)', () => {
    // '\u4e2d' encodes as 3 bytes — remove last one
    const buf = truncatedStringBuffer('\u4e2d', 1)
    expect(() => readNbt(buf)).toThrow('Malformed NBT string')
  })

  it('throws when string length header claims more bytes than the buffer holds', () => {
    // Build a valid buffer then manually overwrite the string-length header
    // to claim 50 bytes when only a few are present.
    const buf = Buffer.from(writeNbt(nbt.string('ab'), 'k'))
    // String payload starts at offset 4 (1 type + 2 name-len + 1 name char)
    buf.writeUInt16BE(50, 4)
    expect(() => readNbt(buf)).toThrow('Malformed NBT string')
  })
})

// ─── ByteArray: edge cases ────────────────────────────────────────────────────

describe('ByteArray tag', () => {
  it('roundtrips a single-element array', () => {
    const { tag } = roundtrip(nbt.byteArray([42]))
    expect(Array.from((tag as { value: Int8Array }).value)).toEqual([42])
  })

  it('roundtrips min and max signed byte values', () => {
    const { tag } = roundtrip(nbt.byteArray([-128, 127]))
    expect(Array.from((tag as { value: Int8Array }).value)).toEqual([-128, 127])
  })

  it('roundtrips a large array preserving order', () => {
    const values = Array.from({ length: 256 }, (_, i) => (i % 256) - 128)
    const { tag } = roundtrip(nbt.byteArray(values))
    expect(Array.from((tag as { value: Int8Array }).value)).toEqual(values)
  })
})

// ─── IntArray: edge cases ────────────────────────────────────────────────────

describe('IntArray tag', () => {
  it('roundtrips a single-element array', () => {
    const { tag } = roundtrip(nbt.intArray([99]))
    expect(Array.from((tag as { value: Int32Array }).value)).toEqual([99])
  })

  it('roundtrips min and max int32 values', () => {
    const { tag } = roundtrip(nbt.intArray([-2147483648, 2147483647]))
    expect(Array.from((tag as { value: Int32Array }).value)).toEqual([-2147483648, 2147483647])
  })

  it('roundtrips a mixed array with zeros and negatives', () => {
    const values = [0, -1, 1, -2147483648, 2147483647]
    const { tag } = roundtrip(nbt.intArray(values))
    expect(Array.from((tag as { value: Int32Array }).value)).toEqual(values)
  })
})

// ─── LongArray: edge cases ────────────────────────────────────────────────────

describe('LongArray tag', () => {
  function longArrayTag(values: bigint[]) {
    return { type: TagType.LongArray as const, value: new BigInt64Array(values) }
  }

  it('roundtrips a single-element array', () => {
    const buf = writeNbt(longArrayTag([42n]), 'root')
    const { tag } = readNbt(buf)
    expect(Array.from((tag as { value: BigInt64Array }).value)).toEqual([42n])
  })

  it('roundtrips min and max int64 values', () => {
    const values = [-9223372036854775808n, 9223372036854775807n]
    const buf = writeNbt(longArrayTag(values), 'root')
    const { tag } = readNbt(buf)
    expect(Array.from((tag as { value: BigInt64Array }).value)).toEqual(values)
  })

  it('roundtrips a mixed array with zero and negatives', () => {
    const values = [0n, -1n, 1n, -9223372036854775808n, 9223372036854775807n]
    const buf = writeNbt(longArrayTag(values), 'root')
    const { tag } = readNbt(buf)
    expect(Array.from((tag as { value: BigInt64Array }).value)).toEqual(values)
  })

  it('roundtrips an empty array', () => {
    const buf = writeNbt(longArrayTag([]), 'root')
    const { tag } = readNbt(buf)
    expect((tag as { value: BigInt64Array }).value).toEqual(new BigInt64Array(0))
  })
})
