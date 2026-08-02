import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import type { DatapackArtifact, DatapackArtifactLifecycle } from '../artifacts/model'
import { validateNbt } from '../artifacts/nbt'
import { createP9StructureNbt, runP9LifecycleGate } from '../mc-test/p9-runner'
import {
  findMinecraftLifecycleFailures,
  partitionArtifactsByLifecycle,
} from '../mc-test/p9-lifecycle'

function artifact(outputPath: string, lifecycle: DatapackArtifactLifecycle): DatapackArtifact {
  return {
    identity: { kind: 'opaque', id: outputPath },
    outputPath,
    mediaType: 'application/json',
    lifecycle,
    content: Buffer.from('{}\n'),
    provenance: { kind: 'generated', stage: 'p9-lifecycle-test' },
    references: [],
  }
}

describe('P9 lifecycle helpers', () => {
  it('emits validator-compatible GZIP structure NBT for the live fixture', () => {
    const bytes = createP9StructureNbt('minecraft:gold_block')
    expect([...bytes.subarray(0, 2)]).toEqual([0x1f, 0x8b])
    expect(validateNbt(bytes)).toEqual(bytes)
    expect(() => createP9StructureNbt('Bad Block')).toThrow(/Invalid P9 structure block/)
  })

  it('partitions artifact paths deterministically by lifecycle', () => {
    expect(partitionArtifactsByLifecycle([
      artifact('data/p9/dimension/z.json', 'world_reopen'),
      artifact('data/p9/predicate/b.json', 'reload'),
      artifact('data/p9/predicate/a.json', 'reload'),
      artifact('build/manifest.json', 'build'),
      artifact('data/p9/registry/r.json', 'restart'),
    ])).toEqual({
      build: ['build/manifest.json'],
      reload: ['data/p9/predicate/a.json', 'data/p9/predicate/b.json'],
      restart: ['data/p9/registry/r.json'],
      worldReopen: ['data/p9/dimension/z.json'],
    })
  })

  it('reports unavailable environments as explicit skip unless live proof is required', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-p9-skip-test-'))
    const missing = path.join(root, 'missing-template')
    try {
      const optional = await runP9LifecycleGate({
        templateDir: missing,
        outputPath: path.join(root, 'optional.json'),
      })
      expect(optional.status).toBe('skipped')
      expect(optional.checks).toEqual([
        expect.objectContaining({ status: 'skipped', name: 'environment' }),
      ])

      const required = await runP9LifecycleGate({
        templateDir: missing,
        outputPath: path.join(root, 'required.json'),
        requireOnline: true,
      })
      expect(required.status).toBe('failed')
      expect(required.error).toMatch(/does not exist/)
      expect(required.checks).toEqual([
        expect.objectContaining({ status: 'failed', name: 'environment' }),
      ])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('extracts load failures from only the selected clean log segment', () => {
    const log = [
      '[Server thread/WARN]: **** SERVER IS RUNNING IN OFFLINE/INSECURE MODE!',
      '[Server thread/INFO]: Done (6.2s)! For help, type "help"',
      '[Server thread/ERROR]: Failed to load function p9:broken',
      'java.lang.IllegalArgumentException: bad command',
      '[Server thread/INFO]: Loaded 1371 recipes',
      '[Server thread/ERROR]: Couldn\'t load structure p9:broken',
    ].join('\n')

    expect(findMinecraftLifecycleFailures(log, log.indexOf('[Server thread/ERROR]'))).toEqual([
      '[Server thread/ERROR]: Failed to load function p9:broken',
      '[Server thread/ERROR]: Couldn\'t load structure p9:broken',
    ])
    expect(findMinecraftLifecycleFailures(log, log.length)).toEqual([])
  })
})
