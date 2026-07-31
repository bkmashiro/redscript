import { gunzipSync } from 'zlib'
import { ArtifactGraphError } from './model'

const MAX_NBT_BYTES = 64 * 1024 * 1024
const MAX_NBT_DEPTH = 128
const MAX_NBT_ELEMENTS = 4_000_000

class Cursor {
  private offset = 0
  private elements = 0

  constructor(private readonly bytes: Buffer) {}

  get remaining(): number {
    return this.bytes.length - this.offset
  }

  private need(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0 || this.remaining < length) {
      throw new ArtifactGraphError('Invalid NBT: truncated or oversized payload')
    }
  }

  private count(length = 1): void {
    this.elements += length
    if (this.elements > MAX_NBT_ELEMENTS) {
      throw new ArtifactGraphError(`Invalid NBT: element limit ${MAX_NBT_ELEMENTS} exceeded`)
    }
  }

  u8(): number {
    this.need(1)
    return this.bytes[this.offset++]
  }

  u16(): number {
    this.need(2)
    const value = this.bytes.readUInt16BE(this.offset)
    this.offset += 2
    return value
  }

  i32(): number {
    this.need(4)
    const value = this.bytes.readInt32BE(this.offset)
    this.offset += 4
    return value
  }

  skip(length: number): void {
    this.need(length)
    this.offset += length
  }

  string(): void {
    this.skip(this.u16())
  }

  payload(type: number, depth: number): void {
    if (depth > MAX_NBT_DEPTH) {
      throw new ArtifactGraphError(`Invalid NBT: nesting depth exceeds ${MAX_NBT_DEPTH}`)
    }
    this.count()
    switch (type) {
      case 1: this.skip(1); return
      case 2: this.skip(2); return
      case 3: this.skip(4); return
      case 4: this.skip(8); return
      case 5: this.skip(4); return
      case 6: this.skip(8); return
      case 7: {
        const length = this.i32()
        if (length < 0) throw new ArtifactGraphError('Invalid NBT: negative byte-array length')
        this.count(length)
        this.skip(length)
        return
      }
      case 8:
        this.string()
        return
      case 9: {
        const elementType = this.u8()
        const length = this.i32()
        if (elementType < 1 || elementType > 12 || length < 0) {
          throw new ArtifactGraphError('Invalid NBT: invalid list header')
        }
        this.count(length)
        for (let index = 0; index < length; index++) this.payload(elementType, depth + 1)
        return
      }
      case 10:
        while (true) {
          const childType = this.u8()
          if (childType === 0) return
          if (childType > 12) throw new ArtifactGraphError(`Invalid NBT: unknown tag type ${childType}`)
          this.string()
          this.payload(childType, depth + 1)
        }
      case 11: {
        const length = this.i32()
        if (length < 0 || length > Math.floor(MAX_NBT_BYTES / 4)) {
          throw new ArtifactGraphError('Invalid NBT: invalid int-array length')
        }
        this.count(length)
        this.skip(length * 4)
        return
      }
      case 12: {
        const length = this.i32()
        if (length < 0 || length > Math.floor(MAX_NBT_BYTES / 8)) {
          throw new ArtifactGraphError('Invalid NBT: invalid long-array length')
        }
        this.count(length)
        this.skip(length * 8)
        return
      }
      default:
        throw new ArtifactGraphError(`Invalid NBT: unknown tag type ${type}`)
    }
  }
}

export function validateNbt(input: Buffer): Buffer {
  let bytes: Buffer
  try {
    bytes = input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b
      ? gunzipSync(input, { maxOutputLength: MAX_NBT_BYTES })
      : Buffer.from(input)
  } catch (error) {
    throw new ArtifactGraphError(`Invalid NBT: unable to decompress payload (${(error as Error).message})`)
  }
  if (bytes.length === 0 || bytes.length > MAX_NBT_BYTES) {
    throw new ArtifactGraphError(`Invalid NBT: payload must be between 1 and ${MAX_NBT_BYTES} bytes`)
  }

  const cursor = new Cursor(bytes)
  const rootType = cursor.u8()
  if (rootType !== 10) throw new ArtifactGraphError('Invalid NBT: root tag must be a compound')
  cursor.string()
  cursor.payload(rootType, 0)
  if (cursor.remaining !== 0) throw new ArtifactGraphError('Invalid NBT: trailing bytes after root compound')
  return Buffer.from(input)
}
