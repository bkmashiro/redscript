#!/usr/bin/env node

const AdmZip = require('adm-zip')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')

const REQUIRED_ENTRIES = [
  'extension/out/extension.js',
  'extension/out/lsp-server.js',
  'extension/builtins.d.mcrs',
  'extension/snippets/redscript.json',
  'extension/syntaxes/redscript.tmLanguage.json',
  'extension/syntaxes/mcfunction.tmLanguage.json',
  'extension/icons/redscript-icons.json',
  'extension/icons/mcrs.svg',
  'extension/package.json',
]

const EXTENSION_DIR = path.join(__dirname, '..', 'editors', 'vscode')

function fail(message, error) {
  if (error?.message) console.error(error.message)
  console.error(message)
  process.exit(1)
}

function runCommand(command, args, options = {}) {
  childProcess.execFileSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  })
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function pickLatestVsix(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.vsix'))
    .map((name) => {
      const fullPath = path.join(dir, name)
      const stat = fs.statSync(fullPath)
      return { fullPath, mtime: stat.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)

  if (!files.length) {
    throw new Error(`no .vsix file found in ${dir}`)
  }

  return files[0].fullPath
}

function listEntries(zipPath) {
  const zip = new AdmZip(zipPath)
  return zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.entryName.replace(/\\/g, '/'))
}

function verifyRequiredEntries(entries, requiredEntries) {
  const set = new Set(entries)
  for (const required of requiredEntries) {
    if (!set.has(required)) {
      throw new Error(`missing expected VSIX content file: ${required}`)
    }
  }
}

function main() {
  const tempOutputDir = makeTempDir('redscript-vscode-vsix-smoke-')

  try {
    console.log(`smoke(vsix): packaging to ${tempOutputDir} ...`)
    runCommand('npm', ['run', 'package', '--', '--out', tempOutputDir], {
      cwd: EXTENSION_DIR,
    })

    const vsixPath = pickLatestVsix(tempOutputDir)
    console.log(`smoke(vsix): packaged artifact: ${path.basename(vsixPath)}`)

    const entries = listEntries(vsixPath)
    verifyRequiredEntries(entries, REQUIRED_ENTRIES)

    console.log('smoke(vsix): PASS - all required package assets are present')
    for (const required of REQUIRED_ENTRIES) {
      console.log(`  + ${required}`)
    }
  } catch (error) {
    fail('smoke(vsix): FAIL', error)
  } finally {
    fs.rmSync(tempOutputDir, { recursive: true, force: true })
  }
}

main()
