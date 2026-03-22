import { spawnSync } from 'child_process'
import * as path from 'path'
import { buildDocsUrl, STDLIB_MODULES, docsCommand, DOCS_BASE_URL } from '../docs'

const cliPath = path.resolve(__dirname, '..', 'cli.ts')
const cliRunner = [require.resolve('ts-node/register/transpile-only')]

function runCli(...args: string[]) {
  return spawnSync(
    process.execPath,
    ['-r', ...cliRunner, cliPath, ...args],
    {
      encoding: 'utf-8',
      env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
    }
  )
}

describe('redscript docs command', () => {
  // 1. Basic command parsing — exits 0, prints URL
  it('opens the stdlib index when no module is given', () => {
    const opened: string[] = []
    docsCommand(undefined, false, url => opened.push(url))
    expect(opened).toHaveLength(1)
    expect(opened[0]).toBe(`${DOCS_BASE_URL}/en/stdlib/`)
  })

  // 2. Module argument generates correct URL
  it('builds the correct URL for a named module', () => {
    const url = buildDocsUrl('math')
    expect(url).toBe(`${DOCS_BASE_URL}/en/stdlib/math`)
  })

  it('opens the correct URL when a module argument is provided', () => {
    const opened: string[] = []
    docsCommand('random', false, url => opened.push(url))
    expect(opened).toHaveLength(1)
    expect(opened[0]).toBe(`${DOCS_BASE_URL}/en/stdlib/random`)
  })

  // 3. --list outputs stdlib module names (via CLI)
  it('--list prints all available module names without opening browser', () => {
    const result = runCli('docs', '--list')
    expect(result.status).toBe(0)
    // Should mention at least the known modules
    for (const mod of ['math', 'list', 'random', 'physics', 'player']) {
      expect(result.stdout).toContain(mod)
    }
    // Should NOT attempt to open a URL (no stdout URL)
    expect(result.stdout).not.toContain('http')
  })

  // 4. STDLIB_MODULES contains expected entries
  it('STDLIB_MODULES contains the expected stdlib modules', () => {
    const expected = [
      'math', 'math_hp', 'bits', 'bigint', 'calculus',
      'list', 'sets', 'matrix', 'vec', 'quaternion',
      'random', 'noise', 'signal', 'expr',
      'geometry', 'physics',
      'player', 'mobs', 'combat', 'effects',
    ]
    for (const mod of expected) {
      expect(STDLIB_MODULES).toContain(mod)
    }
  })

  // 5. Unknown module still opens a URL (with a warning to stderr)
  it('opens a URL even for an unknown module name (with warning)', () => {
    const opened: string[] = []
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    docsCommand('nonexistent_module', false, url => opened.push(url))
    expect(opened).toHaveLength(1)
    expect(opened[0]).toContain('nonexistent_module')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a known stdlib module'))
    warnSpy.mockRestore()
  })
})
