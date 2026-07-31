import * as fs from 'fs'
import * as path from 'path'
import type { DatapackArtifactGraph } from './model'
import { ArtifactGraphError } from './model'

const ZIP_UTF8_FLAG = 0x0800
const ZIP_DOS_EPOCH_DATE = 33 // 1980-01-01
const MAX_ZIP_ENTRIES = 0xffff
const MAX_ZIP_BYTES = 512 * 1024 * 1024

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let value = 0; value < 256; value++) {
    let crc = value
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
    table[value] = crc >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function token(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function containedPath(root: string, relativePath: string): string {
  const destination = path.resolve(root, ...relativePath.split('/'))
  const relative = path.relative(root, destination)
  if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new ArtifactGraphError(`Artifact projection path escapes output root: '${relativePath}'`)
  }
  return destination
}

function replaceAtomically(staged: string, output: string): void {
  const backup = `${output}.redscript-backup-${token()}`
  let backedUp = false
  try {
    if (fs.existsSync(output)) {
      fs.renameSync(output, backup)
      backedUp = true
    }
    fs.renameSync(staged, output)
  } catch (error) {
    if (backedUp && !fs.existsSync(output) && fs.existsSync(backup)) fs.renameSync(backup, output)
    throw error
  }
  if (backedUp) {
    try {
      fs.rmSync(backup, { recursive: true, force: true })
    } catch {
      // The new output is already committed. A hidden backup is safer than
      // deleting or reporting failure for a successful atomic replacement.
    }
  }
}

export function writeArtifactDirectoryAtomically(
  graph: DatapackArtifactGraph,
  outputPath: string,
): void {
  const output = path.resolve(outputPath)
  const parent = path.dirname(output)
  fs.mkdirSync(parent, { recursive: true })
  const staged = path.join(parent, `.${path.basename(output)}.redscript-stage-${token()}`)
  fs.mkdirSync(staged, { mode: 0o755 })

  try {
    for (const artifact of graph.artifacts) {
      const destination = containedPath(staged, artifact.outputPath)
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 })
      fs.writeFileSync(destination, Buffer.from(artifact.content), { flag: 'wx', mode: 0o644 })
    }
    replaceAtomically(staged, output)
  } catch (error) {
    fs.rmSync(staged, { recursive: true, force: true })
    throw error
  }
}

interface ZipEntryRecord {
  readonly name: Buffer
  readonly content: Buffer
  readonly checksum: number
  readonly localOffset: number
}

/**
 * Encode a deterministic ZIP32 archive using STORE entries. STORE avoids zlib
 * version drift; fixed DOS timestamps, modes, flags, and sorted graph paths
 * make equal artifact graphs byte-identical across hosts.
 */
export function encodeArtifactZip(graph: DatapackArtifactGraph): Buffer {
  if (graph.artifacts.length > MAX_ZIP_ENTRIES) {
    throw new ArtifactGraphError(`ZIP projection exceeds ${MAX_ZIP_ENTRIES} entries`)
  }

  const localParts: Buffer[] = []
  const entries: ZipEntryRecord[] = []
  let localOffset = 0
  let contentBytes = 0

  for (const artifact of graph.artifacts) {
    const name = Buffer.from(artifact.outputPath, 'utf8')
    const content = Buffer.from(artifact.content)
    if (name.length === 0 || name.length > 0xffff) {
      throw new ArtifactGraphError(`ZIP artifact name is too long: '${artifact.outputPath}'`)
    }
    if (content.length > 0xffffffff) {
      throw new ArtifactGraphError(`ZIP artifact exceeds ZIP32 size: '${artifact.outputPath}'`)
    }
    contentBytes += content.length
    if (contentBytes > MAX_ZIP_BYTES) {
      throw new ArtifactGraphError(`ZIP artifact content exceeds ${MAX_ZIP_BYTES} bytes`)
    }

    const checksum = crc32(content)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(ZIP_UTF8_FLAG, 6)
    header.writeUInt16LE(0, 8) // STORE
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(ZIP_DOS_EPOCH_DATE, 12)
    header.writeUInt32LE(checksum, 14)
    header.writeUInt32LE(content.length, 18)
    header.writeUInt32LE(content.length, 22)
    header.writeUInt16LE(name.length, 26)
    header.writeUInt16LE(0, 28)

    entries.push({ name, content, checksum, localOffset })
    localParts.push(header, name, content)
    localOffset += header.length + name.length + content.length
    if (localOffset > 0xffffffff) throw new ArtifactGraphError('ZIP local data exceeds ZIP32 offset range')
  }

  const centralParts: Buffer[] = []
  let centralSize = 0
  for (const entry of entries) {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(0x0314, 4) // Unix, ZIP 2.0
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(ZIP_UTF8_FLAG, 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(0, 12)
    header.writeUInt16LE(ZIP_DOS_EPOCH_DATE, 14)
    header.writeUInt32LE(entry.checksum, 16)
    header.writeUInt32LE(entry.content.length, 20)
    header.writeUInt32LE(entry.content.length, 24)
    header.writeUInt16LE(entry.name.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38)
    header.writeUInt32LE(entry.localOffset, 42)
    centralParts.push(header, entry.name)
    centralSize += header.length + entry.name.length
  }

  if (centralSize > 0xffffffff) throw new ArtifactGraphError('ZIP central directory exceeds ZIP32 size')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(localOffset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, ...centralParts, end])
}

export async function writeArtifactZipAtomically(
  graph: DatapackArtifactGraph,
  outputPath: string,
): Promise<void> {
  const output = path.resolve(outputPath)
  const parent = path.dirname(output)
  fs.mkdirSync(parent, { recursive: true })
  const staged = path.join(parent, `.${path.basename(output)}.redscript-stage-${token()}.zip`)
  try {
    fs.writeFileSync(staged, encodeArtifactZip(graph), { flag: 'wx', mode: 0o644 })
    replaceAtomically(staged, output)
  } catch (error) {
    fs.rmSync(staged, { force: true })
    throw error
  }
}
