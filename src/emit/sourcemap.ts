/**
 * Source Map Generation — Stage 7 auxiliary output.
 *
 * For each generated .mcfunction file, produces a parallel sourcemap.json
 * that maps output line numbers back to .mcrs source locations.
 *
 * Format:
 * {
 *   "version": 1,
 *   "generatedFile": "data/ns/function/main.mcfunction",
 *   "sources": ["src/main.mcrs"],
 *   "mappings": [
 *     { "line": 1, "source": 0, "sourceLine": 5, "sourceCol": 2 },
 *     ...
 *   ]
 * }
 */

import type { SourceLoc } from '../lir/types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SourceMapEntry {
  /** 1-based output line number in the .mcfunction file */
  line: number
  /** Index into the `sources` array */
  source: number
  /** 1-based line in the source .mcrs file */
  sourceLine: number
  /** 1-based column in the source .mcrs file */
  sourceCol: number
}

export interface SourceMap {
  version: 1
  /** Relative path to the generated .mcfunction file */
  generatedFile: string
  /** List of source file paths referenced by mappings */
  sources: string[]
  /** One entry per mapped output line */
  mappings: SourceMapEntry[]
}

// ---------------------------------------------------------------------------
// Builder — accumulates mappings as lines are emitted
// ---------------------------------------------------------------------------

export class SourceMapBuilder {
  private readonly generatedFile: string
  private readonly sourceIndex = new Map<string, number>()
  private readonly sources: string[] = []
  private readonly mappings: SourceMapEntry[] = []
  private lineNumber = 0

  constructor(generatedFile: string) {
    this.generatedFile = generatedFile
  }

  /** Record the source location for the next output line. */
  addLine(sourceLoc: SourceLoc | undefined): void {
    this.lineNumber++
    if (!sourceLoc) return

    let idx = this.sourceIndex.get(sourceLoc.file)
    if (idx === undefined) {
      idx = this.sources.length
      this.sources.push(sourceLoc.file)
      this.sourceIndex.set(sourceLoc.file, idx)
    }

    this.mappings.push({
      line: this.lineNumber,
      source: idx,
      sourceLine: sourceLoc.line,
      sourceCol: sourceLoc.col,
    })
  }

  /** Return the completed SourceMap, or null if there are no mappings. */
  build(): SourceMap | null {
    if (this.mappings.length === 0) return null
    return {
      version: 1,
      generatedFile: this.generatedFile,
      sources: [...this.sources],
      mappings: [...this.mappings],
    }
  }
}

/** Serialize a SourceMap to JSON string (pretty-printed). */
export function serializeSourceMap(map: SourceMap): string {
  return JSON.stringify(map, null, 2) + '\n'
}

/** Given a .mcfunction path, return the path for the sidecar sourcemap.json. */
export function sourceMapPath(mcfunctionPath: string): string {
  return mcfunctionPath.replace(/\.mcfunction$/, '.sourcemap.json')
}
