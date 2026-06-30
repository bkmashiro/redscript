#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const childProcess = require('node:child_process')

const PROGRAM = '@load fn init() { say("ide smoke"); }'
const NPM_CACHE_DIR = path.join(os.tmpdir(), 'redscript-smoke-npm-cache')

fs.mkdirSync(NPM_CACHE_DIR, { recursive: true })

function fail(message, error) {
  if (error?.message) console.error(error.message)
  console.error(message)
  process.exit(1)
}

function runCommand(command, args, options = {}) {
  const result = childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, npm_config_cache: NPM_CACHE_DIR },
    ...options,
  })
  return result ?? ''
}

function runCommandCapture(command, args, options = {}) {
  return childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, npm_config_cache: NPM_CACHE_DIR },
    ...options,
  })
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function parseIdeDir(argv) {
  const explicitArgIndex = argv.indexOf('--ide-dir')
  if (explicitArgIndex !== -1) {
    const explicit = argv[explicitArgIndex + 1]
    if (!explicit) {
      throw new Error('--ide-dir requires a path argument')
    }
    return explicit
  }
  return path.resolve(process.cwd(), '../redscript-ide')
}

function resolveCompilerPath(rootDir) {
  const relativeCandidates = ['public/compiler.js', 'dist/public/compiler.js']
  for (const relative of relativeCandidates) {
    const fullPath = path.join(rootDir, relative)
    if (fs.existsSync(fullPath)) return fullPath
  }
  throw new Error('public/compiler.js was not produced by ide build')
}

function packPackage() {
  const workspaceDir = process.cwd()
  const packDir = makeTempDir('redscript-smoke-pack-')
  try {
    const output = runCommandCapture(
      'npm',
      ['pack', '--pack-destination', packDir, '--silent', '--json'],
      { cwd: workspaceDir },
    ).trim()

    let entries
    try {
      entries = JSON.parse(output)
    } catch {
      const fallback = output.match(/([^\s]+\.tgz)/)
      if (!fallback) throw new Error('Could not parse `npm pack --json` output')
      entries = [{ filename: fallback[1] }]
    }

    if (!Array.isArray(entries)) entries = [entries]
    const filename = entries[0]?.filename
    if (!filename) throw new Error('`npm pack` returned no tarball filename')
    return { tarballPath: path.join(packDir, filename), cleanupDir: packDir }
  } catch (error) {
    fs.rmSync(packDir, { recursive: true, force: true })
    throw error
  }
}

function extractFiles(result) {
  if (Array.isArray(result)) return result
  if (result && Array.isArray(result.files)) return result.files
  return []
}

function hasRequiredFiles(files) {
  const hasPackMeta = files.some((file) => file.path === 'pack.mcmeta')
  const hasInit = files.some((file) => {
    const filePath = String(file.path ?? '')
    return filePath.endsWith('init.mcfunction')
  })
  if (!hasPackMeta) {
    throw new Error('missing pack.mcmeta in compiler output')
  }
  if (!hasInit) {
    throw new Error('missing init.mcfunction in compiler output')
  }
}

function main() {
  const workspaceDir = process.cwd()
  let ideDir
  let tempPackDir

  try {
    ideDir = path.resolve(parseIdeDir(process.argv.slice(2)))
  } catch (error) {
    fail(error.message)
  }

  if (!fs.existsSync(ideDir)) {
    fail(`IDE path missing: ${ideDir}`)
  }

  if (!fs.statSync(ideDir).isDirectory()) {
    fail(`IDE path is not a directory: ${ideDir}`)
  }

  try {
    const { tarballPath, cleanupDir } = packPackage()
    tempPackDir = cleanupDir

    runCommand(
      'npm',
      [
        'install',
        '--no-save',
        '--no-package-lock',
        '--no-audit',
        '--no-fund',
        tarballPath,
      ],
      { cwd: ideDir },
    )

    runCommand('npm', ['run', 'build'], { cwd: ideDir })

    const compilerJs = resolveCompilerPath(ideDir)
    const compilerCode = fs.readFileSync(compilerJs, 'utf8')
    const sandbox = { console }
    sandbox.globalThis = sandbox
    sandbox.window = sandbox
    sandbox.global = sandbox

    vm.createContext(sandbox)
    vm.runInContext(compilerCode, sandbox, { filename: compilerJs })

    const compiler = sandbox.RedScriptCompiler
    if (!compiler || typeof compiler.compileRedScript !== 'function') {
      throw new Error('compiler bundle did not expose RedScriptCompiler.compileRedScript')
    }

    const result = compiler.compileRedScript(PROGRAM)
    const files = extractFiles(result)
    if (!files.length) {
      throw new Error('compileRedScript() returned no files')
    }

    hasRequiredFiles(files)

    const packageJson = require(path.join(ideDir, 'node_modules', 'redscript-mc', 'package.json'))
    console.log(
      `browser IDE smoke OK v${packageJson.version} files=${files.length}`,
    )
  } catch (error) {
    fail('browser IDE smoke failed', error)
  } finally {
    if (tempPackDir) fs.rmSync(tempPackDir, { recursive: true, force: true })
  }
}

main()
