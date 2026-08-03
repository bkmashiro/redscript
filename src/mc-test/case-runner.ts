/**
 * Descriptor-driven MC core oracle runner
 *
 * Designed for Paper/TestHarnessPlugin integration:
 * - compile RedScript source (string or file path)
 * - install compiled datapack files into a datapack directory
 * - reload
 * - run setup + case entrypoints
 * - assert scoreboard/storage state
 *
 * This runner is intentionally small and offline-safe:
 * when the harness is unavailable it returns an explicit skipped result
 * instead of treating that as a semantic pass.
 */

import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import type { DatapackFile } from '../emit/index'
import {
  FUNCTION_COVERAGE_OBJECTIVE,
  instrumentFunctionArtifacts,
  observeFunctionCoverage,
  type FunctionCoverageObservation,
} from './function-coverage-instrumentation'
import {
  deployCorpusPack,
  removeCorpusPack,
  type DeployedCorpusPack,
} from './corpus-deployer'

export interface ScoreboardAssertion {
  player: string
  obj: string
  value: number
  op?: 'eq' | 'gte' | 'lte'
  message?: string
}

export interface StorageAssertion {
  storage: string
  expected: string
  match?: 'equals' | 'contains'
  message?: string
}

export interface BlockAssertion {
  x: number
  y: number
  z: number
  expected: string
  world?: string
  message?: string
}

export interface CaseAction {
  kind: 'function' | 'command'
  target: string
  /** Optional macro argument storage passed as `with storage <resource>`. */
  withStorage?: string
  /** Entity selector used to establish the function's `@s` ABI. */
  executeAs?: string
}

export interface McCoreCaseDescriptor {
  /** Stable machine-readable ID required by the isolated corpus path. */
  id?: string
  name: string
  /** Stable semantic feature IDs proven by this case's assertions. */
  featureIds?: readonly string[]
  namespace: string
  source?: string
  sourcePath?: string
  /** Canonical stdlib/library sources compiled through the normal compiler path. */
  librarySourcePaths?: readonly string[]
  setupCommands?: string[]
  entrypoints?: CaseAction[]
  waitTicks?: number
  controlledTicks?: number
  scoreboardAssertions?: ScoreboardAssertion[]
  storageAssertions?: StorageAssertion[]
  blockAssertions?: BlockAssertion[]
}

export type McCoreCaseStatus = 'passed' | 'failed' | 'skipped'

export interface McCoreCaseResult {
  name: string
  namespace: string
  status: McCoreCaseStatus
  reason?: string
  error?: string
  entrypointReceipts?: EntrypointReceipt[]
  functionCoverage?: FunctionCoverageObservation[]
}

export interface EntrypointReceipt {
  readonly target: string
  readonly wrapper: string
  readonly marker: string
  readonly observed: number
  readonly status: 'completed' | 'incomplete'
}

interface EntrypointReceiptPlan {
  readonly actionIndex: number
  readonly target: string
  readonly wrapper: string
  readonly marker: string
  readonly file: DatapackFile
}

export interface McCoreCaseHarness {
  isOnline(): Promise<boolean>
  command(cmd: string): Promise<unknown>
  reload(): Promise<void>
  ticks(count: number): Promise<void>
  scoreboard(player: string, obj: string): Promise<number>
  dumpStorage?(storage: string): Promise<{ raw: string; ok: boolean }>
  block?(x: number, y: number, z: number, world?: string): Promise<{ type: string }>
  withTickControl?(callback: (step: (ticks: number) => Promise<void>) => Promise<void>): Promise<void>
}

export interface McCoreCaseRunnerOptions {
  client: McCoreCaseHarness
  /** Legacy shared-pack path. New strict corpus runs must use serverRoot. */
  datapackDir?: string
  /** Disposable Paper root used to derive one owned pack per descriptor. */
  serverRoot?: string
  /** Test-only emitted-function probes; never enabled by the production compiler path. */
  instrumentFunctionCoverage?: boolean
  compileSource?: (
    source: string,
    namespace: string,
    filePath: string,
    descriptor: McCoreCaseDescriptor,
  ) => DatapackFile[]
  installFiles?: (
    files: DatapackFile[],
    namespace: string,
    datapackDir: string,
  ) => Promise<void> | void
}

function defaultCompileSource(
  source: string,
  namespace: string,
  filePath: string,
  descriptor: McCoreCaseDescriptor,
): DatapackFile[] {
  const librarySources = (descriptor.librarySourcePaths ?? []).map(libraryPath =>
    fs.readFileSync(path.resolve(libraryPath), 'utf8'))
  const result = compile(source, { namespace, filePath, librarySources })
  return result.files ?? []
}

function normalizeSourcePath(descriptor: McCoreCaseDescriptor): { text: string; filePath: string } {
  if (descriptor.source != null && descriptor.source.trim() !== '') {
    return {
      text: descriptor.source,
      filePath: path.join(process.cwd(), `${descriptor.namespace}.mcrs`),
    }
  }

  if (descriptor.sourcePath == null || descriptor.sourcePath.trim() === '') {
    throw new Error(`Case "${descriptor.name}" is missing source/sourcePath`)
  }

  const sourcePath = path.resolve(descriptor.sourcePath)
  return {
    text: fs.readFileSync(sourcePath, 'utf-8'),
    filePath: sourcePath,
  }
}

function normalizeCommand(command: string): string {
  const trimmed = command.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function commandFromCaseAction(namespace: string, action: CaseAction): string {
  if (action.kind === 'function') {
    const withStorage = action.withStorage == null ? '' : ` with storage ${action.withStorage}`
    const invocation = `function ${namespace}:${action.target}${withStorage}`
    return action.executeAs == null
      ? `/${invocation}`
      : `/execute as ${action.executeAs} at @s run ${invocation}`
  }
  return normalizeCommand(action.target)
}

const ENTRYPOINT_RECEIPT_OBJECTIVE = '__rs_entry'

function createEntrypointReceiptPlans(
  descriptor: McCoreCaseDescriptor,
): EntrypointReceiptPlan[] {
  if (descriptor.id == null) return []
  const plans: EntrypointReceiptPlan[] = []
  for (const [actionIndex, action] of (descriptor.entrypoints ?? []).entries()) {
    if (action.kind !== 'function') continue
    const digest = createHash('sha256')
      .update(`${descriptor.id}\0${actionIndex}\0${descriptor.namespace}:${action.target}`)
      .digest('hex')
      .slice(0, 16)
    const marker = `#entry_${digest}`
    const wrapperPath = `__redscript_receipt/${digest}`
    const target = `${descriptor.namespace}:${action.target}`
    const withStorage = action.withStorage == null ? '' : ` with storage ${action.withStorage}`
    const functionInvocation = `function ${target}${withStorage}`
    const invocation = action.executeAs == null
      ? functionInvocation
      : `execute as ${action.executeAs} at @s run ${functionInvocation}`
    plans.push({
      actionIndex,
      target,
      wrapper: `${descriptor.namespace}:${wrapperPath}`,
      marker,
      file: {
        path: `data/${descriptor.namespace}/function/${wrapperPath}.mcfunction`,
        content: [
          `scoreboard players set ${marker} ${ENTRYPOINT_RECEIPT_OBJECTIVE} 1`,
          invocation,
          `scoreboard players set ${marker} ${ENTRYPOINT_RECEIPT_OBJECTIVE} 2`,
          '',
        ].join('\n'),
      },
    })
  }
  return plans
}

function buildFailure(name: string, namespace: string, error: Error): McCoreCaseResult {
  return {
    name,
    namespace,
    status: 'failed',
    error: error.message,
  }
}

function buildSkipped(name: string, namespace: string, reason: string): McCoreCaseResult {
  return {
    name,
    namespace,
    status: 'skipped',
    reason,
  }
}

function mergeAndWriteIfTagFile(filePath: string, content: string): void {
  if (!filePath.includes('data/minecraft/tags/') || !fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf-8')
    return
  }

  const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const incoming = JSON.parse(content)
  const merged = {
    values: [...new Set([...(existing.values ?? []), ...(incoming.values ?? [])])],
  }
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8')
}

function defaultInstallFiles(
  files: DatapackFile[],
  _namespace: string,
  datapackDir: string,
): void {
  fs.mkdirSync(datapackDir, { recursive: true })
  for (const file of files) {
    const targetPath = path.join(datapackDir, file.path)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    mergeAndWriteIfTagFile(targetPath, file.content)
  }
}

function assertScoreAssertion(
  scoreboard: (player: string, obj: string) => Promise<number>,
  assertion: ScoreboardAssertion,
): Promise<void> {
  return scoreboard(assertion.player, assertion.obj).then(actual => {
    const op = assertion.op ?? 'eq'
    const ok = op === 'gte'
      ? actual >= assertion.value
      : op === 'lte'
        ? actual <= assertion.value
        : actual === assertion.value

    if (!ok) {
      const expectation = op === 'eq' ? `${assertion.value}` : `${op} ${assertion.value}`
      throw new Error(
        assertion.message ??
          `scoreboard assertion failed: ${assertion.player}/${assertion.obj}: expected ${expectation}, got ${actual}`,
      )
    }
  })
}

function assertStorageAssertion(
  dumpStorage: (storage: string) => Promise<{ raw: string; ok: boolean }>,
  assertion: StorageAssertion,
): Promise<void> {
  return dumpStorage(assertion.storage).then(({ raw }) => {
    const mode = assertion.match ?? 'equals'
    const matches = mode === 'contains'
      ? raw.includes(assertion.expected)
      : raw === assertion.expected

    if (!matches) {
      const label = mode === 'contains' ? 'contains' : 'equals'
      throw new Error(
        assertion.message ??
          `storage assertion failed: ${assertion.storage} expected ${label} "${assertion.expected}"`,
      )
    }
  })
}

function assertBlockAssertion(
  block: (x: number, y: number, z: number, world?: string) => Promise<{ type: string }>,
  assertion: BlockAssertion,
): Promise<void> {
  return block(assertion.x, assertion.y, assertion.z, assertion.world).then(({ type }) => {
    if (type !== assertion.expected) {
      throw new Error(
        assertion.message ??
          `block assertion failed: (${assertion.x},${assertion.y},${assertion.z}) expected ${assertion.expected}, got ${type}`,
      )
    }
  })
}

/**
 * Run one descriptor case end-to-end.
 */
export async function runMcCoreCase(
  descriptor: McCoreCaseDescriptor,
  options: McCoreCaseRunnerOptions,
): Promise<McCoreCaseResult> {
  const {
    client,
    datapackDir,
    serverRoot,
    instrumentFunctionCoverage: shouldInstrumentFunctions = false,
    compileSource = defaultCompileSource,
    installFiles = defaultInstallFiles,
  } = options

  let isolatedPack: DeployedCorpusPack | undefined
  let result: McCoreCaseResult
  const entrypointReceipts: EntrypointReceipt[] = []
  let functionCoverage: FunctionCoverageObservation[] | undefined

  try {
    const isOnline = await client.isOnline()
    if (!isOnline) {
      return buildSkipped(descriptor.name, descriptor.namespace, 'harness is offline')
    }

    const source = normalizeSourcePath(descriptor)
    const compiledFiles = compileSource(source.text, descriptor.namespace, source.filePath, descriptor)
    const instrumentation = shouldInstrumentFunctions
      ? instrumentFunctionArtifacts(compiledFiles)
      : undefined
    if (instrumentation != null) {
      await client.command(`/scoreboard objectives add ${FUNCTION_COVERAGE_OBJECTIVE} dummy`)
      for (const probe of instrumentation.probes) {
        await client.command(`/scoreboard players set ${probe.marker} ${FUNCTION_COVERAGE_OBJECTIVE} 0`)
      }
    }
    const receiptPlans = serverRoot == null ? [] : createEntrypointReceiptPlans(descriptor)
    const files = [...(instrumentation?.files ?? compiledFiles), ...receiptPlans.map(plan => plan.file)]

    if (serverRoot != null) {
      if (descriptor.id == null) {
        throw new Error(`Case "${descriptor.name}" is missing stable id required for isolated deployment`)
      }
      if (options.installFiles != null) {
        throw new Error('isolated deployment does not accept a custom installFiles callback')
      }
      isolatedPack = deployCorpusPack(serverRoot, descriptor.id, files)
    } else {
      if (datapackDir == null) {
        throw new Error('case runner requires serverRoot or legacy datapackDir')
      }
      await installFiles(files, descriptor.namespace, datapackDir)
    }

    await client.reload()

    for (const cmd of descriptor.setupCommands ?? []) {
      await client.command(normalizeCommand(cmd))
    }

    if (receiptPlans.length > 0) {
      await client.command(`/scoreboard objectives add ${ENTRYPOINT_RECEIPT_OBJECTIVE} dummy`)
      for (const plan of receiptPlans) {
        await client.command(
          `/scoreboard players set ${plan.marker} ${ENTRYPOINT_RECEIPT_OBJECTIVE} 0`,
        )
      }
    }

    for (const [actionIndex, action] of (descriptor.entrypoints ?? []).entries()) {
      const receiptPlan = receiptPlans.find(plan => plan.actionIndex === actionIndex)
      await client.command(
        receiptPlan == null
          ? commandFromCaseAction(descriptor.namespace, action)
          : `/function ${receiptPlan.wrapper}`,
      )
      if (receiptPlan != null) {
        const observed = await client.scoreboard(
          receiptPlan.marker,
          ENTRYPOINT_RECEIPT_OBJECTIVE,
        )
        const receipt: EntrypointReceipt = {
          target: receiptPlan.target,
          wrapper: receiptPlan.wrapper,
          marker: receiptPlan.marker,
          observed,
          status: observed === 2 ? 'completed' : 'incomplete',
        }
        entrypointReceipts.push(receipt)
        if (observed !== 2) {
          throw new Error(
            `entrypoint receipt failed: ${receiptPlan.target} expected 2, got ${observed}`,
          )
        }
      }
    }

    if (descriptor.controlledTicks != null && descriptor.controlledTicks > 0) {
      if (!client.withTickControl) {
        throw new Error('controlled tick assertions are not supported by this harness client')
      }
      await client.withTickControl(async step => {
        await step(descriptor.controlledTicks!)
      })
    }

    if (descriptor.waitTicks != null && descriptor.waitTicks > 0) {
      await client.ticks(descriptor.waitTicks)
    }

    for (const assertion of descriptor.scoreboardAssertions ?? []) {
      await assertScoreAssertion((player, obj) => client.scoreboard(player, obj), assertion)
    }

    if (descriptor.storageAssertions && descriptor.storageAssertions.length > 0) {
      if (!client.dumpStorage) {
        throw new Error('storage assertions are not supported by this harness client')
      }
      for (const assertion of descriptor.storageAssertions) {
        await assertStorageAssertion(client.dumpStorage, assertion)
      }
    }

    if (descriptor.blockAssertions && descriptor.blockAssertions.length > 0) {
      if (!client.block) {
        throw new Error('block assertions are not supported by this harness client')
      }
      for (const assertion of descriptor.blockAssertions) {
        await assertBlockAssertion(
          (x, y, z, world) => client.block!(x, y, z, world),
          assertion,
        )
      }
    }

    if (instrumentation != null) {
      functionCoverage = await observeFunctionCoverage(
        instrumentation.probes,
        (player, objective) => client.scoreboard(player, objective),
      )
    }

    result = {
      name: descriptor.name,
      namespace: descriptor.namespace,
      status: 'passed',
      entrypointReceipts,
      functionCoverage,
    }
  } catch (error) {
    result = error instanceof Error
      ? buildFailure(descriptor.name, descriptor.namespace, error)
      : {
          name: descriptor.name,
          namespace: descriptor.namespace,
          status: 'failed',
          error: String(error),
        }
    result.entrypointReceipts = [...entrypointReceipts]
    result.functionCoverage = functionCoverage
  }

  if (isolatedPack != null) {
    try {
      removeCorpusPack(isolatedPack.root, isolatedPack.caseId)
      await client.reload()
    } catch (error) {
      const cleanupError = error instanceof Error ? error.message : String(error)
      result = buildFailure(
        descriptor.name,
        descriptor.namespace,
        new Error(
          result.status === 'failed'
            ? `${result.error}; isolated pack cleanup failed: ${cleanupError}`
            : `isolated pack cleanup failed: ${cleanupError}`,
        ),
      )
    }
  }

  return result
}

export async function runMcCoreCaseSuite(
  cases: McCoreCaseDescriptor[],
  options: McCoreCaseRunnerOptions,
): Promise<McCoreCaseResult[]> {
  const results: McCoreCaseResult[] = []
  for (const descriptor of cases) {
    results.push(await runMcCoreCase(descriptor, options))
  }
  return results
}
