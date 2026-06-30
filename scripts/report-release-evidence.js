const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..')
const packagePath = path.join(repoRoot, 'package.json')
const checklistPath = path.join(repoRoot, 'docs/plans/redscript-release-evidence-checklist.md')

const fallbackLocalCommands = [
  'npm run build',
  'npm test -- --selectProjects unit --runInBand',
  'npm run validate-mc',
  'npm run test:mc-core',
  'npm run gate:lir-local-copy -- --output /tmp/redscript-release-lir-local-copy.json',
  'npm run smoke:package',
  'npm run smoke:browser-ide -- --ide-dir /Users/yuzhe/projects/redscript-ide',
  'git diff --check'
]

const fallbackLiveCommands = [
  'curl -fsS --max-time 5 "http://${MC_HOST:-localhost}:${MC_PORT:-25561}/status"',
  'MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live'
]

const evidenceLabels = [
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
]

function readFileOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (_error) {
    return null
  }
}

function extractBashBlock(content, heading) {
  const lines = content.split('\n')
  const headingLower = heading.toLowerCase()
  const headerIndex = lines.findIndex((line) =>
    /^##\s+/.test(line) && line.toLowerCase().includes(headingLower)
  )
  if (headerIndex < 0) {
    return null
  }

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      break
    }
    if (lines[i].trim() === '```bash') {
      const block = []
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim() === '```') {
          return block
        }
        block.push(lines[j])
      }
    }
  }

  return null
}

function normalizeCommands(lines) {
  if (!lines) return null
  const commands = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  return commands.length > 0 ? commands : null
}

function parseCommandsFromChecklist() {
  const content = readFileOrNull(checklistPath)
  if (!content) {
    return {
      localStaticCommands: fallbackLocalCommands.slice(),
      liveCommands: fallbackLiveCommands.slice(),
      liveBaseline: null
    }
  }

  const localStaticCommands = normalizeCommands(
    extractBashBlock(content, 'required local/static evidence')
  ) || fallbackLocalCommands.slice()

  const liveCommands = normalizeCommands(
    extractBashBlock(content, 'live paper evidence')
  ) || fallbackLiveCommands.slice()

  const baselineMatch = content.match(/Current local baseline[^`]*`([^`]+)`/)
  const liveBaseline = baselineMatch?.[1] ? baselineMatch[1] : null

  return { localStaticCommands, liveCommands, liveBaseline }
}

function readSmokeScripts(pkg) {
  const scripts = pkg?.scripts || {}
  const candidateNames = ['smoke:package', 'smoke:browser-ide']
  const found = Object.create(null)

  for (const name of candidateNames) {
    if (typeof scripts[name] === 'string' && scripts[name].trim().length > 0) {
      found[name] = scripts[name]
    }
  }

  return found
}

function readGitCommit() {
  try {
    const result = execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const commit = (result || '').trim()
    return commit.length > 0 ? commit : null
  } catch (_error) {
    return null
  }
}

function main() {
  const pkgRaw = readFileOrNull(packagePath)
  if (!pkgRaw) {
    throw new Error(`Unable to read package.json at ${packagePath}`)
  }
  const pkg = JSON.parse(pkgRaw)
  const { localStaticCommands, liveCommands, liveBaseline } = parseCommandsFromChecklist()
  const smokeScripts = readSmokeScripts(pkg)

  const report = {
    package: {
      name: pkg.name || null,
      version: pkg.version || null
    },
    gitCommit: readGitCommit(),
    evidenceLabels,
    requiredLocalStaticCommands: localStaticCommands,
    liveCommands,
    liveRequiresHarness: true,
    smokeScripts,
    liveBaseline
  }

  const pretty = process.argv.includes('--pretty')
  const json = JSON.stringify(report, null, pretty ? 2 : undefined)
  process.stdout.write(json + '\n')
}

main()
