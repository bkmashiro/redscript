/** Managed, strict Paper correctness checks. Opt in with the package script. */
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import * as fs from 'fs'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import { MCTestClient } from '../mc-test/client'
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
    root = prepareServerRoot(template, findHarnessPlugin(template))
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
