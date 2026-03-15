/**
 * Top-level compile function for the v2 pipeline.
 *
 * Pipeline: source → Lexer → Parser → HIR → MIR → optimize → LIR → emit
 */

import { Lexer } from '../../src/lexer'
import { Parser } from '../../src/parser'
import { lowerToHIR } from '../hir/lower'
import { lowerToMIR } from '../mir/lower'
import { optimizeModule } from '../optimizer/pipeline'
import { lowerToLIR } from '../lir/lower'
import { emit, type DatapackFile } from './index'

export interface CompileOptions {
  namespace: string
  filePath?: string
}

export interface CompileResult {
  files: DatapackFile[]
  warnings: string[]
}

export function compile(source: string, options: CompileOptions): CompileResult {
  const { namespace, filePath } = options
  const warnings: string[] = []

  // Stage 1: Lex + Parse → AST
  const lexer = new Lexer(source)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, source, filePath)
  const ast = parser.parse(namespace)

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

  return { files, warnings }
}
