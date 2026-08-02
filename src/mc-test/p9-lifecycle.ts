import type { DatapackArtifact } from '../artifacts/model'

export interface ArtifactLifecyclePartition {
  readonly build: readonly string[]
  readonly reload: readonly string[]
  readonly restart: readonly string[]
  readonly worldReopen: readonly string[]
}

/**
 * Partition the emitted graph by the lifecycle contract that a live oracle must exercise.
 * Paths are sorted so evidence is deterministic and directly diffable.
 */
export function partitionArtifactsByLifecycle(
  artifacts: readonly DatapackArtifact[],
): ArtifactLifecyclePartition {
  const groups: Record<'build' | 'reload' | 'restart' | 'worldReopen', string[]> = {
    build: [],
    reload: [],
    restart: [],
    worldReopen: [],
  }
  for (const artifact of artifacts) {
    const group = artifact.lifecycle === 'world_reopen' ? 'worldReopen' : artifact.lifecycle
    groups[group].push(artifact.outputPath)
  }
  for (const paths of Object.values(groups)) {
    paths.sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  }
  return Object.freeze({
    build: Object.freeze(groups.build),
    reload: Object.freeze(groups.reload),
    restart: Object.freeze(groups.restart),
    worldReopen: Object.freeze(groups.worldReopen),
  })
}

const MINECRAFT_FAILURE_LINE = /(?:\/(?:ERROR|FATAL)\]:|\bFailed to (?:load|parse)\b|\bCouldn't load\b|\bErrors? in currently selected data packs?\b)/i

/**
 * Return high-signal load failures from a lifecycle phase's own log segment.
 * Warnings such as Paper's explicit offline-mode banner are not failures.
 */
export function findMinecraftLifecycleFailures(log: string, fromOffset = 0): string[] {
  if (!Number.isInteger(fromOffset) || fromOffset < 0 || fromOffset > log.length) {
    throw new RangeError(`Minecraft log offset ${fromOffset} is outside 0..${log.length}`)
  }
  return log
    .slice(fromOffset)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && MINECRAFT_FAILURE_LINE.test(line))
}
