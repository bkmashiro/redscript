/**
 * Top-level compile function for the v2 pipeline.
 *
 * Pipeline: source → Lexer → Parser → HIR → MIR → optimize → LIR → emit
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { preprocessSourceWithMetadata } from '../compile'
import { lowerToHIR } from '../hir/lower'
import { lowerToMIR } from '../mir/lower'
import { optimizeModule } from '../optimizer/pipeline'
import { lowerToLIR } from '../lir/lower'
import { emit, type DatapackFile } from './index'

export interface CompileOptions {
  namespace?: string
  filePath?: string
  /** v1 compat: inline library sources (treated as `module library;` imports) */
  librarySources?: string[]
}

export interface CompileResult {
  files: DatapackFile[]
  warnings: string[]
  /** Always true — v1 compat shim (compile() throws on error) */
  readonly success: true
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const { namespace = 'redscript', filePath } = options
  const warnings: string[] = []

  // Preprocess: resolve import directives, merge imported sources
  const preprocessed = preprocessSourceWithMetadata(source, { filePath })
  const processedSource = preprocessed.source

  // Stage 1: Lex + Parse → AST
  const lexer = new Lexer(processedSource)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, processedSource, filePath)
  const ast = parser.parse(namespace)

  // Merge library imports (files with `module library;`) into AST
  for (const li of preprocessed.libraryImports ?? []) {
    const libPreprocessed = preprocessSourceWithMetadata(li.source, { filePath: li.filePath })
    const libTokens = new Lexer(libPreprocessed.source, li.filePath).tokenize()
    const libAst = new Parser(libTokens, libPreprocessed.source, li.filePath).parse(namespace)
    for (const fn of libAst.declarations) fn.isLibraryFn = true
    ast.declarations.push(...libAst.declarations)
    ast.structs.push(...libAst.structs)
    ast.implBlocks.push(...libAst.implBlocks)
    ast.enums.push(...libAst.enums)
    ast.consts.push(...libAst.consts)
    ast.globals.push(...libAst.globals)
  }

  // Merge librarySources (v1 compat: inline library strings) before HIR
  if (options.librarySources) {
    for (const libSrc of options.librarySources) {
      const libTokens = new Lexer(libSrc).tokenize()
      const libAst = new Parser(libTokens, libSrc).parse(namespace)
      for (const fn of libAst.declarations) fn.isLibraryFn = true
      ast.declarations.push(...libAst.declarations)
      ast.structs.push(...libAst.structs)
      ast.implBlocks.push(...libAst.implBlocks)
      ast.enums.push(...libAst.enums)
      ast.consts.push(...libAst.consts)
      ast.globals.push(...libAst.globals)
    }
  }

  // Stage 2: AST → HIR
  const hir = lowerToHIR(ast)

  // Extract @tick and @load functions from HIR (before decorator info is lost)
  const tickFunctions: string[] = []
  const loadFunctions: string[] = []
  for (const fn of hir.functions) {
    for (const dec of fn.decorators) {
      if (dec.name === 'tick') tickFunctions.push(fn.name)
      if (dec.name === 'load') loadFunctions.push(fn.name)
    }
  }

  // Stage 3: HIR → MIR
  const mir = lowerToMIR(hir)

  // Stage 4: MIR optimization
  const mirOpt = optimizeModule(mir)

  // Stage 5: MIR → LIR
  const lir = lowerToLIR(mirOpt)

  // Stage 7: LIR → .mcfunction
  const files = emit(lir, { namespace, tickFunctions, loadFunctions })

  return { files, warnings, success: true as const }
}
