import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { compile } from '../compile'

interface GoldenExample {
  label: string
  sourcePath: string
  namespace: string
  commandFragments: string[]
}

const GOLDEN_EXAMPLES: GoldenExample[] = [
  {
    label: 'capture_the_flag',
    sourcePath: path.join(__dirname, '../examples/capture_the_flag.mcrs'),
    namespace: 'golden_capture_the_flag',
    commandFragments: ['ctf_team', 'ctf_dist'],
  },
  {
    label: 'pvp_arena',
    sourcePath: path.join(__dirname, '../examples/pvp_arena.mcrs'),
    namespace: 'golden_pvp_arena',
    commandFragments: ['health'],
  },
  {
    label: 'tutorial_07_random',
    sourcePath: path.join(__dirname, '../examples/tutorial_07_random.mcrs'),
    namespace: 'golden_tutorial_07_random',
    commandFragments: ['rng_seed'],
  },
  {
    label: 'parkour_race',
    sourcePath: path.join(__dirname, '../examples/parkour_race.mcrs'),
    namespace: 'golden_parkour_race',
    commandFragments: ['pk_checkpoint'],
  },
  {
    label: 'zombie_survival',
    sourcePath: path.join(__dirname, '../examples/zombie_survival.mcrs'),
    namespace: 'golden_zombie_survival',
    commandFragments: ['zs_display'],
  },
  {
    label: 'combat_template',
    sourcePath: path.join(__dirname, '../templates/combat.mcrs'),
    namespace: 'golden_template_combat',
    commandFragments: ['cooldown'],
  },
  {
    label: 'economy_template',
    sourcePath: path.join(__dirname, '../templates/economy.mcrs'),
    namespace: 'golden_template_economy',
    commandFragments: ['coins'],
  },
  {
    label: 'quest_template',
    sourcePath: path.join(__dirname, '../templates/quest.mcrs'),
    namespace: 'golden_template_quest',
    commandFragments: ['quest_id'],
  },
]

function emitDatapack(result: ReturnType<typeof compile>, outDir: string): void {
  for (const file of result.files) {
    const outputPath = path.join(outDir, file.path)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, file.content)
  }
}

describe('golden examples/templates emit stable datapack artifacts', () => {
  test.each(GOLDEN_EXAMPLES)('$label', ({ sourcePath, namespace, commandFragments }) => {
    const source = fs.readFileSync(sourcePath, 'utf-8')
    const result = compile(source, { namespace, filePath: sourcePath })

    expect(result.files.some(file => file.path === 'pack.mcmeta')).toBe(true)
    const compiledFunctions = result.files.filter(file => file.path.endsWith('.mcfunction'))
    expect(compiledFunctions.length).toBeGreaterThan(0)

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-golden-examples-'))
    try {
      emitDatapack(result, outDir)
      expect(fs.existsSync(path.join(outDir, 'pack.mcmeta'))).toBe(true)
      expect(fs.existsSync(path.join(outDir, compiledFunctions[0].path))).toBe(true)

      const emittedMcfunctionText = result.files
        .filter(file => file.path.endsWith('.mcfunction'))
        .map(file => file.content)
        .join('\n')

      for (const fragment of commandFragments) {
        expect(emittedMcfunctionText).toContain(fragment)
      }
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true })
    }
  })
})
