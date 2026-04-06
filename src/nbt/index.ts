/**
 * Named Binary Tag (NBT) implementation for the Minecraft binary format.
 *
 * NBT is the structured binary serialisation format used throughout Minecraft
 * for world data, network packets, and data-command storage.  The string
 * encoding follows Java's "Modified UTF-8" variant:
 *   - U+0000 (null) is encoded as the two-byte sequence 0xC0 0x80 rather than
 *     the standard single-byte 0x00, ensuring no null byte appears in string
 *     data.
 *   - All other code-points follow standard CESU-8 / Java UTF-8 rules (i.e.
 *     supplementary characters are encoded as two surrogate halves, each three
 *     bytes, rather than the standard four-byte UTF-8 sequence).
 *
 * Public surface area:
 *   - {@link TagType}  — enum of all fourteen tag type identifiers.
 *   - {@link NbtTag}   — discriminated union of every possible tag value.
 *   - {@link writeNbt} — serialise a named root tag to a `Buffer`.
 *   - {@link readNbt}  — deserialise a `Buffer` back to a named root tag.
 *   - {@link nbt}      — factory helpers for constructing tag values.
 */
export const enum TagType {
  End = 0,
  Byte = 1,
  Short = 2,
  Int = 3,
  Long = 4,
  Float = 5,
  Double = 6,
  ByteArray = 7,
  String = 8,
  List = 9,
  Compound = 10,
  IntArray = 11,
  LongArray = 12,
}

export type EndTag = { type: TagType.End }
export type ByteTag = { type: TagType.Byte; value: number }
export type ShortTag = { type: TagType.Short; value: number }
export type IntTag = { type: TagType.Int; value: number }
export type LongTag = { type: TagType.Long; value: bigint }
export type FloatTag = { type: TagType.Float; value: number }
export type DoubleTag = { type: TagType.Double; value: number }
export type ByteArrayTag = { type: TagType.ByteArray; value: Int8Array }
export type StringTag = { type: TagType.String; value: string }
export type ListTag = { type: TagType.List; elementType: TagType; items: NbtTag[] }
export type CompoundTag = { type: TagType.Compound; entries: Map<string, NbtTag> }
export type IntArrayTag = { type: TagType.IntArray; value: Int32Array }
export type LongArrayTag = { type: TagType.LongArray; value: BigInt64Array }

export type NbtTag =
  | EndTag
  | ByteTag
  | ShortTag
  | IntTag
  | LongTag
  | FloatTag
  | DoubleTag
  | ByteArrayTag
  | StringTag
  | ListTag
  | CompoundTag
  | IntArrayTag
  | LongArrayTag

/**
 * Encode a JavaScript string to Modified UTF-8 inside a length-prefixed buffer.
 *
 * The encoding follows the Java / NBT Modified UTF-8 rules:
 *   - U+0001–U+007F  → single byte (standard ASCII).
 *   - U+0000         → two-byte sequence `0xC0 0x80` (null-safe encoding).
 *   - U+0080–U+07FF  → standard two-byte UTF-8.
 *   - U+0800–U+FFFF  → standard three-byte UTF-8 (including surrogate halves).
 *
 * The returned `Buffer` begins with a two-byte big-endian length giving the
 * number of encoded bytes, followed immediately by those bytes — exactly the
 * layout required by the NBT `TAG_String` payload.
 *
 * @param value - The string to encode.
 * @returns A `Buffer` containing the 2-byte length prefix followed by the
 *          Modified UTF-8 bytes.
 * @throws {Error} If the encoded byte length exceeds 65535 (0xFFFF), which is
 *         the maximum expressible in the two-byte length field.
 */
function encodeModifiedUtf8(value: string): Buffer {
  const bytes: number[] = []

  for (let i = 0; i < value.length; i++) {
    const codeUnit = value.charCodeAt(i)

    if (codeUnit !== 0 && codeUnit <= 0x7f) {
      bytes.push(codeUnit)
      continue
    }

    if (codeUnit <= 0x07ff) {
      bytes.push(
        0xc0 | ((codeUnit >> 6) & 0x1f),
        0x80 | (codeUnit & 0x3f)
      )
      continue
    }

    bytes.push(
      0xe0 | ((codeUnit >> 12) & 0x0f),
      0x80 | ((codeUnit >> 6) & 0x3f),
      0x80 | (codeUnit & 0x3f)
    )
  }

  if (bytes.length > 0xffff) {
    throw new Error(`NBT string is too long: ${bytes.length} bytes`)
  }

  const buffer = Buffer.allocUnsafe(2 + bytes.length)
  buffer.writeUInt16BE(bytes.length, 0)
  for (let i = 0; i < bytes.length; i++) {
    buffer[2 + i] = bytes[i]
  }
  return buffer
}

function decodeModifiedUtf8(buffer: Buffer, offset: number): { value: string; offset: number } {
  const byteLength = buffer.readUInt16BE(offset)
  offset += 2

  const codeUnits: number[] = []
  const end = offset + byteLength

  while (offset < end) {
    if (offset >= buffer.length) {
      throw new Error(`Malformed NBT string: unexpected end of buffer at offset ${offset}`)
    }
    const first = buffer[offset++]

    if ((first & 0x80) === 0) {
      codeUnits.push(first)
      continue
    }

    if ((first & 0xe0) === 0xc0) {
      if (offset >= buffer.length) {
        throw new Error(`Malformed NBT string: truncated 2-byte sequence at offset ${offset - 1}`)
      }
      const second = buffer[offset++]
      codeUnits.push(((first & 0x1f) << 6) | (second & 0x3f))
      continue
    }

    if (offset + 1 >= buffer.length) {
      throw new Error(`Malformed NBT string: truncated 3-byte sequence at offset ${offset - 1}`)
    }
    const second = buffer[offset++]
    const third = buffer[offset++]
    codeUnits.push(
      ((first & 0x0f) << 12) |
      ((second & 0x3f) << 6) |
      (third & 0x3f)
    )
  }

  return {
    value: String.fromCharCode(...codeUnits),
    offset,
  }
}

function writePayload(tag: NbtTag): Buffer {
  switch (tag.type) {
    case TagType.End:
      return Buffer.alloc(0)
    case TagType.Byte: {
      const buffer = Buffer.allocUnsafe(1)
      buffer.writeInt8(tag.value, 0)
      return buffer
    }
    case TagType.Short: {
      const buffer = Buffer.allocUnsafe(2)
      buffer.writeInt16BE(tag.value, 0)
      return buffer
    }
    case TagType.Int: {
      const buffer = Buffer.allocUnsafe(4)
      buffer.writeInt32BE(tag.value, 0)
      return buffer
    }
    case TagType.Long: {
      const buffer = Buffer.allocUnsafe(8)
      buffer.writeBigInt64BE(tag.value, 0)
      return buffer
    }
    case TagType.Float: {
      const buffer = Buffer.allocUnsafe(4)
      buffer.writeFloatBE(tag.value, 0)
      return buffer
    }
    case TagType.Double: {
      const buffer = Buffer.allocUnsafe(8)
      buffer.writeDoubleBE(tag.value, 0)
      return buffer
    }
    case TagType.ByteArray: {
      const header = Buffer.allocUnsafe(4)
      header.writeInt32BE(tag.value.length, 0)
      return Buffer.concat([header, Buffer.from(tag.value)])
    }
    case TagType.String:
      return encodeModifiedUtf8(tag.value)
    case TagType.List: {
      const header = Buffer.allocUnsafe(5)
      header.writeUInt8(tag.elementType, 0)
      header.writeInt32BE(tag.items.length, 1)
      return Buffer.concat([header, ...tag.items.map(writePayload)])
    }
    case TagType.Compound: {
      const parts: Buffer[] = []
      for (const [name, entry] of tag.entries) {
        parts.push(writeNamedTag(entry, name))
      }
      parts.push(Buffer.from([TagType.End]))
      return Buffer.concat(parts)
    }
    case TagType.IntArray: {
      const header = Buffer.allocUnsafe(4 + tag.value.length * 4)
      header.writeInt32BE(tag.value.length, 0)
      for (let i = 0; i < tag.value.length; i++) {
        header.writeInt32BE(tag.value[i], 4 + i * 4)
      }
      return header
    }
    case TagType.LongArray: {
      const header = Buffer.allocUnsafe(4 + tag.value.length * 8)
      header.writeInt32BE(tag.value.length, 0)
      for (let i = 0; i < tag.value.length; i++) {
        header.writeBigInt64BE(tag.value[i], 4 + i * 8)
      }
      return header
    }
  }
}

function writeNamedTag(tag: NbtTag, name: string): Buffer {
  if (tag.type === TagType.End) {
    throw new Error('TAG_End cannot be written as a named tag')
  }

  const nameBuffer = encodeModifiedUtf8(name)
  return Buffer.concat([
    Buffer.from([tag.type]),
    nameBuffer,
    writePayload(tag),
  ])
}

/**
 * Read an NBT payload of the given type from `buffer` starting at `offset`.
 *
 * Dispatches on `type` to parse exactly the bytes that belong to that tag
 * kind, then returns both the parsed tag and the updated buffer cursor so
 * callers can continue reading subsequent fields without manual accounting.
 *
 * Tag dispatch:
 *   - `End`       — zero bytes consumed; returns a bare `EndTag`.
 *   - `Byte`      — 1 byte (signed).
 *   - `Short`     — 2 bytes big-endian signed.
 *   - `Int`       — 4 bytes big-endian signed.
 *   - `Long`      — 8 bytes big-endian signed (returned as `bigint`).
 *   - `Float`     — 4 bytes big-endian IEEE 754.
 *   - `Double`    — 8 bytes big-endian IEEE 754.
 *   - `ByteArray` — 4-byte signed length prefix followed by that many bytes.
 *   - `String`    — Modified UTF-8 via `decodeModifiedUtf8`.
 *   - `List`      — 1-byte element type + 4-byte count, then N payloads of
 *                   that type read recursively.
 *   - `Compound`  — sequence of named tags terminated by a `TAG_End` byte.
 *   - `IntArray`  — 4-byte count then that many 4-byte big-endian ints.
 *   - `LongArray` — 4-byte count then that many 8-byte big-endian longs.
 *
 * @param type   - The `TagType` identifying which payload layout to parse.
 * @param buffer - The source `Buffer` to read from.
 * @param offset - Byte position in `buffer` where the payload begins.
 * @returns An object containing the parsed `tag` and the `offset` pointing
 *          to the first byte after the consumed payload.
 * @throws {Error} If `type` is not one of the fourteen recognised tag IDs.
 */
function readPayload(type: TagType, buffer: Buffer, offset: number): { tag: NbtTag; offset: number } {
  switch (type) {
    case TagType.End:
      return { tag: { type: TagType.End }, offset }
    case TagType.Byte:
      return { tag: { type: type, value: buffer.readInt8(offset) }, offset: offset + 1 }
    case TagType.Short:
      return { tag: { type: type, value: buffer.readInt16BE(offset) }, offset: offset + 2 }
    case TagType.Int:
      return { tag: { type: type, value: buffer.readInt32BE(offset) }, offset: offset + 4 }
    case TagType.Long:
      return { tag: { type: type, value: buffer.readBigInt64BE(offset) }, offset: offset + 8 }
    case TagType.Float:
      return { tag: { type: type, value: buffer.readFloatBE(offset) }, offset: offset + 4 }
    case TagType.Double:
      return { tag: { type: type, value: buffer.readDoubleBE(offset) }, offset: offset + 8 }
    case TagType.ByteArray: {
      const length = buffer.readInt32BE(offset)
      offset += 4
      const value = new Int8Array(length)
      for (let i = 0; i < length; i++) {
        value[i] = buffer.readInt8(offset + i)
      }
      return { tag: { type, value }, offset: offset + length }
    }
    case TagType.String: {
      const decoded = decodeModifiedUtf8(buffer, offset)
      return { tag: { type, value: decoded.value }, offset: decoded.offset }
    }
    case TagType.List: {
      const elementType = buffer.readUInt8(offset) as TagType
      const length = buffer.readInt32BE(offset + 1)
      offset += 5
      const items: NbtTag[] = []
      for (let i = 0; i < length; i++) {
        const parsed = readPayload(elementType, buffer, offset)
        items.push(parsed.tag)
        offset = parsed.offset
      }
      return { tag: { type, elementType, items }, offset }
    }
    case TagType.Compound: {
      const entries = new Map<string, NbtTag>()
      while (true) {
        const entryType = buffer.readUInt8(offset) as TagType
        offset += 1
        if (entryType === TagType.End) break
        const name = decodeModifiedUtf8(buffer, offset)
        offset = name.offset
        const parsed = readPayload(entryType, buffer, offset)
        entries.set(name.value, parsed.tag)
        offset = parsed.offset
      }
      return { tag: { type, entries }, offset }
    }
    case TagType.IntArray: {
      const length = buffer.readInt32BE(offset)
      offset += 4
      const value = new Int32Array(length)
      for (let i = 0; i < length; i++) {
        value[i] = buffer.readInt32BE(offset + i * 4)
      }
      return { tag: { type, value }, offset: offset + length * 4 }
    }
    case TagType.LongArray: {
      const length = buffer.readInt32BE(offset)
      offset += 4
      const value = new BigInt64Array(length)
      for (let i = 0; i < length; i++) {
        value[i] = buffer.readBigInt64BE(offset + i * 8)
      }
      return { tag: { type, value }, offset: offset + length * 8 }
    }
    default:
      throw new Error(`Unsupported NBT tag type: ${type}`)
  }
}

export function writeNbt(tag: NbtTag, name: string): Buffer {
  return writeNamedTag(tag, name)
}

export function readNbt(buffer: Buffer): { name: string; tag: NbtTag } {
  let offset = 0
  const type = buffer.readUInt8(offset) as TagType
  offset += 1

  if (type === TagType.End) {
    throw new Error('Invalid root tag: TAG_End')
  }

  const decodedName = decodeModifiedUtf8(buffer, offset)
  offset = decodedName.offset
  const parsed = readPayload(type, buffer, offset)

  return {
    name: decodedName.value,
    tag: parsed.tag,
  }
}

/**
 * Factory helpers for constructing typed NBT tag values.
 *
 * Each helper wraps the given primitive in the appropriate `NbtTag` variant so
 * call-sites stay readable without manually specifying `type` discriminants.
 *
 * @example
 * ```ts
 * const tag = nbt.compound({
 *   x: nbt.int(128),
 *   label: nbt.string('spawn'),
 *   flags: nbt.byteArray([1, 0, 1]),
 * })
 * const buf = writeNbt(tag, 'data')
 * ```
 *
 * @property byte      - Wraps a signed 8-bit integer (`-128`–`127`).
 * @property short     - Wraps a signed 16-bit integer.
 * @property int       - Wraps a signed 32-bit integer.
 * @property long      - Wraps a signed 64-bit integer (`bigint`).
 * @property float     - Wraps an IEEE 754 single-precision float.
 * @property double    - Wraps an IEEE 754 double-precision float.
 * @property string    - Wraps a string (encoded as Modified UTF-8 on write).
 * @property list      - Wraps a homogeneous array; `elementType` must match
 *                       every item in `items`.
 * @property compound  - Wraps a `Record<string, NbtTag>` as a `Map`-backed
 *                       compound tag.
 * @property intArray  - Wraps an array of numbers as an `Int32Array`.
 * @property byteArray - Wraps an array of numbers as an `Int8Array`.
 */
export const nbt = {
  byte: (value: number): ByteTag => ({ type: TagType.Byte, value }),
  short: (value: number): ShortTag => ({ type: TagType.Short, value }),
  int: (value: number): IntTag => ({ type: TagType.Int, value }),
  long: (value: bigint): LongTag => ({ type: TagType.Long, value }),
  float: (value: number): FloatTag => ({ type: TagType.Float, value }),
  double: (value: number): DoubleTag => ({ type: TagType.Double, value }),
  string: (value: string): StringTag => ({ type: TagType.String, value }),
  list: (elementType: TagType, items: NbtTag[]): ListTag => ({ type: TagType.List, elementType, items }),
  compound: (entries: Record<string, NbtTag>): CompoundTag =>
    ({ type: TagType.Compound, entries: new Map(Object.entries(entries)) }),
  intArray: (values: number[]): IntArrayTag => ({ type: TagType.IntArray, value: Int32Array.from(values) }),
  byteArray: (values: number[]): ByteArrayTag => ({ type: TagType.ByteArray, value: Int8Array.from(values) }),
}
