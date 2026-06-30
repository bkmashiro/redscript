export interface CompileAllSkipEntry {
  pattern: string
  category: 'repo-artifact' | 'declaration-only' | 'test-fixture' | 'known-language-gap'
  reason: string
  nextAction: string
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
    nextAction: 'Keep excluded unless declaration compile mode is added.',
  },
  {
    pattern: 'editors/',
    category: 'declaration-only',
    reason: 'Editor extension tree contains a copy of builtins.d.mcrs.',
    nextAction: 'Keep excluded unless editor fixtures become source samples.',
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
  {
    pattern: 'src/templates/',
    category: 'known-language-gap',
    reason: 'Templates currently use unsupported array-return-call patterns.',
    nextAction: 'Track B should minimize one array-return-call failure and add RED/GREEN coverage before removing this skip.',
  },
  {
    pattern: 'interactions.mcrs',
    category: 'known-language-gap',
    reason: 'Uses foreach with a module-level const; current lowering fails before MIR can emit it.',
    nextAction: 'Track B should reproduce the smallest foreach + module-level const case and either fix it or add a clear diagnostic.',
  },
  {
    pattern: 'racing.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'tower_defense.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'physics_sim.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'capture_the_flag.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'hunger_games.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'parkour_race.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'pvp_arena.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'showcase_game.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'tutorial_04_selectors.mcrs',
    category: 'known-language-gap',
    reason: 'Tutorial uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'tutorial_07_random.mcrs',
    category: 'known-language-gap',
    reason: 'Tutorial uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'tutorial_10_kill_race.mcrs',
    category: 'known-language-gap',
    reason: 'Tutorial uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
  {
    pattern: 'zombie_survival.mcrs',
    category: 'known-language-gap',
    reason: 'Example uses unsupported array-passing-to-array-returning-function pattern.',
    nextAction: 'Re-test after the array-return-call slice is fixed.',
  },
]

export const COMPILE_ALL_SKIP_PATTERNS = COMPILE_ALL_SKIP_MANIFEST.map(entry => entry.pattern)
