#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const FAMILY_ORDER = [
  'scoreboard',
  'execute',
  'data',
  'function',
  'summon',
  'tp',
  'storage',
  'particle',
  'title',
  'bossbar',
  'setblock',
  'fill',
  'other',
]

function usage(exitCode = 1) {
  const message = [
    'Usage:',
    '  node scripts/report-compile-cost.js <source.mcrs> [source.mcrs ...] [--namespace <name>] [--pretty]',
    '',
    'Options:',
    '  --namespace <name>  Use this namespace for all compiled sources',
    '  --pretty            Emit pretty-formatted JSON',
    '',
  ].join('\n')
  console.error(message)
  process.exit(exitCode)
}

function createZeroedFamilyCounts() {
  const counts = {}
  for (const family of FAMILY_ORDER) counts[family] = 0
  return counts
}

function makeFamilyCounts(lines) {
  const counts = createZeroedFamilyCounts()
  let nonCommentCommands = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const first = trimmed.split(/\s+/)[0]
    if (!first) continue
    nonCommentCommands += 1
    if (counts[first] !== undefined) counts[first] += 1
    else counts.other += 1
  }
  return { nonCommentCommands, commandFamilyCounts: counts }
}

function parseArgs(argv) {
  const sources = []
  let namespace
  let pretty = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--pretty') {
      pretty = true
      continue
    }
    if (arg === '--namespace') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error('Missing value for --namespace')
      }
      namespace = argv[++i]
      continue
    }
    if (arg.startsWith('--namespace=')) {
      namespace = arg.slice('--namespace='.length)
      continue
    }
    if (arg === '-h' || arg === '--help') usage(0)
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }
    sources.push(arg)
  }

  if (sources.length === 0) {
    throw new Error('Missing source.mcrs')
  }

  return {
    sources: [...new Set(sources)].sort(),
    namespace,
    pretty,
  }
}

function loadCompileApi() {
  const compilePath = path.resolve(__dirname, '../dist/src/compile.js')
  if (!fs.existsSync(compilePath)) {
    throw new Error([
      `Missing compiled output: ${compilePath}`,
      'Run `npm run build` before running this script.',
    ].join('\n'))
  }

  let compileModule
  try {
    compileModule = require(compilePath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not load compiler module at ${compilePath}: ${message}`)
  }

  const candidates = [
    compileModule?.compile,
    compileModule?.default?.compile,
    compileModule?.default,
    compileModule,
  ]
  const compile = candidates.find(candidate => typeof candidate === 'function')
  if (typeof compile !== 'function') {
    throw new Error('Loaded compiler module does not expose a compile function')
  }

  return compile
}

function collectOutputMetrics(outputFiles) {
  const sortedFiles = [...outputFiles].sort((a, b) => a.path.localeCompare(b.path))
  const fileSummaries = []
  const familyCounts = createZeroedFamilyCounts()
  let totalNonCommentCommands = 0

  for (const file of sortedFiles) {
    const isMcfunction = file.path.endsWith('.mcfunction')
    if (!isMcfunction) {
      fileSummaries.push({ path: file.path, isMcfunction, nonCommentCommands: 0, commandFamilyCounts: createZeroedFamilyCounts() })
      continue
    }

    const commandStats = makeFamilyCounts(file.content.split(/\r?\n/))
    totalNonCommentCommands += commandStats.nonCommentCommands
    for (const family of FAMILY_ORDER) {
      familyCounts[family] += commandStats.commandFamilyCounts[family]
    }

    fileSummaries.push({
      path: file.path,
      isMcfunction,
      nonCommentCommands: commandStats.nonCommentCommands,
      commandFamilyCounts: commandStats.commandFamilyCounts,
    })
  }

  const totalFiles = sortedFiles.length
  const mcfunctionFiles = fileSummaries.filter(file => file.isMcfunction).length
  return {
    totalFiles,
    mcfunctionFiles,
    nonCommentCommands: totalNonCommentCommands,
    commandFamilyCounts: familyCounts,
    files: fileSummaries,
  }
}

function main() {
  let parsedArgs
  try {
    parsedArgs = parseArgs(process.argv.slice(2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    usage(1)
  }

  let compile
  try {
    compile = loadCompileApi()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  const sourceSummaries = []
  const grand = createZeroedFamilyCounts()
  let grandTotalFiles = 0
  let grandMcfunctionFiles = 0
  let grandNonCommentCommands = 0

  for (const source of parsedArgs.sources) {
    let sourceOutput
    try {
      sourceOutput = compile(fs.readFileSync(source, 'utf8'), {
        namespace: parsedArgs.namespace ?? path.parse(path.basename(source)).name,
        filePath: source,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Failed compiling ${source}: ${message}`)
      process.exit(1)
    }

    const files = sourceOutput?.files
    if (!Array.isArray(files)) {
      console.error(`Compiler output for ${source} did not include a files array`)
      process.exit(1)
    }

    const metrics = collectOutputMetrics(files)
    for (const family of FAMILY_ORDER) {
      grand[family] += metrics.commandFamilyCounts[family]
    }
    grandTotalFiles += metrics.totalFiles
    grandMcfunctionFiles += metrics.mcfunctionFiles
    grandNonCommentCommands += metrics.nonCommentCommands

    sourceSummaries.push({
      source,
      namespace: parsedArgs.namespace ?? path.parse(path.basename(source)).name,
      totalFiles: metrics.totalFiles,
      mcfunctionFiles: metrics.mcfunctionFiles,
      nonCommentCommands: metrics.nonCommentCommands,
      commandFamilyCounts: metrics.commandFamilyCounts,
      files: metrics.files,
    })
  }

  sourceSummaries.sort((a, b) => a.source.localeCompare(b.source))

  const output = {
    sources: sourceSummaries,
    totals: {
      totalFiles: grandTotalFiles,
      mcfunctionFiles: grandMcfunctionFiles,
      nonCommentCommands: grandNonCommentCommands,
      commandFamilyCounts: grand,
    },
  }

  const spacing = parsedArgs.pretty ? 2 : 0
  console.log(JSON.stringify(output, null, spacing))
}

main()
