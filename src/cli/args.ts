import * as path from 'path'

export interface ParsedArgs {
  command?: string
  file?: string
  output?: string
  namespace?: string
  help?: boolean
  hotReload?: string
  sourceMap?: boolean
  mcVersionStr?: string
  lenient?: boolean
  includeDirs?: string[]
  format?: 'human' | 'json'
  fmtCheck?: boolean
  incremental?: boolean
  fix?: boolean
  maxFunctionLines?: number
  description?: string
  dryRun?: boolean
  mcUrl?: string
  list?: boolean
  snapshotStages?: string
  snapshotOutput?: string
  experimentalLirLocalCopyRewrite?: boolean
}

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {}
  let i = 0

  while (i < args.length) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      result.help = true
      i++
    } else if (arg === '-o' || arg === '--output') {
      result.output = args[++i]
      i++
    } else if (arg === '--namespace') {
      result.namespace = args[++i]
      i++
    } else if (arg === '--hot-reload') {
      result.hotReload = args[++i]
      i++
    } else if (arg === '--source-map') {
      result.sourceMap = true
      i++
    } else if (arg === '--mc-version') {
      result.mcVersionStr = args[++i]
      i++
    } else if (arg === '--lenient') {
      result.lenient = true
      i++
    } else if (arg === '--include') {
      if (!result.includeDirs) result.includeDirs = []
      result.includeDirs.push(args[++i])
      i++
    } else if (arg === '--format') {
      const format = args[++i]
      if (format === 'json' || format === 'human') {
        result.format = format
      }
      i++
    } else if (arg === '--check') {
      result.fmtCheck = true
      i++
    } else if (arg === '--incremental') {
      result.incremental = true
      i++
    } else if (arg === '--fix') {
      result.fix = true
      i++
    } else if (arg === '--max-function-lines') {
      result.maxFunctionLines = parseInt(args[++i], 10)
      i++
    } else if (arg === '--description') {
      result.description = args[++i]
      i++
    } else if (arg === '--dry-run') {
      result.dryRun = true
      i++
    } else if (arg === '--list') {
      result.list = true
      i++
    } else if (arg === '--mc-url') {
      result.mcUrl = args[++i]
      i++
    } else if (arg === '--snapshot-stages') {
      result.snapshotStages = args[++i]
      i++
    } else if (arg === '--snapshot-output') {
      result.snapshotOutput = args[++i]
      i++
    } else if (arg === '--experimental-lir-local-copy-rewrite') {
      result.experimentalLirLocalCopyRewrite = true
      i++
    } else if (!result.command) {
      result.command = arg
      i++
    } else if (!result.file) {
      result.file = arg
      i++
    } else {
      i++
    }
  }

  return result
}

export function deriveNamespace(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath))
  return basename.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

export function sanitizeProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
}
