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

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import type { DatapackFile } from '../emit/index'

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

export interface CaseAction {
  kind: 'function' | 'command'
  target: string
}

export interface McCoreCaseDescriptor {
  name: string
  namespace: string
  source?: string
  sourcePath?: string
  setupCommands?: string[]
  entrypoints?: CaseAction[]
  waitTicks?: number
  controlledTicks?: number
  scoreboardAssertions?: ScoreboardAssertion[]
  storageAssertions?: StorageAssertion[]
}

export type McCoreCaseStatus = 'passed' | 'failed' | 'skipped'

export interface McCoreCaseResult {
  name: string
  namespace: string
  status: McCoreCaseStatus
  reason?: string
  error?: string
}

export interface McCoreCaseHarness {
  isOnline(): Promise<boolean>
  command(cmd: string): Promise<unknown>
  reload(): Promise<void>
  ticks(count: number): Promise<void>
  scoreboard(player: string, obj: string): Promise<number>
  dumpStorage?(storage: string): Promise<{ raw: string; ok: boolean }>
  withTickControl?(callback: (step: (ticks: number) => Promise<void>) => Promise<void>): Promise<void>
}

export interface McCoreCaseRunnerOptions {
  client: McCoreCaseHarness
  datapackDir: string
  compileSource?: (source: string, namespace: string, filePath: string) => DatapackFile[]
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
): DatapackFile[] {
  const result = compile(source, { namespace, filePath })
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
    return `/function ${namespace}:${action.target}`
  }
  return normalizeCommand(action.target)
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
    compileSource = defaultCompileSource,
    installFiles = defaultInstallFiles,
  } = options

  try {
    const isOnline = await client.isOnline()
    if (!isOnline) {
      return buildSkipped(descriptor.name, descriptor.namespace, 'harness is offline')
    }

    const source = normalizeSourcePath(descriptor)
    const files = compileSource(source.text, descriptor.namespace, source.filePath)
    await installFiles(files, descriptor.namespace, datapackDir)
    await client.reload()

    for (const cmd of descriptor.setupCommands ?? []) {
      await client.command(normalizeCommand(cmd))
    }

    for (const action of descriptor.entrypoints ?? []) {
      await client.command(commandFromCaseAction(descriptor.namespace, action))
    }

    if (descriptor.controlledTicks != null && descriptor.controlledTicks > 0) {
      if (!client.withTickControl) {
        return buildFailure(
          descriptor.name,
          descriptor.namespace,
          new Error('controlled tick assertions are not supported by this harness client'),
        )
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
        return buildFailure(
          descriptor.name,
          descriptor.namespace,
          new Error('storage assertions are not supported by this harness client'),
        )
      }
      for (const assertion of descriptor.storageAssertions) {
        await assertStorageAssertion(client.dumpStorage, assertion)
      }
    }

    return {
      name: descriptor.name,
      namespace: descriptor.namespace,
      status: 'passed',
    }
  } catch (error) {
    if (error instanceof Error) {
      return buildFailure(descriptor.name, descriptor.namespace, error)
    }
    return {
      name: descriptor.name,
      namespace: descriptor.namespace,
      status: 'failed',
      error: String(error),
    }
  }
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
