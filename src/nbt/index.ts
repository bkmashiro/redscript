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
    const first = buffer[offset++]

    if ((first & 0x80) === 0) {
      codeUnits.push(first)
      continue
    }

    if ((first & 0xe0) === 0xc0) {
      const second = buffer[offset++]
      codeUnits.push(((first & 0x1f) << 6) | (second & 0x3f))
      continue
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
