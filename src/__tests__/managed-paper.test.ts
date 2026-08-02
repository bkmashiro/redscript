import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { MCTestClient } from '../mc-test/client'
import {
  ManagedPaperPrerequisiteError,
  ManagedPaperServer,
  createDeterministicServerProperties,
  findHarnessPlugin,
  prepareServerRoot,
} from '../mc-test/managed-paper'

type Fixture = {
  root: string
  templateDir: string
  harnessPlugin: string
}

function makeTemplate(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-managed-paper-test-'))
  const templateDir = path.join(root, 'template')
  const harnessPlugin = path.join(templateDir, 'plugins', 'redscript-testharness-1.2.0.jar')
  fs.mkdirSync(templateDir, { recursive: true })
  fs.mkdirSync(path.dirname(harnessPlugin), { recursive: true })
  fs.mkdirSync(path.join(templateDir, 'libraries'))
  fs.mkdirSync(path.join(templateDir, 'versions'))
  fs.mkdirSync(path.join(templateDir, 'world', 'region'), { recursive: true })
  fs.mkdirSync(path.join(templateDir, 'world_nether'))
  fs.mkdirSync(path.join(templateDir, 'world_the_end'))
  fs.writeFileSync(path.join(templateDir, 'paper.jar'), 'paper sentinel')
  fs.writeFileSync(harnessPlugin, 'plugin sentinel')
  fs.writeFileSync(path.join(templateDir, 'world', 'region', 'template-region-marker'), 'must stay in template')
  return { root, templateDir, harnessPlugin }
}

describe('managed Paper extraction', () => {
  it('keeps deterministic server properties stable while exposing the configured port', () => {
    expect(createDeterministicServerProperties(25570)).toContain('server-port=25570\n')
    expect(createDeterministicServerProperties(25570)).toContain('generator-settings={"biome":"minecraft:the_void","layers":[{"block":"minecraft:air","height":1}],"structures":{"structures":{}}}\n')
    expect(createDeterministicServerProperties(25570)).not.toContain('minecraft:plains')
  })

  it('creates unique disposable roots without copying template world directories', () => {
    const fixture = makeTemplate()
    const roots: string[] = []
    try {
      roots.push(prepareServerRoot(fixture.templateDir, fixture.harnessPlugin, { serverPort: 25570 }))
      roots.push(prepareServerRoot(fixture.templateDir, fixture.harnessPlugin, { serverPort: 25571 }))

      expect(roots[0]).not.toBe(fixture.templateDir)
      expect(roots[0]).not.toBe(roots[1])
      for (const root of roots) {
        expect(fs.existsSync(path.join(root, 'world'))).toBe(false)
        expect(fs.existsSync(path.join(root, 'world_nether'))).toBe(false)
        expect(fs.existsSync(path.join(root, 'world_the_end'))).toBe(false)
        expect(fs.readFileSync(path.join(root, 'server.properties'), 'utf8')).toContain(
          'server-port=2557',
        )
      }
      expect(fs.existsSync(path.join(fixture.templateDir, 'world', 'region', 'template-region-marker'))).toBe(true)
    } finally {
      for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('fails closed for invalid templates and refuses the source template as a runtime root', async () => {
    const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-managed-paper-invalid-'))
    try {
      expect(() => findHarnessPlugin(path.join(missing, 'no-plugins'))).toThrow(ManagedPaperPrerequisiteError)
      expect(() => prepareServerRoot(missing, path.join(missing, 'missing-plugin'))).toThrow(
        /missing offline Paper prerequisite/,
      )

      const fixture = makeTemplate()
      try {
        expect(() => new ManagedPaperServer(
          fixture.templateDir,
          '/definitely/not-java',
          new MCTestClient('127.0.0.1', 25561),
          { sourceTemplateDir: fixture.templateDir },
        )).toThrow(/template directory.*runtime root/i)
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true })
      }
    } finally {
      fs.rmSync(missing, { recursive: true, force: true })
    }
  })

  it('returns cleanup failures as structured data for the caller', async () => {
    const fixture = makeTemplate()
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-managed-paper-runtime-'))
    const managed = new ManagedPaperServer(
      runtimeRoot,
      '/definitely/not-java',
      new MCTestClient('127.0.0.1', 25561),
      { sourceTemplateDir: fixture.templateDir },
    )
    const stop = jest.spyOn(ManagedPaperServer.prototype, 'stop').mockRejectedValueOnce(new Error('stop blocked'))
    try {
      await expect(managed.cleanup()).resolves.toEqual({
        failures: [{ stage: 'stop', message: 'stop blocked' }],
      })
    } finally {
      stop.mockRestore()
      fs.rmSync(runtimeRoot, { recursive: true, force: true })
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})
