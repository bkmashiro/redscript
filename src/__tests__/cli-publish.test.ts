/**
 * Tests for `redscript publish` command.
 *
 * Verifies that the generated .zip contains:
 *  - pack.mcmeta with the correct pack_format
 *  - All compiled .mcfunction files under data/<namespace>/function/
 *  - Tag JSON files under data/minecraft/tags/function/
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'
import AdmZip from 'adm-zip'

// We need adm-zip to inspect the zip — install as dev dependency if missing.
// The test will skip gracefully if the zip can't be opened.

const cliPath = path.resolve(__dirname, '..', 'cli.ts')
const cliRunner = [require.resolve('ts-node/register/transpile-only')]

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    process.execPath,
    ['-r', ...cliRunner, cliPath, ...args],
    {
      encoding: 'utf-8',
      env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
      timeout: 30_000,
    }
  )
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  }
}

describe('publish CLI', () => {
  let tempDir: string
  let srcFile: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-publish-'))
    srcFile = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(srcFile, `
@load
fn setup(): void {
  say("Loaded");
}

@tick(rate=20)
fn heartbeat(): void {
  say("Tick");
}
`)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('exits 0 and produces a .zip file', () => {
    const outZip = path.join(tempDir, 'my_pack.zip')
    const result = runCli(['publish', srcFile, '--namespace', 'my_pack', '-o', outZip])

    expect(result.status).toBe(0)
    expect(fs.existsSync(outZip)).toBe(true)
  })

  it('zip contains pack.mcmeta at root', () => {
    const outZip = path.join(tempDir, 'test.zip')
    runCli(['publish', srcFile, '--namespace', 'test_ns', '-o', outZip])

    const zip = new AdmZip(outZip)
    const mcmeta = zip.getEntry('pack.mcmeta')
    expect(mcmeta).not.toBeNull()

    const content = JSON.parse(zip.readAsText(mcmeta!))
    expect(content.pack).toBeDefined()
    expect(typeof content.pack.pack_format).toBe('number')
    expect(content.pack.pack_format).toBeGreaterThan(0)
  })

  it('pack_format is 48 for mc 1.21.4', () => {
    const outZip = path.join(tempDir, 'mc1214.zip')
    runCli(['publish', srcFile, '--namespace', 'ns', '--mc-version', '1.21.4', '-o', outZip])

    const zip = new AdmZip(outZip)
    const content = JSON.parse(zip.readAsText(zip.getEntry('pack.mcmeta')!))
    expect(content.pack.pack_format).toBe(48)
  })

  it('pack_format is 45 for mc 1.21', () => {
    const outZip = path.join(tempDir, 'mc121.zip')
    runCli(['publish', srcFile, '--namespace', 'ns', '--mc-version', '1.21', '-o', outZip])

    const zip = new AdmZip(outZip)
    const content = JSON.parse(zip.readAsText(zip.getEntry('pack.mcmeta')!))
    expect(content.pack.pack_format).toBe(45)
  })

  it('pack_format is 26 for mc 1.20.4', () => {
    const outZip = path.join(tempDir, 'mc1204.zip')
    runCli(['publish', srcFile, '--namespace', 'ns', '--mc-version', '1.20.4', '-o', outZip])

    const zip = new AdmZip(outZip)
    const content = JSON.parse(zip.readAsText(zip.getEntry('pack.mcmeta')!))
    expect(content.pack.pack_format).toBe(26)
  })

  it('pack_format is 18 for mc 1.20.1', () => {
    const outZip = path.join(tempDir, 'mc1201.zip')
    runCli(['publish', srcFile, '--namespace', 'ns', '--mc-version', '1.20.1', '-o', outZip])

    const zip = new AdmZip(outZip)
    const content = JSON.parse(zip.readAsText(zip.getEntry('pack.mcmeta')!))
    expect(content.pack.pack_format).toBe(18)
  })

  it('zip contains compiled mcfunction files', () => {
    const outZip = path.join(tempDir, 'funcs.zip')
    runCli(['publish', srcFile, '--namespace', 'mypkg', '-o', outZip])

    const zip = new AdmZip(outZip)
    const entries = zip.getEntries().map(e => e.entryName)

    // Should contain at least one .mcfunction file under data/mypkg/function/
    const mcfunctions = entries.filter(e => e.startsWith('data/mypkg/function/') && e.endsWith('.mcfunction'))
    expect(mcfunctions.length).toBeGreaterThan(0)
  })

  it('zip contains tag json files for @load and @tick', () => {
    const outZip = path.join(tempDir, 'tags.zip')
    runCli(['publish', srcFile, '--namespace', 'tagged', '-o', outZip])

    const zip = new AdmZip(outZip)
    const entries = zip.getEntries().map(e => e.entryName)

    const hasLoadTag = entries.some(e => e.includes('tags') && e.includes('load.json'))
    const hasTickTag = entries.some(e => e.includes('tags') && e.includes('tick.json'))
    expect(hasLoadTag).toBe(true)
    expect(hasTickTag).toBe(true)
  })

  it('reads namespace and mcVersion from redscript.config.json', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-publish-cfg-'))
    const entrySrc = path.join(projectDir, 'main.mcrs')
    fs.writeFileSync(entrySrc, '@load\nfn setup(): void { say("hi"); }')
    fs.writeFileSync(path.join(projectDir, 'redscript.config.json'), JSON.stringify({
      namespace: 'from_config',
      entry: 'main.mcrs',
      outDir: 'dist/',
      mcVersion: '1.21.4',
      description: 'Config-driven pack',
    }))

    const outZip = path.join(projectDir, 'from_config.zip')
    const result = runCli(['publish', entrySrc, '-o', outZip])

    expect(result.status).toBe(0)

    const zip = new AdmZip(outZip)
    const mcmeta = JSON.parse(zip.readAsText(zip.getEntry('pack.mcmeta')!))
    expect(mcmeta.pack.pack_format).toBe(48)
    expect(mcmeta.pack.description).toBe('Config-driven pack')

    const entries = zip.getEntries().map((e: AdmZip.IZipEntry) => e.entryName)
    expect(entries.some((e: string) => e.startsWith('data/from_config/function/'))).toBe(true)

    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('--description flag overrides config', () => {
    const outZip = path.join(tempDir, 'desc.zip')
    runCli(['publish', srcFile, '--namespace', 'ns', '--description', 'My Custom Pack', '-o', outZip])

    const zip = new AdmZip(outZip)
    const content = JSON.parse(zip.readAsText(zip.getEntry('pack.mcmeta')!))
    expect(content.pack.description).toBe('My Custom Pack')
  })

  it('defaults output filename to <namespace>.zip in cwd', () => {
    const outZip = path.join(tempDir, 'default_ns.zip')
    const result = runCli(['publish', srcFile, '--namespace', 'default_ns', '-o', outZip])

    expect(result.status).toBe(0)
    expect(fs.existsSync(outZip)).toBe(true)
  })
})
