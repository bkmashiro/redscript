import * as fs from 'fs'
import * as path from 'path'

const CASE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/
const PACK_PREFIX = 'redscript-corpus-'
const OWNERSHIP_MARKER = '.redscript-corpus-owner.json'

export interface CorpusArtifactFile {
  readonly path: string
  readonly content: string | Buffer
}

export interface DeployedCorpusPack {
  readonly caseId: string
  readonly root: string
  readonly artifactCount: number
}

function assertCaseId(caseId: string): void {
  if (!CASE_ID_PATTERN.test(caseId)) {
    throw new Error(`Invalid runtime corpus case id '${caseId}'`)
  }
}

function normalizeArtifactPath(artifactPath: string): string {
  if (
    artifactPath.length === 0
    || artifactPath.includes('\\')
    || path.posix.isAbsolute(artifactPath)
  ) {
    throw new Error(`Invalid corpus artifact path '${artifactPath}'`)
  }

  const normalized = path.posix.normalize(artifactPath)
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized !== artifactPath
    || normalized.split('/').includes('..')
    || normalized === OWNERSHIP_MARKER
  ) {
    throw new Error(`Invalid corpus artifact path '${artifactPath}'`)
  }
  return normalized
}

export function resolveCorpusPackPath(serverRoot: string, caseId: string): string {
  assertCaseId(caseId)
  const resolvedServerRoot = path.resolve(serverRoot)
  return path.join(resolvedServerRoot, 'world', 'datapacks', `${PACK_PREFIX}${caseId}`)
}

export function deployCorpusPack(
  serverRoot: string,
  caseId: string,
  files: readonly CorpusArtifactFile[],
): DeployedCorpusPack {
  const finalRoot = resolveCorpusPackPath(serverRoot, caseId)
  const normalizedFiles = files.map(file => ({
    path: normalizeArtifactPath(file.path),
    content: file.content,
  }))
  const uniquePaths = new Set(normalizedFiles.map(file => file.path))
  if (uniquePaths.size !== normalizedFiles.length) {
    throw new Error(`Runtime corpus case '${caseId}' has a duplicate artifact path`)
  }
  if (fs.existsSync(finalRoot)) {
    throw new Error(`Runtime corpus pack root already exists for '${caseId}': ${finalRoot}`)
  }

  const datapacksRoot = path.dirname(finalRoot)
  fs.mkdirSync(datapacksRoot, { recursive: true })
  const temporaryRoot = fs.mkdtempSync(path.join(datapacksRoot, `.${PACK_PREFIX}`))

  try {
    fs.writeFileSync(path.join(temporaryRoot, OWNERSHIP_MARKER), `${JSON.stringify({
      schemaVersion: 1,
      caseId,
    })}\n`)
    for (const file of normalizedFiles) {
      const target = path.join(temporaryRoot, ...file.path.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, file.content)
    }
    fs.renameSync(temporaryRoot, finalRoot)
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
    throw error
  }

  return Object.freeze({ caseId, root: finalRoot, artifactCount: normalizedFiles.length })
}

export function ensureCorpusPackWorkspace(
  serverRoot: string,
  caseId: string,
): DeployedCorpusPack {
  const packRoot = resolveCorpusPackPath(serverRoot, caseId)
  if (!fs.existsSync(packRoot)) {
    return deployCorpusPack(serverRoot, caseId, [])
  }

  const markerPath = path.join(packRoot, OWNERSHIP_MARKER)
  let marker: unknown
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch {
    throw new Error(`Runtime corpus pack is missing a valid ownership marker: ${packRoot}`)
  }
  if (
    typeof marker !== 'object'
    || marker === null
    || (marker as { schemaVersion?: unknown }).schemaVersion !== 1
    || (marker as { caseId?: unknown }).caseId !== caseId
  ) {
    throw new Error(`Runtime corpus pack ownership marker does not match '${caseId}'`)
  }

  return Object.freeze({ caseId, root: packRoot, artifactCount: 0 })
}

export function removeCorpusPack(packRoot: string, expectedCaseId: string): void {
  assertCaseId(expectedCaseId)
  const resolvedRoot = path.resolve(packRoot)
  if (
    !path.basename(resolvedRoot).startsWith(PACK_PREFIX)
    || path.basename(path.dirname(resolvedRoot)) !== 'datapacks'
    || path.basename(path.dirname(path.dirname(resolvedRoot))) !== 'world'
  ) {
    throw new Error(`Refusing to remove non-corpus pack root '${packRoot}'`)
  }

  const markerPath = path.join(resolvedRoot, OWNERSHIP_MARKER)
  let marker: unknown
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch {
    throw new Error(`Runtime corpus pack is missing a valid ownership marker: ${resolvedRoot}`)
  }

  if (
    typeof marker !== 'object'
    || marker === null
    || (marker as { schemaVersion?: unknown }).schemaVersion !== 1
    || (marker as { caseId?: unknown }).caseId !== expectedCaseId
    || path.basename(resolvedRoot) !== `${PACK_PREFIX}${expectedCaseId}`
  ) {
    throw new Error(`Runtime corpus pack ownership marker does not match '${expectedCaseId}'`)
  }

  fs.rmSync(resolvedRoot, { recursive: true })
}
