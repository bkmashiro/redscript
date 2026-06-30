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
    reason: 'Current templates fail standalone compile through unresolved struct-field-like locals or objective-mismatch verification errors.',
    nextAction: 'Split templates into the smallest unresolved-field and objective-mismatch repros before removing this directory skip.',
  },
  {
    pattern: 'capture_the_flag.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails with unresolved identifier 'winner' during MIR lowering.",
    nextAction: 'Minimize the unresolved winner/state pattern and decide whether it is a struct field lowering slice or an invalid example diagnostic.',
  },
  {
    pattern: 'parkour_race.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails LIR verification because scoreboard slots such as '$(player)' use external objectives.",
    nextAction: 'Decide whether external scoreboard objectives are valid template/example ABI or should produce a clearer diagnostic.',
  },
  {
    pattern: 'pvp_arena.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails with unresolved identifier 'state' during MIR lowering.",
    nextAction: 'Minimize the struct/state field access path and fold it into Track C if bounded.',
  },
  {
    pattern: 'showcase_game.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails with unresolved identifier 'state' during MIR lowering.",
    nextAction: 'Re-test after Track C static struct field access/assignment is implemented or clearly diagnosed.',
  },
  {
    pattern: 'tutorial_07_random.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails with unresolved identifier 'item' during MIR lowering.",
    nextAction: 'Minimize the item field/state pattern and either fix bounded lowering or add a clear diagnostic.',
  },
  {
    pattern: 'zombie_survival.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails LIR verification because display slots use an objective different from the module objective.",
    nextAction: 'Decide whether external display scoreboard objectives are valid ABI or should be an explicit diagnostic.',
  },
]

export const COMPILE_ALL_SKIP_PATTERNS = COMPILE_ALL_SKIP_MANIFEST.map(entry => entry.pattern)
