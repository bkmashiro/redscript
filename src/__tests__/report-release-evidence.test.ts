import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(__dirname, '../..')
const scriptPath = path.join(repoRoot, 'scripts', 'report-release-evidence.js')

function runReport(args: string[] = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  })

  if (result.error) {
    throw result.error
  }

  expect(result.status).toBe(0)
  return result.stdout
}

describe('report-release-evidence', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  )

  const expectedRequiredLocalCommands = [
    'npm run build',
    'npm test -- --selectProjects unit --runInBand',
    'npm run validate-mc',
    'npm run test:mc-core',
    'npm run gate:lir-local-copy -- --output /tmp/redscript-release-lir-local-copy.json',
    'npm run smoke:package',
    'npm run smoke:browser-ide -- --ide-dir /Users/yuzhe/projects/redscript-ide',
    'git diff --check'
  ]

  it('prints JSON with deterministic evidence fields', () => {
    const output = runReport()
    const data = JSON.parse(output)

    expect(data.package).toEqual({
      name: packageJson.name,
      version: packageJson.version
    })
    expect(data.evidenceLabels).toEqual([
      {
        label: 'compile-only',
        meaning: 'compiler accepts source and emits datapack artifacts.'
      },
      {
        label: 'static-mc-validation',
        meaning: 'emitted commands pass RedScript static MC validator checks.'
      },
      {
        label: 'golden-artifact-shape',
        meaning: 'emitted file/command shape is checked by pinned golden or artifact-shape tests.'
      },
      {
        label: 'live-paper-oracle',
        meaning: 'a running Paper/TestHarness returns structured runtime assertion results.'
      }
    ])
    expect(data.requiredLocalStaticCommands).toEqual(expectedRequiredLocalCommands)
    expect(data.liveRequiresHarness).toBe(true)
    expect(data.smokeScripts).toMatchObject({
      'smoke:package': 'node scripts/smoke-package.js',
      'smoke:browser-ide': 'node scripts/smoke-browser-ide.js'
    })
    expect(
      typeof data.gitCommit === 'string' || data.gitCommit === null
    ).toBe(true)
    if (data.gitCommit !== null) {
      expect(data.gitCommit).toMatch(/^[0-9a-f]{7}$/)
    }
    expect(data.liveCommands).toEqual([
      'curl -fsS --max-time 5 "http://${MC_HOST:-localhost}:${MC_PORT:-25561}/status"',
      'MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live'
    ])
    expect(data.liveBaseline).toBe('26/26')
  })

  it('supports --pretty output', () => {
    const output = runReport(['--pretty'])
    const parsed = JSON.parse(output)

    expect(output).toContain('\n  "package"')
    expect(parsed).toEqual(JSON.parse(runReport()))
    expect(parsed.liveRequiresHarness).toBe(true)
  })
})
