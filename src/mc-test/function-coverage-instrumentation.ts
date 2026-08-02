import { createHash } from 'crypto'

import type { DatapackFile } from '../emit/index'

export const FUNCTION_COVERAGE_OBJECTIVE = '__rs_fn_cov'

export interface FunctionCoverageProbe {
  readonly artifactPath: string
  readonly resourceLocation: string
  readonly marker: string
}

export interface InstrumentedFunctionArtifacts {
  readonly files: DatapackFile[]
  readonly probes: FunctionCoverageProbe[]
}

export interface FunctionCoverageObservation extends FunctionCoverageProbe {
  readonly observed: number
  readonly executed: boolean
}

function bytewiseCompare(left: string, right: string): number {
  return Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'))
}

function resourceLocationFor(path: string): string | null {
  const match = /^data\/([a-z0-9_.-]+)\/function\/(.+)\.mcfunction$/.exec(path)
  if (match == null) return null
  return `${match[1]}:${match[2]}`
}

/**
 * Return a copy of compiler-projected files with test-only probes prepended to
 * every emitted function artifact. The caller's files and production compile
 * path remain untouched.
 */
export function instrumentFunctionArtifacts(
  inputFiles: readonly DatapackFile[],
): InstrumentedFunctionArtifacts {
  const seen = new Set<string>()
  const probes: FunctionCoverageProbe[] = []
  const files = inputFiles.map(file => {
    if (seen.has(file.path)) throw new Error(`duplicate artifact path '${file.path}'`)
    seen.add(file.path)
    const resourceLocation = resourceLocationFor(file.path)
    if (resourceLocation == null) return { ...file }

    const digest = createHash('sha256')
      .update(file.path)
      .digest('hex')
      .slice(0, 16)
    const marker = `#fn_${digest}`
    probes.push({ artifactPath: file.path, resourceLocation, marker })
    return {
      ...file,
      content: `scoreboard players set ${marker} ${FUNCTION_COVERAGE_OBJECTIVE} 1\n${file.content}`,
    }
  })
  probes.sort((left, right) => bytewiseCompare(left.artifactPath, right.artifactPath))
  return { files, probes }
}

export async function observeFunctionCoverage(
  probes: readonly FunctionCoverageProbe[],
  scoreboard: (player: string, objective: string) => Promise<number>,
): Promise<FunctionCoverageObservation[]> {
  const observations: FunctionCoverageObservation[] = []
  for (const probe of probes) {
    const observed = await scoreboard(probe.marker, FUNCTION_COVERAGE_OBJECTIVE)
    observations.push({ ...probe, observed, executed: observed > 0 })
  }
  return observations
}
