import * as fs from 'fs'
import * as path from 'path'

declare const sourceFileIdBrand: unique symbol
export type SourceFileId = string & { readonly [sourceFileIdBrand]: true }

export interface SourceUnit {
  readonly id: SourceFileId
  readonly filePath?: string
  readonly displayName: string
  readonly text: string
  readonly origin: 'file' | 'virtual'
}

export class DuplicateSourceError extends Error {
  readonly sourceId: SourceFileId

  constructor(source: SourceUnit) {
    super(`Source '${source.displayName}' is already registered with different contents`)
    this.name = 'DuplicateSourceError'
    this.sourceId = source.id
  }
}

export interface SourceManagerOptions {
  cwd?: string
}

export interface AddSourceInput {
  filePath: string
  text: string
  displayName?: string
}

export interface AddVirtualSourceInput {
  text: string
  displayName?: string
  uri?: string
}

function freezeSource(source: SourceUnit): SourceUnit {
  return Object.freeze(source)
}

/** Owns canonical source identities for one compiler session. */
export class SourceManager {
  readonly cwd: string
  private readonly sources = new Map<SourceFileId, SourceUnit>()
  private readonly fileIds = new Map<string, SourceFileId>()
  private virtualSequence = 0

  constructor(options: SourceManagerOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd())
  }

  addSource(input: AddSourceInput): SourceUnit {
    const filePath = path.resolve(this.cwd, input.filePath)
    const existingId = this.fileIds.get(filePath)
    if (existingId) {
      const existing = this.sources.get(existingId)!
      if (existing.text !== input.text) throw new DuplicateSourceError(existing)
      return existing
    }

    const id = `file:${filePath}` as SourceFileId
    const relative = path.relative(this.cwd, filePath)
    const defaultDisplayName = relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      ? relative
      : filePath
    const source = freezeSource({
      id,
      filePath,
      displayName: input.displayName ?? defaultDisplayName,
      text: input.text,
      origin: 'file',
    })
    this.fileIds.set(filePath, id)
    this.sources.set(id, source)
    return source
  }

  addVirtualSource(input: AddVirtualSourceInput): SourceUnit {
    const key = input.uri ?? `session-${this.virtualSequence++}`
    const id = `virtual:${key}` as SourceFileId
    const existing = this.sources.get(id)
    if (existing) {
      if (existing.text !== input.text) throw new DuplicateSourceError(existing)
      return existing
    }

    const source = freezeSource({
      id,
      displayName: input.displayName ?? `<${key}>`,
      text: input.text,
      origin: 'virtual',
    })
    this.sources.set(id, source)
    return source
  }

  readFile(filePath: string, displayName?: string): SourceUnit {
    const absolutePath = path.resolve(this.cwd, filePath)
    const existing = this.getByPath(absolutePath)
    if (existing) return existing
    return this.addSource({
      filePath: absolutePath,
      text: fs.readFileSync(absolutePath, 'utf8'),
      displayName,
    })
  }

  get(id: SourceFileId): SourceUnit | undefined {
    return this.sources.get(id)
  }

  getByPath(filePath: string): SourceUnit | undefined {
    const id = this.fileIds.get(path.resolve(this.cwd, filePath))
    return id ? this.sources.get(id) : undefined
  }

  list(): SourceUnit[] {
    return [...this.sources.values()]
  }
}
