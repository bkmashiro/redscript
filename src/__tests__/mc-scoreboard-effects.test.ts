/** Managed, strict Paper correctness checks. Opt in with the package script. */
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import * as fs from 'fs'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import { MCTestClient } from '../mc-test/client'
import { compile } from '../compile'
import { McVersion } from '../types/mc-version'
import { deployCorpusPack, removeCorpusPack } from '../mc-test/corpus-deployer'
import { runMcCoreCase } from '../mc-test/case-runner'
import { findHarnessPlugin, findJava, ManagedPaperServer, prepareServerRoot } from '../mc-test/managed-paper'
import * as effects from '../optimizer/scoreboard-effects'
import { SCORE_EFFECTS_CASES } from '../../tests/mc-cases/scoreboard-call-effects-cases'

const live = process.env.MC_SCORE_EFFECTS_REQUIRE_ONLINE === 'true'

async function requireFreePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()))
  })
}

const describeLive = live ? describe : describe.skip

describeLive('managed Paper scoreboard call effects', () => {
  let managed: ManagedPaperServer | undefined
  let root: string
  let mc: MCTestClient

  beforeAll(async () => {
    if (process.env.MC_OFFLINE === 'true') throw new Error('Strict live scoreboard checks cannot run with MC_OFFLINE=true')
    await requireFreePort(25561)
    await requireFreePort(25566)
    const template = process.env.MC_SCORE_EFFECTS_TEMPLATE_DIR ?? path.join(os.homedir(), 'mc-test-server')
    const java = findJava()
    const plugin = findHarnessPlugin(template)
    if (!process.env.MC_HARNESS_PLUGIN && path.basename(plugin) === 'redscript-testharness-1.2.0.jar') {
      throw new Error('TestHarness 1.2.0 binds all interfaces. Supply a loopback-only 1.2.1+ jar with MC_HARNESS_PLUGIN; keep the template unchanged.')
    }
    root = prepareServerRoot(template, plugin)
    mc = new MCTestClient('127.0.0.1', 25561)
    managed = new ManagedPaperServer(root, java.executable, mc, { sourceTemplateDir: template })
    const started = await managed.start()
    expect(started.status.version).toContain('MC: 1.21.4')
    await mc.deterministicReset({ minecraftVersion: '1.21.4' })
    await mc.command('scoreboard objectives add effect_inputs dummy')
    await mc.command('scoreboard objectives add effect_outputs dummy')
  }, 120000)

  afterAll(async () => {
    if (!managed) return
    const cleanup = await managed.cleanup()
    expect(cleanup.failures).toEqual([])
    expect(fs.existsSync(root)).toBe(false)
  }, 30000)

  test('periodic tick cadence, direct calls, reload phase and namespace isolation', async () => {
    const packs: ReturnType<typeof deployCorpusPack>[] = []
    const source = fs.readFileSync(path.resolve(__dirname, '../../tests/mc-cases/tick-rate.mcrs'), 'utf8')
    const alternate = source.replace('@tick(rate=5)', '@tick(rate=7)')
      .replaceAll('#five', '#alt_five').replaceAll('#three', '#alt_three').replaceAll('#one', '#alt_one')
    const score = (player: string) => mc.scoreboard(player, 'effect_outputs')
    const step = async (ticks: number, total: number) => {
      await mc.tickStep(ticks)
      await mc.waitForScore('#one', 'effect_outputs', total)
      await mc.command('scoreboard players add #tick_barrier effect_outputs 0')
      expect(await score('#alt_one')).toBe(total)
    }
    await mc.tickFreeze()
    try {
      for (const [namespace, text] of [['tick_primary', source], ['tick_alternate', alternate]]) {
        packs.push(deployCorpusPack(root, namespace, compile(text, { namespace, mcVersion: McVersion.v1_21_4 }).files))
      }
      await mc.reload()
      // Load tags resume with simulation ticks. Seed only public observation
      // markers while frozen; emitted load code still owns private counters.
      for (const player of ['#one', '#three', '#five', '#alt_one', '#alt_three', '#alt_five']) {
        await mc.command(`scoreboard players set ${player} effect_outputs 0`)
      }
      await step(4, 4)
      expect(await score('#one')).toBe(4)
      expect(await score('#five')).toBe(0)
      expect(await score('#three')).toBe(1)
      expect(await score('#alt_five')).toBe(0)
      await step(1, 5)
      expect(await score('#five')).toBe(1)
      expect(await score('#alt_five')).toBe(0)
      await step(2, 7)
      expect(await score('#alt_five')).toBe(1)
      expect(await score('#three')).toBe(2)
      await mc.command('function tick_primary:pulse')
      await mc.command('function tick_primary:pulse')
      expect(await score('#five')).toBe(3)
      await step(3, 10)
      expect(await score('#one')).toBe(10)
      expect(await score('#five')).toBe(4)
      expect(await score('#alt_five')).toBe(1)
      // The alternate counter is at 3/7 here. Reload must restart the phase,
      // not preserve it and fire after only four ticks in the new epoch.
      await mc.reload()
      await step(4, 4)
      expect(await score('#one')).toBe(4)
      expect(await score('#five')).toBe(0)
      expect(await score('#alt_five')).toBe(0)
      await step(1, 5)
      expect(await score('#five')).toBe(1)
      await step(2, 7)
      expect(await score('#alt_five')).toBe(1)
    } finally {
      try {
        for (const pack of packs) removeCorpusPack(pack.root, pack.caseId)
        await mc.reload()
      } finally {
        await mc.tickUnfreeze()
      }
    }
  }, 60000)

  const nativeArithmetic: Array<[string, number, string, number, number]> = [
    ['large product', 2147483647, '*=', 2147483647, 1],
    ['negative large product', -2147483647, '*=', 2147483647, -1],
    ['addition wrap', 2147483647, '+=', 1, -2147483648],
    ['subtraction wrap', -2147483648, '-=', 1, 2147483647],
    ['division negative numerator', -7, '/=', 3, -3],
    ['division negative divisor', 7, '/=', -3, -3],
    ['division both negative', -7, '/=', -3, 2],
    ['division overflow', -2147483648, '/=', -1, -2147483648],
    ['modulo negative numerator', -7, '%=', 3, 2],
    ['modulo negative divisor', 7, '%=', -3, -2],
    ['modulo both negative', -7, '%=', -3, -1],
  ]
  test.each(nativeArithmetic)('native scoreboard semantics: %s', async (_name, left, operator, right, expected) => {
    await mc.command(`scoreboard players set #left effect_inputs ${left}`)
    await mc.command(`scoreboard players set #right effect_inputs ${right}`)
    const operation = await mc.command(`scoreboard players operation #left effect_inputs ${operator} #right effect_inputs`)
    expect(operation.ok).toBe(true)
    expect(await mc.scoreboard('#left', 'effect_inputs')).toBe(expected)
  })

  for (const useEffects of [false, true]) {
    describe(useEffects ? 'effect-aware output' : 'conservative output', () => {
      for (const descriptor of SCORE_EFFECTS_CASES) {
        test(descriptor.name, async () => {
          const baseline = useEffects ? undefined : jest.spyOn(effects, 'findScoreboardPreservingFunctions')
            .mockReturnValue(new Set<string>())
          try {
            const result = await runMcCoreCase(descriptor, { client: mc, serverRoot: root })
            if (result.status !== 'passed') throw new Error(JSON.stringify(result, null, 2))
          } catch (error) {
            console.error(managed?.currentOutput().split('\n').slice(-30).join('\n'))
            throw error
          } finally {
            baseline?.mockRestore()
          }
        }, 30000)
      }
    })
  }
})
