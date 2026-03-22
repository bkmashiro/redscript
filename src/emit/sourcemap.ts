/**
 * Source map helpers for emitted `.mcfunction` files.
 */

import type { SourceLoc } from '../lir/types'

export interface SourceMapEntry {
  line: number
  source: number
  sourceLine: number
  sourceCol: number
}

export interface SourceMap {
  version: 1
  generatedFile: string
  sources: string[]
  mappings: SourceMapEntry[]
}

export interface NamespaceSourceMapEntry {
  source: number
  line: number
  col?: number
  name?: string
}

export interface NamespaceSourceMap {
  version: 1
  sources: string[]
  mappings: Record<string, NamespaceSourceMapEntry>
}

export class SourceMapBuilder {
  private readonly generatedFile: string
  private readonly sourceIndex = new Map<string, number>()
  private readonly sources: string[] = []
  private readonly mappings: SourceMapEntry[] = []
  private lineNumber = 0

  constructor(generatedFile: string) {
    this.generatedFile = generatedFile
  }

  addLine(sourceLoc: SourceLoc | undefined): void {
    this.lineNumber++
    if (!sourceLoc) return
    this.mappings.push({
      line: this.lineNumber,
      source: this.getSourceIndex(sourceLoc.file),
      sourceLine: sourceLoc.line,
      sourceCol: sourceLoc.col,
    })
  }

  build(): SourceMap | null {
    if (this.mappings.length === 0) return null
    return {
      version: 1,
      generatedFile: this.generatedFile,
      sources: [...this.sources],
      mappings: [...this.mappings],
    }
  }

  private getSourceIndex(file: string): number {
    let idx = this.sourceIndex.get(file)
    if (idx === undefined) {
      idx = this.sources.length
      this.sources.push(file)
      this.sourceIndex.set(file, idx)
    }
    return idx
  }
}

export class NamespaceSourceMapBuilder {
  private readonly sourceIndex = new Map<string, number>()
  private readonly sources: string[] = []
  private readonly mappings: Record<string, NamespaceSourceMapEntry> = {}

  addFunctionMapping(functionName: string, sourceLoc: SourceLoc | undefined, name?: string): void {
    if (!sourceLoc) return
    this.mappings[functionName] = {
      source: this.getSourceIndex(sourceLoc.file),
      line: sourceLoc.line,
      col: sourceLoc.col,
      ...(name ? { name } : {}),
    }
  }

  build(): NamespaceSourceMap | null {
    if (Object.keys(this.mappings).length === 0) return null
    return {
      version: 1,
      sources: [...this.sources],
      mappings: { ...this.mappings },
    }
  }

  private getSourceIndex(file: string): number {
    let idx = this.sourceIndex.get(file)
    if (idx === undefined) {
      idx = this.sources.length
      this.sources.push(file)
      this.sourceIndex.set(file, idx)
    }
    return idx
  }
}

export function serializeSourceMap(map: SourceMap | NamespaceSourceMap): string {
  return JSON.stringify(map, null, 2) + '\n'
}

export function sourceMapPath(mcfunctionPath: string): string {
  return mcfunctionPath.replace(/\.mcfunction$/, '.sourcemap.json')
}

export function namespaceSourceMapPath(namespace: string): string {
  return `${namespace}.sourcemap.json`
}
