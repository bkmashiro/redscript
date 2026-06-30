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
    pattern: 'src/templates/combat.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile fails LIR verification because vanilla scoreboard objective 'health' is external to the module objective '__combat'.",
    nextAction: 'Decide whether external scoreboard objectives are valid template ABI or should produce a clearer diagnostic.',
    expectedFailureSubstrings: ["external scoreboard objective 'health'", "module objective '__combat'"],
  },
  {
    pattern: 'src/templates/economy.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile fails LIR verification because vanilla scoreboard objective 'coins' is external to the module objective '__economy'.",
    nextAction: 'Decide whether external scoreboard objectives are valid template ABI or should produce a clearer diagnostic.',
    expectedFailureSubstrings: ["external scoreboard objective 'coins'", "module objective '__economy'"],
  },
  {
    pattern: 'src/templates/quest.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile fails LIR verification because vanilla scoreboard objectives like 'quest_id' are external to the module objective '__quest'.",
    nextAction: 'Decide whether external scoreboard objectives are valid template ABI or should produce a clearer diagnostic.',
    expectedFailureSubstrings: ["external scoreboard objective 'quest_id'", "module objective '__quest'"],
  },
  {
    pattern: 'parkour_race.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails LIR verification because scoreboard slots such as '$(player)' use external objectives.",
    nextAction: 'Decide whether external scoreboard objectives are valid template/example ABI or should produce a clearer diagnostic.',
    expectedFailureSubstrings: ["external scoreboard objective 'pk_checkpoint'", "module objective '__parkour_race'"],
  },
  {
    pattern: 'zombie_survival.mcrs',
    category: 'known-language-gap',
    reason: "Direct compile currently fails LIR verification because display slots use an objective different from the module objective.",
    nextAction: 'Decide whether external display scoreboard objectives are valid ABI or should be an explicit diagnostic.',
    expectedFailureSubstrings: ["external scoreboard objective 'zs_display'", "module objective '__zombie_survival'"],
  },
]

export const COMPILE_ALL_SKIP_PATTERNS = COMPILE_ALL_SKIP_MANIFEST.map(entry => entry.pattern)
