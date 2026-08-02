import { createHash } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { gzipSync } from 'zlib'

import { createAdvancementResourceArtifact } from '../artifacts/advancement-builder'
import { createDatapackArtifactGraph } from '../artifacts/graph'
import { createItemModifierResourceArtifact, createLootTableResourceArtifact } from '../artifacts/loot-builder'
import type { DatapackArtifactGraph, DatapackArtifactProvenance } from '../artifacts/model'
import { createPredicateResourceArtifact } from '../artifacts/predicate-builder'
import { writeArtifactDirectoryAtomically } from '../artifacts/projection'
import { createRecipeResourceArtifact } from '../artifacts/recipe-builder'
import { createCompilerSession } from '../emit/compile'
import { loadProject } from '../project/manifest'
import type { CommandProgram, CommandStep } from '../targets/command-program'
import { McVersion } from '../types/mc-version'
import { MCTestClient } from './client'
import {
  DEFAULT_HARNESS_HOST,
  DEFAULT_HARNESS_PORT,
  DEFAULT_SERVER_PORT,
  ManagedPaperPrerequisiteError as P9SkipError,
  ManagedPaperServer,
  createDeterministicServerProperties,
  findHarnessPlugin,
  findJava,
  prepareServerRoot,
} from './managed-paper'
import { findMinecraftLifecycleFailures, partitionArtifactsByLifecycle } from './p9-lifecycle'

const HARNESS_HOST = DEFAULT_HARNESS_HOST
const HARNESS_PORT = DEFAULT_HARNESS_PORT
const SERVER_PORT = DEFAULT_SERVER_PORT
const PACK_NAME = 'redscript-p9-lifecycle'
const OBJECTIVE = 'p9_probe'

export {
  ManagedPaperServer,
  createDeterministicServerProperties,
  findHarnessPlugin,
  findJava,
  prepareServerRoot,
} from './managed-paper'

export type P9VersionChannelId = 'stable-1.21.4' | 'paper-26.2'

export interface P9VersionChannel {
  readonly id: P9VersionChannelId
  readonly minecraftVersion: '1.21.4' | '26.2'
  readonly mcVersion: McVersion
  readonly structureDataVersion: number
  readonly defaultTemplateName: 'mc-test-server' | 'mc-test-server-26.2'
}

const P9_VERSION_CHANNELS: Readonly<Record<P9VersionChannelId, P9VersionChannel>> = Object.freeze({
  'stable-1.21.4': Object.freeze({
    id: 'stable-1.21.4',
    minecraftVersion: '1.21.4',
    mcVersion: McVersion.v1_21_4,
    structureDataVersion: 4189,
    defaultTemplateName: 'mc-test-server',
  }),
  'paper-26.2': Object.freeze({
    id: 'paper-26.2',
    minecraftVersion: '26.2',
    mcVersion: McVersion.v26_2,
    structureDataVersion: 4903,
    defaultTemplateName: 'mc-test-server-26.2',
  }),
})

export function resolveP9VersionChannel(value = 'stable-1.21.4'): P9VersionChannel {
  const aliases = new Map<string, P9VersionChannelId>([
    ['stable', 'stable-1.21.4'],
    ['1.21.4', 'stable-1.21.4'],
    ['stable-1.21.4', 'stable-1.21.4'],
    ['26.2', 'paper-26.2'],
    ['paper-26.2', 'paper-26.2'],
  ])
  const id = aliases.get(value)
  if (!id) throw new Error(`unsupported P9 version channel '${value}'`)
  return P9_VERSION_CHANNELS[id]
}

export type P9EvidencePhase = 'startup' | 'reload' | 'commands' | 'restart' | 'world_reopen'
export type P9EvidenceStatus = 'passed' | 'failed' | 'skipped'

export interface P9EvidenceCheck {
  readonly phase: P9EvidencePhase
  readonly name: string
  readonly status: P9EvidenceStatus
  readonly detail: string
}

export interface P9LifecycleReport {
  readonly schemaVersion: 1
  status: P9EvidenceStatus
  startedAt: string
  completedAt?: string
  versionChannel: string
  minecraftVersion: string
  server?: {
    version: string
    paperSha256: string
    harnessSha256: string
    java: string
    firstPid: number
    restartPid: number
  }
  graph?: {
    phase1ArtifactCount: number
    phase2ArtifactCount: number
    phase1: ReturnType<typeof partitionArtifactsByLifecycle>
    phase2: ReturnType<typeof partitionArtifactsByLifecycle>
  }
  commands?: {
    setup: number
    invoke: number
    cleanup: number
    sha256: string
  }
  checks: P9EvidenceCheck[]
  error?: string
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function write(root: string, relativePath: string, content: string | Buffer): void {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function nbtName(value: string): Buffer {
  const encoded = Buffer.from(value, 'utf8')
  const length = Buffer.alloc(2)
  length.writeUInt16BE(encoded.length)
  return Buffer.concat([length, encoded])
}

function nbtInt(name: string, value: number): Buffer {
  const encoded = Buffer.alloc(4)
  encoded.writeInt32BE(value)
  return Buffer.concat([Buffer.from([3]), nbtName(name), encoded])
}

function nbtString(name: string, value: string): Buffer {
  const encoded = Buffer.from(value, 'utf8')
  const length = Buffer.alloc(2)
  length.writeUInt16BE(encoded.length)
  return Buffer.concat([Buffer.from([8]), nbtName(name), length, encoded])
}

function nbtIntList(name: string, values: readonly number[]): Buffer {
  const length = Buffer.alloc(4)
  length.writeInt32BE(values.length)
  const encoded = values.map(value => {
    const item = Buffer.alloc(4)
    item.writeInt32BE(value)
    return item
  })
  return Buffer.concat([Buffer.from([9]), nbtName(name), Buffer.from([3]), length, ...encoded])
}

function nbtCompoundList(name: string, values: readonly Buffer[]): Buffer {
  const length = Buffer.alloc(4)
  length.writeInt32BE(values.length)
  return Buffer.concat([Buffer.from([9]), nbtName(name), Buffer.from([10]), length, ...values])
}

/** Create a deterministic one-block Java structure template for the selected runtime channel. */
export function createP9StructureNbt(block: string, dataVersion = 4189): Buffer {
  if (!/^minecraft:[a-z0-9_]+$/.test(block)) throw new Error(`Invalid P9 structure block '${block}'`)
  if (!Number.isInteger(dataVersion) || dataVersion <= 0) throw new Error(`Invalid P9 structure DataVersion '${dataVersion}'`)
  const paletteEntry = Buffer.concat([nbtString('Name', block), Buffer.from([0])])
  const blockEntry = Buffer.concat([nbtInt('state', 0), nbtIntList('pos', [0, 0, 0]), Buffer.from([0])])
  const root = Buffer.concat([
    nbtInt('DataVersion', dataVersion),
    nbtIntList('size', [1, 1, 1]),
    nbtCompoundList('palette', [paletteEntry]),
    nbtCompoundList('blocks', [blockEntry]),
    nbtCompoundList('entities', []),
    Buffer.from([0]),
  ])
  return gzipSync(Buffer.concat([Buffer.from([10, 0, 0]), root]), { level: 9 })
}

function dimensionJson(): string {
  return `${JSON.stringify({
    type: 'minecraft:overworld',
    generator: {
      type: 'minecraft:noise',
      biome_source: {
        type: 'minecraft:multi_noise',
        preset: 'minecraft:overworld',
      },
      settings: 'minecraft:overworld',
    },
  }, null, 2)}\n`
}

function projectManifest(channel: P9VersionChannel): string {
  return `
[project]
name = "p9-lifecycle"
module = "example.com/p9"
namespace = "p9"
source-roots = ["src"]
mc-version = "${channel.minecraftVersion}"

[assets]
roots = ["assets"]
include = ["**/*.json", "**/*.nbt"]

[target.pack]
kind = "datapack"
entry = "example.com/p9/pack::main"
out = "build/pack"
default = true

[target.commands]
kind = "commands"
entry = "example.com/p9/commands::main"
out = "build/p9.commands.json"
max-commands = 128
`
}

function packSource(phase: 1 | 2): string {
  const block = phase === 1 ? 'minecraft:gold_block' : 'minecraft:diamond_block'
  const dimension = phase === 2
    ? 'resource dimension p9:after_restart from "dimension/after_restart.json";\n'
    : ''
  return `
package pack;

resource block_tag p9:probe_blocks {
  value ${block};
}
resource predicate p9:from_file_probe from "predicate/from_file_probe.json";
resource structure p9:probe from "structure/probe.nbt";
${dimension}
export fn main(): void {
  raw("scoreboard players set #datapack ${OBJECTIVE} ${phase * 10}");
}
`
}

function commandsSource(): string {
  return `
package commands;

export fn main(): void {
  raw("scoreboard players set #canonical ${OBJECTIVE} 40");
  raw("scoreboard players add #canonical ${OBJECTIVE} 2");
}
`
}

function writeProjectPhase(root: string, phase: 1 | 2, channel: P9VersionChannel): void {
  write(root, 'redscript.toml', projectManifest(channel))
  write(root, 'src/pack/main.mcrs', packSource(phase))
  write(root, 'src/commands/main.mcrs', commandsSource())
  write(root, 'assets/predicate/from_file_probe.json', `${JSON.stringify({
    condition: 'minecraft:random_chance',
    chance: phase === 1 ? 0 : 1,
  }, null, 2)}\n`)
  write(root, 'assets/structure/probe.nbt', createP9StructureNbt(
    phase === 1 ? 'minecraft:gold_block' : 'minecraft:diamond_block',
    channel.structureDataVersion,
  ))
  if (phase === 2) write(root, 'assets/dimension/after_restart.json', dimensionJson())
}

function typedArtifacts(channel: P9VersionChannel): ReturnType<typeof createRecipeResourceArtifact>[] {
  const provenance: DatapackArtifactProvenance = Object.freeze({
    kind: 'generated',
    stage: 'p9-live-typed-builders',
  })
  const common = { provenance, minecraftVersion: channel.mcVersion }
  return [
    createRecipeResourceArtifact({
      ...common,
      id: 'p9:typed_recipe',
      recipe: {
        kind: 'shapeless',
        ingredients: [{ item: 'minecraft:stone' }],
        result: { id: 'minecraft:stone_button' },
      },
    }),
    createAdvancementResourceArtifact({
      ...common,
      id: 'p9:typed_advancement',
      advancement: { criteria: { tick: { trigger: 'minecraft:tick' } } },
    }),
    createPredicateResourceArtifact({
      ...common,
      id: 'p9:typed_predicate',
      predicate: {
        kind: 'leaf',
        condition: 'minecraft:random_chance',
        fields: { chance: 1 },
      },
    }),
    createLootTableResourceArtifact({
      ...common,
      id: 'p9:typed_loot',
      lootTable: {
        type: 'minecraft:chest',
        pools: [{ rolls: 1, entries: [{ kind: 'item', name: 'minecraft:apple' }] }],
      },
    }),
    createItemModifierResourceArtifact({
      ...common,
      id: 'p9:typed_modifier',
      modifier: { function: 'minecraft:set_count', fields: { count: 2 } },
    }),
  ]
}

function compilePackGraph(projectRoot: string, phase: 1 | 2, channel: P9VersionChannel): DatapackArtifactGraph {
  writeProjectPhase(projectRoot, phase, channel)
  const project = loadProject(projectRoot)
  if (!project) throw new Error(`P9 project did not load from '${projectRoot}'`)
  const target = project.targets.pack
  const result = createCompilerSession({ project, target }).compileProject()
  if (result.kind !== 'datapack') throw new Error('P9 pack target did not produce a datapack graph')
  return createDatapackArtifactGraph([...result.artifacts, ...typedArtifacts(channel)], {
    minecraftVersion: channel.mcVersion,
    localNamespaces: ['p9'],
  })
}

function compileCommandProgram(projectRoot: string): CommandProgram {
  const project = loadProject(projectRoot)
  if (!project) throw new Error(`P9 project did not load from '${projectRoot}'`)
  const target = project.targets.commands
  const result = createCompilerSession({ project, target }).compileProject()
  if (result.kind !== 'commands') throw new Error('P9 commands target did not produce a command program')
  return result.commandProgram
}

async function command(mc: MCTestClient, value: string): Promise<void> {
  const response = await mc.command(value)
  if (!response.ok) throw new Error(`Harness rejected command '${value}'`)
}

async function setScore(mc: MCTestClient, player: string, value: number): Promise<void> {
  await command(mc, `scoreboard players set ${player} ${OBJECTIVE} ${value}`)
}

async function expectScore(mc: MCTestClient, player: string, expected: number): Promise<void> {
  const actual = await mc.scoreboard(player, OBJECTIVE)
  if (actual !== expected) throw new Error(`${player}/${OBJECTIVE}: expected ${expected}, got ${actual}`)
}

async function assertRuntimePhase(mc: MCTestClient, phase: 1 | 2): Promise<void> {
  const block = phase === 1 ? 'minecraft:gold_block' : 'minecraft:diamond_block'
  await command(mc, `function p9:pack/main`)
  await expectScore(mc, '#datapack', phase * 10)

  await setScore(mc, '#typed_predicate', 0)
  await command(mc, `execute if predicate p9:typed_predicate run scoreboard players set #typed_predicate ${OBJECTIVE} 1`)
  await expectScore(mc, '#typed_predicate', 1)

  await setScore(mc, '#from_file_predicate', 0)
  await command(mc, `execute if predicate p9:from_file_probe run scoreboard players set #from_file_predicate ${OBJECTIVE} 1`)
  await expectScore(mc, '#from_file_predicate', phase === 1 ? 0 : 1)

  await command(mc, `setblock 0 64 0 ${block}`)
  await setScore(mc, '#typed_tag', 0)
  await command(mc, `execute if block 0 64 0 #p9:probe_blocks run scoreboard players set #typed_tag ${OBJECTIVE} 1`)
  await expectScore(mc, '#typed_tag', 1)

  await command(mc, 'setblock 1 64 0 minecraft:air')
  await command(mc, 'place template p9:probe 1 64 0')
  await mc.assertBlock(1, 64, 0, block)

  await command(mc, 'setblock 4 64 0 minecraft:chest')
  await setScore(mc, '#loot', 0)
  await command(mc, `execute store success score #loot ${OBJECTIVE} run loot insert 4 64 0 loot p9:typed_loot`)
  await expectScore(mc, '#loot', 1)
  await setScore(mc, '#modifier', 0)
  await command(mc, `execute store success score #modifier ${OBJECTIVE} run item modify block 4 64 0 container.0 p9:typed_modifier`)
  await expectScore(mc, '#modifier', 1)
}

function commandSteps(program: CommandProgram): CommandStep[] {
  return [...program.phases.setup, ...program.phases.invoke, ...program.phases.cleanup]
}

async function executeCommandProgram(mc: MCTestClient, program: CommandProgram): Promise<void> {
  for (const step of commandSteps(program)) await command(mc, step.command)
}

async function recordCheck(
  report: P9LifecycleReport,
  phase: P9EvidencePhase,
  name: string,
  detail: string,
  action: () => Promise<void> | void,
): Promise<void> {
  try {
    await action()
    report.checks.push({ phase, name, status: 'passed', detail })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    report.checks.push({ phase, name, status: 'failed', detail: `${detail}: ${message}` })
    throw error
  }
}

function assertCleanLog(log: string, fromOffset = 0): void {
  const failures = findMinecraftLifecycleFailures(log, fromOffset)
  if (failures.length > 0) throw new Error(`Minecraft log contains load failures:\n${failures.join('\n')}`)
}

function writeReport(outputPath: string, report: P9LifecycleReport): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 })
}

export async function runP9LifecycleGate(options: {
  templateDir?: string
  outputPath?: string
  requireOnline?: boolean
  keepServer?: boolean
  versionChannel?: string
} = {}): Promise<P9LifecycleReport> {
  const requestedVersionChannel = options.versionChannel ?? process.env.MC_P9_VERSION_CHANNEL ?? 'stable-1.21.4'
  let channel: P9VersionChannel
  try {
    channel = resolveP9VersionChannel(requestedVersionChannel)
  } catch (error) {
    const outputPath = path.resolve(
      process.cwd(),
      'build',
      'p9-live-report-invalid-channel.json',
    )
    const message = error instanceof Error ? error.message : String(error)
    const now = new Date().toISOString()
    const failedReport: P9LifecycleReport = {
      schemaVersion: 1,
      status: 'failed',
      startedAt: now,
      completedAt: now,
      versionChannel: requestedVersionChannel,
      minecraftVersion: 'unknown',
      checks: [{ phase: 'startup', name: 'configuration', status: 'failed', detail: message }],
      error: message,
    }
    writeReport(outputPath, failedReport)
    return failedReport
  }
  const templateDir = path.resolve(
    options.templateDir
      ?? process.env.MC_P9_TEMPLATE_DIR
      ?? process.env.MC_SERVER_DIR
      ?? path.join(os.homedir(), channel.defaultTemplateName),
  )
  const outputPath = path.resolve(options.outputPath ?? process.env.MC_P9_REPORT ?? path.join(
    process.cwd(),
    'build',
    channel.id === 'stable-1.21.4' ? 'p9-live-report.json' : 'p9-live-report-26.2.json',
  ))
  const requireOnline = options.requireOnline ?? process.env.MC_P9_REQUIRE_ONLINE === 'true'
  const keepServer = options.keepServer ?? process.env.MC_P9_KEEP_SERVER === 'true'
  const report: P9LifecycleReport = {
    schemaVersion: 1,
    status: 'failed',
    startedAt: new Date().toISOString(),
    versionChannel: channel.id,
    minecraftVersion: channel.minecraftVersion,
    checks: [],
  }

  let managed: ManagedPaperServer | undefined
  let serverRoot: string | undefined
  let projectRoot: string | undefined
  try {
    if (!fs.existsSync(templateDir)) throw new P9SkipError(`Paper template directory '${templateDir}' does not exist`)
    const busyClient = new MCTestClient(HARNESS_HOST, HARNESS_PORT)
    if (await busyClient.isOnline()) {
      throw new P9SkipError(`TestHarness port ${HARNESS_PORT} is already serving another process`)
    }
    const paperJar = path.join(templateDir, 'paper.jar')
    const harnessPlugin = findHarnessPlugin(templateDir)
    const java = findJava()
    serverRoot = prepareServerRoot(templateDir, harnessPlugin, { serverPort: SERVER_PORT })
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-p9-project-'))

    const phase1 = compilePackGraph(projectRoot, 1, channel)
    const phase1Partition = partitionArtifactsByLifecycle(phase1.artifacts)
    const packDir = path.join(serverRoot, 'world', 'datapacks', PACK_NAME)
    writeArtifactDirectoryAtomically(phase1, packDir)
    const program = compileCommandProgram(projectRoot)

    const mc = new MCTestClient(HARNESS_HOST, HARNESS_PORT)
    managed = new ManagedPaperServer(serverRoot, java.executable, mc, { sourceTemplateDir: templateDir })
    const first = await managed.start()
    await recordCheck(report, 'startup', 'deterministic-world-fixture', 'air-only void + fixed rules + y=63 smooth-stone floor', async () => {
      await mc.deterministicReset({
        x1: -16, y1: 0, z1: -16, x2: 16, y2: 100, z2: 16,
        minecraftVersion: channel.minecraftVersion,
      })
      await mc.assertBlock(0, 0, 0, 'minecraft:air')
      await mc.assertBlock(0, 63, 0, 'minecraft:smooth_stone')
      await mc.assertBlock(0, 64, 0, 'minecraft:air')
    })
    await command(mc, `scoreboard objectives add ${OBJECTIVE} dummy`)

    await recordCheck(report, 'startup', 'exact-version', first.status.version, () => {
      if (!first.status.version.includes(channel.minecraftVersion)) {
        throw new Error(`expected Minecraft ${channel.minecraftVersion}, got '${first.status.version}'`)
      }
    })
    await recordCheck(report, 'startup', 'clean-pack-load', 'no ERROR/FATAL datapack load entries', () => {
      assertCleanLog(managed!.readLatestLog())
    })
    await recordCheck(report, 'startup', 'mixed-artifact-runtime', 'source typed tag + from-file predicate/NBT + five package builders', () => assertRuntimePhase(mc, 1))

    const phase2 = compilePackGraph(projectRoot, 2, channel)
    const phase2Partition = partitionArtifactsByLifecycle(phase2.artifacts)
    const reloadBaseline = managed.readLatestLog().length
    writeArtifactDirectoryAtomically(phase2, packDir)
    await mc.reload()
    await recordCheck(report, 'reload', 'clean-reload', 'phase-2 graph loaded without resource errors', () => {
      assertCleanLog(managed!.readLatestLog(), reloadBaseline)
    })
    await recordCheck(report, 'reload', 'mixed-artifact-mutation', 'function/tag/predicate/structure changed without restart', () => assertRuntimePhase(mc, 2))
    await recordCheck(report, 'reload', 'world-reopen-registry-not-visible', 'new dimension must not become visible through /reload', async () => {
      await setScore(mc, '#dimension', 0)
      await command(mc, `execute in p9:after_restart run scoreboard players set #dimension ${OBJECTIVE} 1`)
      await expectScore(mc, '#dimension', 0)
    })

    await recordCheck(report, 'commands', 'canonical-sequence', 'execute setup, invoke, cleanup in manifest order', async () => {
      await executeCommandProgram(mc, program)
      await expectScore(mc, '#canonical', 42)
    })

    await setScore(mc, '#persistent', 31)
    await managed.stop()
    const restart = await managed.start()
    await recordCheck(report, 'restart', 'new-server-process', `pid ${first.pid} -> ${restart.pid}`, () => {
      if (first.pid === restart.pid) throw new Error('Paper restart reused the same process id')
    })
    await recordCheck(report, 'restart', 'clean-restart-load', 'same world and phase-2 pack load without errors', () => {
      assertCleanLog(managed!.readLatestLog())
    })
    await recordCheck(report, 'restart', 'world-state-persistence', 'scoreboard state survived graceful stop/start', () => expectScore(mc, '#persistent', 31))
    await recordCheck(report, 'restart', 'phase-2-runtime', 'phase-2 functions/resources remain executable after restart', () => assertRuntimePhase(mc, 2))
    await recordCheck(report, 'world_reopen', 'dimension-registry-visible', 'phase-2 dimension becomes executable only after world reopen', async () => {
      await setScore(mc, '#dimension', 0)
      await command(mc, `execute in p9:after_restart run scoreboard players set #dimension ${OBJECTIVE} 1`)
      await expectScore(mc, '#dimension', 1)
    })

    const serializedCommands = JSON.stringify(program)
    report.graph = {
      phase1ArtifactCount: phase1.artifacts.length,
      phase2ArtifactCount: phase2.artifacts.length,
      phase1: phase1Partition,
      phase2: phase2Partition,
    }
    report.commands = {
      setup: program.phases.setup.length,
      invoke: program.phases.invoke.length,
      cleanup: program.phases.cleanup.length,
      sha256: sha256Text(serializedCommands),
    }
    report.server = {
      version: restart.status.version,
      paperSha256: sha256File(paperJar),
      harnessSha256: sha256File(harnessPlugin),
      java: java.version,
      firstPid: first.pid,
      restartPid: restart.pid,
    }
    report.status = 'passed'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof P9SkipError && !requireOnline) {
      report.status = 'skipped'
      report.checks.push({ phase: 'startup', name: 'environment', status: 'skipped', detail: message })
    } else {
      report.status = 'failed'
      report.error = message
      if (error instanceof P9SkipError) {
        report.checks.push({ phase: 'startup', name: 'environment', status: 'failed', detail: message })
      } else {
        report.checks.push({ phase: 'startup', name: 'lifecycle-gate', status: 'failed', detail: message })
      }
    }
  } finally {
    const cleanupErrors: string[] = []
    if (managed) {
      const cleanup = await managed.cleanup({ removeRoot: !keepServer })
      for (const failure of cleanup.failures) cleanupErrors.push(`${failure.stage}: ${failure.message}`)
    } else if (serverRoot && !keepServer) {
      try {
        fs.rmSync(serverRoot, { recursive: true, force: true })
      } catch (error) {
        cleanupErrors.push(`server root: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (projectRoot) {
      try {
        fs.rmSync(projectRoot, { recursive: true, force: true })
      } catch (error) {
        cleanupErrors.push(`project root: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (cleanupErrors.length > 0) {
      const detail = cleanupErrors.join('; ')
      report.status = 'failed'
      report.error = report.error ? `${report.error}; cleanup: ${detail}` : `cleanup: ${detail}`
      report.checks.push({ phase: 'restart', name: 'cleanup', status: 'failed', detail })
    }
    report.completedAt = new Date().toISOString()
    writeReport(outputPath, report)
  }
  return report
}

async function main(): Promise<void> {
  const report = await runP9LifecycleGate()
  const label = report.status === 'passed' ? 'PASS' : report.status === 'skipped' ? 'SKIP' : 'FAIL'
  console.log(`[${label}] P9 live Minecraft lifecycle gate (${report.versionChannel}): ${report.checks.filter(check => check.status === 'passed').length} passed, ${report.checks.filter(check => check.status === 'failed').length} failed, ${report.checks.filter(check => check.status === 'skipped').length} skipped`)
  if (report.error) console.error(report.error)
  if (report.status === 'failed') process.exitCode = 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
}
