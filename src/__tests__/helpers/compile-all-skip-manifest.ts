export interface CompileAllSkipEntry {
  pattern: string
  category: 'repo-artifact' | 'declaration-only' | 'test-fixture' | 'known-language-gap'
  reason: string
  nextAction: string
  expectedFailureSubstrings?: string[]
}

export const COMPILE_ALL_SKIP_MANIFEST: CompileAllSkipEntry[] = [
  {
    pattern: 'node_modules',
    category: 'repo-artifact',
    reason: 'Third-party dependencies are not RedScript source fixtures.',
    nextAction: 'Keep excluded.',
  },
  {
    pattern: '.git',
    category: 'repo-artifact',
    reason: 'Git metadata is not source input.',
    nextAction: 'Keep excluded.',
  },
  {
    pattern: '.burn/',
    category: 'repo-artifact',
    reason: 'Local worktree artifact directory.',
    nextAction: 'Keep excluded.',
  },
  {
    pattern: '.claude/',
    category: 'repo-artifact',
    reason: 'Local agent/worktree artifact directory.',
    nextAction: 'Keep excluded.',
  },
  {
    pattern: 'redscript-docs/',
    category: 'repo-artifact',
    reason: 'External documentation checkout may be nested locally.',
    nextAction: 'Keep excluded from compiler product smoke.',
  },
  {
    pattern: 'builtins.d.mcrs',
    category: 'declaration-only',
    reason: 'Declaration-only file is not valid executable RedScript source.',
    nextAction: 'Keep excluded from executable compile-all; dedicated declaration-mode smoke covers .d.mcrs parse/typecheck and zero runtime emission.',
  },
  {
    pattern: 'editors/',
    category: 'declaration-only',
    reason: 'Editor extension tree contains a declaration-only builtins.d.mcrs copy that is not valid executable RedScript source.',
    nextAction: 'Keep excluded from executable compile-all; dedicated declaration-mode smoke covers .d.mcrs parse/typecheck and zero runtime emission.',
  },
  {
    pattern: 'heap-sort-mc-test.mcrs',
    category: 'test-fixture',
    reason: 'Requires librarySources injection for heap.mcrs and sort.mcrs rather than standalone CLI compilation.',
    nextAction: 'Convert to a standalone import-based fixture or keep covered by targeted tests.',
  },
  {
    pattern: 'test-datapacks/',
    category: 'test-fixture',
    reason: 'Contains datapack test inputs with intentionally unsupported or non-source patterns.',
    nextAction: 'Keep excluded; targeted datapack validation owns this tree.',
  },
]

export const COMPILE_ALL_SKIP_PATTERNS = COMPILE_ALL_SKIP_MANIFEST.map(entry => entry.pattern)
