import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import type { DatapackArtifact, DatapackArtifactLifecycle } from '../artifacts/model'
import { validateNbt } from '../artifacts/nbt'
import { McVersion } from '../types/mc-version'
import { createDeterministicServerProperties, createP9StructureNbt, resolveP9VersionChannel, runP9LifecycleGate } from '../mc-test/p9-runner'
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
  it('resolves stable and 26.2 runtime channels without relabeling evidence', () => {
    expect(resolveP9VersionChannel()).toEqual({
      id: 'stable-1.21.4',
      minecraftVersion: '1.21.4',
      mcVersion: McVersion.v1_21_4,
      structureDataVersion: 4189,
      defaultTemplateName: 'mc-test-server',
    })
    expect(resolveP9VersionChannel('paper-26.2')).toEqual({
      id: 'paper-26.2',
      minecraftVersion: '26.2',
      mcVersion: McVersion.v26_2,
      structureDataVersion: 4903,
      defaultTemplateName: 'mc-test-server-26.2',
    })
    expect(resolveP9VersionChannel('26.2').id).toBe('paper-26.2')
    expect(() => resolveP9VersionChannel('latest')).toThrow(/unsupported P9 version channel/)
    for (const inheritedKey of ['toString', 'constructor', '__proto__']) {
      expect(() => resolveP9VersionChannel(inheritedKey)).toThrow(/unsupported P9 version channel/)
    }
  })

  it('creates an air-only void Paper world with natural spawning disabled', () => {
    const properties = createDeterministicServerProperties(25565)
    expect(properties).toContain('server-port=25565\n')
    expect(properties).toContain('level-type=minecraft:flat\n')
    expect(properties).toContain('generator-settings={"biome":"minecraft:the_void","layers":[{"block":"minecraft:air","height":1}],"structures":{"structures":{}}}\n')
    expect(properties).toContain('generate-structures=false\n')
    expect(properties).toContain('spawn-animals=false\n')
    expect(properties).toContain('spawn-monsters=false\n')
    expect(properties).toContain('spawn-npcs=false\n')
    expect(properties).not.toContain('minecraft:plains')
    expect(properties).not.toContain('minecraft:stone')
  })

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

  it('writes an isolated failed report for an unknown strict version channel', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-p9-invalid-channel-'))
    const originalCwd = process.cwd()
    const originalReportPath = process.env.MC_P9_REPORT
    const stableOutputPath = path.join(root, 'build', 'p9-live-report.json')
    const outputPath = path.join(root, 'build', 'p9-live-report-invalid-channel.json')
    try {
      process.chdir(root)
      fs.mkdirSync(path.dirname(stableOutputPath), { recursive: true })
      fs.writeFileSync(stableOutputPath, 'stable sentinel')
      process.env.MC_P9_REPORT = stableOutputPath
      const report = await runP9LifecycleGate({
        versionChannel: 'constructor',
        outputPath: stableOutputPath,
        requireOnline: true,
      })
      expect(report.status).toBe('failed')
      expect(report.versionChannel).toBe('constructor')
      expect(report.error).toMatch(/unsupported P9 version channel/)
      expect(report.checks).toEqual([
        expect.objectContaining({ status: 'failed', name: 'configuration' }),
      ])
      expect(fs.readFileSync(stableOutputPath, 'utf8')).toBe('stable sentinel')
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toMatchObject({
        status: 'failed',
        versionChannel: 'constructor',
      })
    } finally {
      process.chdir(originalCwd)
      if (originalReportPath === undefined) delete process.env.MC_P9_REPORT
      else process.env.MC_P9_REPORT = originalReportPath
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes a completed failed report when the managed Paper process cannot spawn', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-p9-spawn-error-'))
    const templateDir = path.join(root, 'template')
    const outputPath = path.join(root, 'spawn-failed.json')
    const fakeJava = path.join(root, 'fake-java')
    const originalJava = process.env.MC_JAVA_BIN
    try {
      fs.mkdirSync(path.join(templateDir, 'plugins'), { recursive: true })
      fs.mkdirSync(path.join(templateDir, 'libraries'), { recursive: true })
      fs.mkdirSync(path.join(templateDir, 'versions'), { recursive: true })
      fs.writeFileSync(path.join(templateDir, 'paper.jar'), 'paper sentinel')
      fs.writeFileSync(path.join(templateDir, 'plugins', 'redscript-testharness-1.2.0.jar'), 'plugin sentinel')
      fs.writeFileSync(fakeJava, `#!/bin/sh\nrm -- "$0"\necho 'openjdk version "25"' >&2\n`)
      fs.chmodSync(fakeJava, 0o755)
      process.env.MC_JAVA_BIN = fakeJava

      const startedAt = Date.now()
      const report = await runP9LifecycleGate({ templateDir, outputPath, requireOnline: true })
      expect(Date.now() - startedAt).toBeLessThan(5_000)
      expect(report.status).toBe('failed')
      expect(report.completedAt).toBeDefined()
      expect(report.error).toMatch(/failed to spawn/)
      expect(report.checks).toContainEqual(
        expect.objectContaining({ name: 'lifecycle-gate', status: 'failed' }),
      )
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toMatchObject({ status: 'failed' })
    } finally {
      if (originalJava === undefined) delete process.env.MC_JAVA_BIN
      else process.env.MC_JAVA_BIN = originalJava
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
