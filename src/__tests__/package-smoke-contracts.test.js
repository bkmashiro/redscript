const { compile } = require('../compile')
const { assertV4CompilerContracts, main } = require('../../scripts/smoke-package')
const childProcess = require('node:child_process')
const fs = require('node:fs')

test('package semantic checks accept the current production compiler', () => {
  expect(() => assertV4CompilerContracts(compile)).not.toThrow()
})

test('package semantic checks reject stale toward-zero folding', () => {
  const stale = (source, options) => {
    const result = compile(source, options)
    return { ...result, files: result.files.map(file => ({
      ...file, content: file.content.replace('#value package_numeric -3', '#value package_numeric -2'),
    })) }
  }
  expect(() => assertV4CompilerContracts(stale)).toThrow('stale integer division')
})

test('failed consumer smoke cleans owned directories and returns a nonzero exit code', () => {
  const owned = []
  const realMkdtemp = fs.mkdtempSync.bind(fs)
  const makeDir = jest.spyOn(fs, 'mkdtempSync').mockImplementation(prefix => {
    const dir = realMkdtemp(prefix)
    owned.push(dir)
    return dir
  })
  const packedFiles = ['dist/src/index.js', 'dist/src/cli.js', 'dist/src/lsp/main.js', 'src/stdlib/math.mcrs', 'src/stdlib/cooldown.mcrs', 'builtins.d.mcrs'].map(path => ({ path }))
  const exec = jest.spyOn(childProcess, 'execFileSync').mockImplementation((_command, args) =>
    args?.[0] === 'pack' ? JSON.stringify([{ filename: 'fake.tgz', files: packedFiles }]) : '')
  const exit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('unexpected immediate exit') })
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  const previous = process.exitCode
  try {
    // npm install is mocked, so requiring the installed package must fail.
    expect(() => main()).not.toThrow()
    expect(exit).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(owned).toHaveLength(2)
    expect(owned.every(dir => !fs.existsSync(dir))).toBe(true)
  } finally {
    process.exitCode = previous
    makeDir.mockRestore()
    exec.mockRestore()
    exit.mockRestore()
    log.mockRestore()
    for (const dir of owned) fs.rmSync(dir, { recursive: true, force: true })
  }
})
