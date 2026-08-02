/**
 * McCoreCaseRunner Unit Tests
 *
 * These tests verify orchestration logic without requiring a live Paper server.
 * They focus on compile/install/reload/run/assert decisions and explicit offline skip.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { runMcCoreCase } from '../../mc-test/case-runner'
import type { McCoreCaseDescriptor, McCoreCaseHarness } from '../../mc-test/case-runner'

interface FakeHarnessDeps {
  online: boolean
  storageRaw?: string
  receiptValue?: number
}

class FakeHarness {
  public readonly calls: string[] = []
  constructor(private readonly deps: FakeHarnessDeps, private readonly scores: Record<string, number> = {}) {}

  async isOnline(): Promise<boolean> {
    this.calls.push('isOnline')
    return this.deps.online
  }

  async command(cmd: string): Promise<unknown> {
    this.calls.push(`command:${cmd}`)
    return { ok: true, cmd }
  }

  async reload(): Promise<void> {
    this.calls.push('reload')
  }

  async ticks(count: number): Promise<void> {
    this.calls.push(`ticks:${count}`)
  }

  async scoreboard(player: string, obj: string): Promise<number> {
    this.calls.push(`score:${player}:${obj}`)
    if (obj === '__rs_entry') return this.deps.receiptValue ?? 2
    if (obj === '__rs_fn_cov') return 1
    return this.scores[`${obj}:${player}`] ?? 0
  }

  async dumpStorage(): Promise<{ raw: string; ok: boolean }> {
    this.calls.push('storage:rs:core_oracle')
    return { raw: this.deps.storageRaw ?? '', ok: true }
  }
}

function buildDescriptor(overrides: Partial<McCoreCaseDescriptor> = {}): McCoreCaseDescriptor {
  return {
    name: 'smoke',
    namespace: 'core_oracle_mc',
    source: `
      fn test_probe() {
        let x: int = scoreboard_get("#value", "core_oracle")
        scoreboard_set("#result", "core_oracle", x + 1)
      }
    `,
    setupCommands: ['scoreboard players set #setup core_oracle 1'],
    entrypoints: [{ kind: 'function', target: 'test_probe' }],
    waitTicks: 4,
    scoreboardAssertions: [{ player: '#result', obj: 'core_oracle', value: 7 }],
    ...overrides,
  }
}

it('returns skipped when harness is offline', async () => {
  const fake = new FakeHarness({ online: false })
  const result = await runMcCoreCase(buildDescriptor(), {
    client: fake,
    datapackDir: '/tmp/redscript-mc-core-oracle-offline',
  })

  expect(result.status).toBe('skipped')
  expect(result.reason).toBe('harness is offline')
  expect(fake.calls).toEqual(['isOnline'])
})

it('runs compile + install + reload + assertions end-to-end', async () => {
  const fake = new FakeHarness({ online: true }, { 'core_oracle:#result': 7 })
  const compileCalls: Array<{ source: string; namespace: string; filePath: string }> = []
  const installCalls: Array<{ namespace: string; datapackDir: string }> = []

  const result = await runMcCoreCase(buildDescriptor(), {
    client: fake,
    datapackDir: '/tmp/redscript-mc-core-oracle-run',
    compileSource: (source, namespace, filePath) => {
      compileCalls.push({ source, namespace, filePath })
      return [{
        path: 'data/core_oracle_mc/function/test_probe.mcfunction',
        content: '# no-op',
      }]
    },
    installFiles: (files, namespace, datapackDir) => {
      installCalls.push({ namespace, datapackDir })
      expect(files).toHaveLength(1)
    },
  })

  expect(result.status).toBe('passed')
  expect(compileCalls).toHaveLength(1)
  expect(installCalls).toHaveLength(1)
  expect(installCalls[0]).toEqual({
    namespace: 'core_oracle_mc',
    datapackDir: '/tmp/redscript-mc-core-oracle-run',
  })

  expect(fake.calls).toEqual([
    'isOnline',
    'reload',
    'command:/scoreboard players set #setup core_oracle 1',
    'command:/function core_oracle_mc:test_probe',
    'ticks:4',
    'score:#result:core_oracle',
  ])
})

it('reports failed status for assertion mismatch', async () => {
  const fake = new FakeHarness({ online: true }, { 'core_oracle:#result': 1 })

  const result = await runMcCoreCase(buildDescriptor({
    scoreboardAssertions: [{ player: '#result', obj: 'core_oracle', value: 7 }],
  }), {
    client: fake,
    datapackDir: '/tmp/redscript-mc-core-oracle-failed',
    compileSource: () => [{
      path: 'data/core_oracle_mc/function/test_probe.mcfunction',
      content: '# no-op',
    }],
    installFiles: () => { /* no-op */ },
  })

  expect(result.status).toBe('failed')
  expect(result.error).toContain('scoreboard assertion failed')
})

it('returns failed when storage assertions are requested without storage support', async () => {
  const fake = new FakeHarness({ online: true })
  const noStorage: McCoreCaseHarness = {
    isOnline: fake.isOnline.bind(fake),
    command: fake.command.bind(fake),
    reload: fake.reload.bind(fake),
    ticks: fake.ticks.bind(fake),
    scoreboard: fake.scoreboard.bind(fake),
  }

  const result = await runMcCoreCase(buildDescriptor({
    storageAssertions: [{ storage: 'rs:core_oracle', expected: '{}' }],
    scoreboardAssertions: [],
  }), {
    client: noStorage,
    datapackDir: '/tmp/redscript-mc-core-oracle-storage',
    compileSource: () => [{
      path: 'data/core_oracle_mc/function/test_probe.mcfunction',
      content: '# no-op',
    }],
    installFiles: () => { /* no-op */ },
  })

  expect(result.status).toBe('failed')
  expect(result.error).toContain('storage assertions are not supported')
})

it('deploys a descriptor into an owned isolated pack and removes it after the case', async () => {
  const serverRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-case-runner-test-'))
  const fake = new FakeHarness({ online: true }, { 'core_oracle:#result': 7 })

  try {
    const result = await runMcCoreCase(buildDescriptor({ id: 'core.smoke' }), {
      client: fake,
      serverRoot,
      instrumentFunctionCoverage: true,
      compileSource: () => [
        { path: 'pack.mcmeta', content: '{}' },
        { path: 'data/core_oracle_mc/function/test_probe.mcfunction', content: '# no-op' },
      ],
    })

    expect(result.status).toBe('passed')
    expect(result.entrypointReceipts).toEqual([
      expect.objectContaining({
        target: 'core_oracle_mc:test_probe',
        observed: 2,
        status: 'completed',
      }),
    ])
    expect(result.functionCoverage).toEqual([
      expect.objectContaining({
        artifactPath: 'data/core_oracle_mc/function/test_probe.mcfunction',
        executed: true,
      }),
    ])
    expect(fake.calls).toEqual(expect.arrayContaining([
      expect.stringMatching(/^command:\/function core_oracle_mc:__redscript_receipt\/[0-9a-f]{16}$/),
      expect.stringMatching(/^score:#entry_[0-9a-f]{16}:__rs_entry$/),
    ]))
    expect(fake.calls).not.toContain('command:/function core_oracle_mc:test_probe')
    expect(fs.readdirSync(path.join(serverRoot, 'world', 'datapacks'))).toEqual([])
    expect(fake.calls.filter(call => call === 'reload')).toHaveLength(2)
  } finally {
    fs.rmSync(serverRoot, { recursive: true, force: true })
  }
})

it('fails closed when an isolated entrypoint starts but does not complete', async () => {
  const serverRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-case-receipt-test-'))
  const fake = new FakeHarness(
    { online: true, receiptValue: 1 },
    { 'core_oracle:#result': 7 },
  )

  try {
    const result = await runMcCoreCase(buildDescriptor({ id: 'core.incomplete' }), {
      client: fake,
      serverRoot,
      compileSource: () => [
        { path: 'pack.mcmeta', content: '{}' },
        { path: 'data/core_oracle_mc/function/test_probe.mcfunction', content: '# no-op' },
      ],
    })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('entrypoint receipt failed')
    expect(result.entrypointReceipts).toEqual([
      expect.objectContaining({ observed: 1, status: 'incomplete' }),
    ])
    expect(result.functionCoverage).toBeUndefined()
    expect(fs.readdirSync(path.join(serverRoot, 'world', 'datapacks'))).toEqual([])
  } finally {
    fs.rmSync(serverRoot, { recursive: true, force: true })
  }
})
