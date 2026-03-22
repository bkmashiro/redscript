import { compile } from '../index'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'

describe('init CLI', () => {
  const cliPath = path.resolve(__dirname, '..', 'cli.ts')
  const cliRunner = [require.resolve('ts-node/register/transpile-only')]

  it('creates the expected project structure', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-init-cli-'))
    const projectDir = path.join(tempDir, 'demo-pack')

    const result = spawnSync(
      process.execPath,
      ['-r', ...cliRunner, cliPath, 'init', projectDir],
      {
        encoding: 'utf-8',
        env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
      }
    )

    expect(result.status).toBe(0)
    expect(fs.existsSync(path.join(projectDir, 'src', 'main.mcrs'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'redscript.config.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'README.md'))).toBe(true)
  })

  it('writes the expected redscript.config.json', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-init-cli-'))
    const projectDir = path.join(tempDir, 'demo-pack')

    const result = spawnSync(
      process.execPath,
      ['-r', ...cliRunner, cliPath, 'init', projectDir],
      {
        encoding: 'utf-8',
        env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
      }
    )

    expect(result.status).toBe(0)

    const config = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'redscript.config.json'), 'utf-8')
    )

    expect(config).toEqual({
      namespace: 'demo_pack',
      entry: 'src/main.mcrs',
      outDir: 'dist/',
      mcVersion: '1.21.4',
    })
  })

  it('scaffolds a main.mcrs template that compiles', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-init-cli-'))
    const projectDir = path.join(tempDir, 'demo-pack')

    const result = spawnSync(
      process.execPath,
      ['-r', ...cliRunner, cliPath, 'init', projectDir],
      {
        encoding: 'utf-8',
        env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
      }
    )

    expect(result.status).toBe(0)

    const config = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'redscript.config.json'), 'utf-8')
    )
    const entryPath = path.join(projectDir, config.entry)
    const source = fs.readFileSync(entryPath, 'utf-8')
    const compiled = compile(source, {
      namespace: config.namespace,
      filePath: entryPath,
    })
    const loadTag = compiled.files.find(file => file.path.includes('load.json'))
    const tickTag = compiled.files.find(file => file.path.includes('tick.json'))

    expect(compiled.files.some(file => file.path === 'pack.mcmeta')).toBe(true)
    expect(loadTag).toBeDefined()
    expect(tickTag).toBeDefined()
    expect(JSON.parse(loadTag!.content).values).toContain(`${config.namespace}:setup`)
    expect(JSON.parse(tickTag!.content).values).toContain(`${config.namespace}:heartbeat`)
  })
})
