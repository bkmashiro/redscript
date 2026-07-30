import * as path from 'path'

import type { CompileOptions, CompileResult } from '../emit/compile'
import type { BuildTarget, LoadedProject } from '../project/model'
import { SourceFileId, SourceManager, SourceManagerOptions } from './source-manager'

export type CompilePipeline = (source: string, options?: CompileOptions) => CompileResult

export interface CompilerSessionOptions extends SourceManagerOptions {
  project?: LoadedProject
  target?: BuildTarget
}

export class UnknownSourceError extends Error {
  constructor(sourceId: SourceFileId) {
    super(`Unknown source id '${sourceId}'`)
    this.name = 'UnknownSourceError'
  }
}

/**
 * Build-scoped owner for source identity and compiler pipeline invocation.
 *
 * This is intentionally behavior-preserving today. PackageGraph and target
 * planning will attach to this session rather than adding more global state to
 * the legacy compile function.
 */
export class CompilerSession {
  readonly sources: SourceManager
  readonly project?: LoadedProject
  readonly target?: BuildTarget
  private readonly pipeline: CompilePipeline

  constructor(pipeline: CompilePipeline, options: CompilerSessionOptions = {}) {
    if (options.target && !options.project) {
      throw new Error('A compiler session target requires a resolved project')
    }
    if (options.project && options.target && options.project.targets[options.target.name] !== options.target) {
      throw new Error(`Target '${options.target.name}' does not belong to the compiler session project`)
    }

    this.pipeline = pipeline
    this.project = options.project
    this.target = options.target
    this.sources = new SourceManager({ cwd: options.cwd ?? options.project?.rootDir })
  }

  compile(sourceId: SourceFileId, options: CompileOptions = {}): CompileResult {
    const source = this.sources.get(sourceId)
    if (!source) throw new UnknownSourceError(sourceId)

    if (options.filePath && source.filePath) {
      const requestedPath = path.resolve(this.sources.cwd, options.filePath)
      if (requestedPath !== source.filePath) {
        throw new Error(
          `Compile option filePath '${requestedPath}' does not match source '${source.filePath}'`,
        )
      }
    }

    return this.pipeline(source.text, {
      ...options,
      filePath: options.filePath ?? source.filePath,
    })
  }

  compileText(sourceText: string, options: CompileOptions = {}): CompileResult {
    const source = options.filePath
      ? this.sources.addSource({ filePath: options.filePath, text: sourceText })
      : this.sources.addVirtualSource({ text: sourceText, displayName: '<input>' })
    return this.compile(source.id, options)
  }
}
