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

test('consumer smoke preserves a caller-owned tarball directory', () => {
  const os = require('node:os')
  const path = require('node:path')
  const borrowed = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-borrowed-tarball-'))
  const tarball = path.join(borrowed, 'candidate.tgz')
  fs.writeFileSync(tarball, 'caller-owned archive')
  const previousPath = process.env.REDSCRIPT_SMOKE_TARBALL
  const previousExit = process.exitCode
  const owned = []
  const realMkdtemp = fs.mkdtempSync.bind(fs)
  const makeDir = jest.spyOn(fs, 'mkdtempSync').mockImplementation(prefix => {
    const dir = realMkdtemp(prefix); owned.push(dir); return dir
  })
  const exec = jest.spyOn(childProcess, 'execFileSync').mockReturnValue('')
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    process.env.REDSCRIPT_SMOKE_TARBALL = tarball
    main()
    expect(process.exitCode).toBe(1) // mocked install did not provide a package
    expect(owned).toHaveLength(1)
    expect(fs.readFileSync(tarball, 'utf8')).toBe('caller-owned archive')
    expect(owned.every(dir => !fs.existsSync(dir))).toBe(true)
    expect(exec.mock.calls.some(([, args]) => args?.[0] === 'pack')).toBe(false)
  } finally {
    if (previousPath === undefined) delete process.env.REDSCRIPT_SMOKE_TARBALL
    else process.env.REDSCRIPT_SMOKE_TARBALL = previousPath
    process.exitCode = previousExit
    makeDir.mockRestore(); exec.mockRestore(); log.mockRestore()
    for (const dir of owned) fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(borrowed, { recursive: true, force: true })
  }
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
