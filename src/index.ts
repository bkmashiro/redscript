/**
 * RedScript Compiler
 *
 * Main entry point for programmatic usage.
 */

// Read version from package.json to avoid hardcoding
import pkg from '../package.json'
export const version = pkg.version

import { compile } from './emit/compile'
import { CheckFailedError, DiagnosticError, parseErrorMessage } from './diagnostics'

// Re-export v2 compile API
export {
  compile,
  createCompilerSession,
  CompileOptions,
  CompileResult,
  CompileStageName,
  CompileStageSnapshot,
} from './emit/compile'
export { compileModules, compileModulesWithLIR } from './emit/modules'
export type {
  ModuleInput,
  CompileModulesOptions,
  CompileModulesLIROptions,
  CompileModulesResult,
  CompileModulesLIRResult,
} from './emit/modules'
export { CompilerSession, UnknownSourceError } from './compiler/session'
export type { CompilerSessionOptions, CompilePipeline, ProjectTargetOverrides } from './compiler/session'
export { typecheckResolvedPackageProgram } from './compiler/package-typecheck'
export type { LinkedPackageTypecheckResult } from './compiler/package-typecheck'
export { analyzeProjectTarget } from './compiler/project-target-analysis'
export type { ProjectTargetAnalysis } from './compiler/project-target-analysis'
export type {
  CommandsProjectCompileResult,
  DatapackProjectCompileResult,
  ProjectCompileResult,
} from './compiler/package-backend'
export { DuplicateSourceError, SourceManager } from './compiler/source-manager'
export type { SourceFileId, SourceUnit } from './compiler/source-manager'
export { loadProject, ProjectManifestError, resolveBuildTarget } from './project/manifest'
export { loadProjectModuleGraph } from './project/module-graph'
export type {
  LoadedProjectModule,
  ModuleSourceFile,
  ProjectModuleGraph,
} from './project/module-graph'
export type {
  BuildTarget,
  BuildTargetKind,
  CompilerSettings,
  LoadedProject,
  LocalDependency,
  ProjectIdentity,
  ProjectManifest,
} from './project/model'
export { loadPackageGraph } from './project/package-loader'
export { reachablePackagePaths } from './project/package-graph'
export type {
  LoadedPackage,
  PackageGraph,
  PackageId,
  PackageImport,
  PackageSourceFile,
} from './project/package-graph'
export { makePackageSymbolId, resolvePackageSymbols } from './resolver/package-symbols'
export type {
  ResolvedPackage,
  PackageReference,
  PackageSymbol,
  PackageSymbolId,
  ResolvedPackageProgram,
} from './resolver/package-symbols'
export { buildSemanticTargetPlan, resolveTargetEntry } from './targets/capabilities'
export { getTargetProfile, targetSupports } from './targets/model'
export { assertTargetCompatible, validateTargetPlan } from './targets/validate'
export {
  COMMAND_STATIC_VALIDATION_PROFILE,
  DEFAULT_COMMAND_BUDGET,
  legalizeCommandProgram,
  renderCommandProgramText,
  serializeCommandManifest,
} from './targets/commands'
export type { CommandLegalizationOptions } from './targets/commands'
export type {
  CommandEffect,
  CommandPhase,
  CommandProgram,
  CommandProgramTarget,
  CommandSource,
  CommandStep,
} from './targets/command-program'
export type {
  CapabilityRequirement,
  SemanticTargetPlan,
  TargetCapability,
  TargetProfile,
} from './targets/model'
export type { TargetValidationOptions } from './targets/validate'
export { McVersion, parseMcVersion, compareMcVersion, DEFAULT_MC_VERSION } from './types/mc-version'
export type { DatapackFile } from './emit/index'

// Re-export utilities
export { Lexer } from './lexer'
export { Parser } from './parser'
export { preprocessSource, preprocessSourceWithMetadata } from './compile'
export { MCCommandValidator } from './mc-validator'
export type { Program, FnDecl, Expr, Stmt, Span } from './ast/types'
export type { DiagnosticError } from './diagnostics'

// Incremental compilation
export { FileCache, hashFile } from './cache/index'
export { DependencyGraph, parseImports } from './cache/deps'
export { compileIncremental, resetCompileCache } from './cache/incremental'
export type { IncrementalOptions, IncrementalResult } from './cache/incremental'

export interface CheckResult {
  error: Error | null
  warnings: string[]
}

export interface DetailedCheckResult {
  errors: DiagnosticError[]
  warnings: string[]
}

/**
 * Check RedScript source code for errors without generating output.
 * Runs the full compile pipeline (lex → parse → HIR → MIR → LIR → emit)
 * to catch type-level and lowering errors, not just parse errors.
 *
 * @param source - The RedScript source code
 * @param namespace - Optional namespace
 * @returns null if no errors, or an error object
 */
export function check(source: string, namespace = 'redscript', filePath?: string): Error | null {
  return checkWithWarnings(source, namespace, filePath).error
}

/**
 * Like check(), but also returns warnings (e.g., tick budget analysis).
 */
export function checkWithWarnings(source: string, namespace = 'redscript', filePath?: string): CheckResult {
  const result = checkDetailed(source, namespace, filePath)
  return { error: result.errors[0] ?? null, warnings: result.warnings }
}

export function checkDetailed(source: string, namespace = 'redscript', filePath?: string): DetailedCheckResult {
  try {
    const result = compile(source, { namespace, filePath, stopAfterCheck: true })
    return { errors: [], warnings: result.warnings }
  } catch (err) {
    if (err instanceof CheckFailedError) {
      return { errors: err.diagnostics, warnings: err.warnings }
    }
    if (err instanceof DiagnosticError) {
      return { errors: [err], warnings: [] }
    }
    return {
      errors: [parseErrorMessage('LoweringError', err instanceof Error ? err.message || 'unknown error' : String(err), source.split('\n'), filePath)],
      warnings: [],
    }
  }
}
