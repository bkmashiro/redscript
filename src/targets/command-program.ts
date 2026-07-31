export const COMMAND_MANIFEST_SCHEMA_VERSION = 1 as const

export type CommandPhase = 'setup' | 'invoke' | 'cleanup'
export type CommandEffect = 'none' | 'state-read' | 'state-write' | 'state-read-write' | 'opaque'

export interface CommandSource {
  readonly file?: string
  readonly line: number
  readonly col: number
}

export interface CommandStep {
  readonly command: string
  readonly source?: CommandSource
  readonly expansionTrace: readonly string[]
  readonly effect: CommandEffect
  readonly generated?: boolean
}

export interface CommandProgramTarget {
  readonly name: string
  readonly kind: 'commands'
  readonly namespace: string
  readonly entry: string
  readonly minecraftVersion: string
  readonly commandBudget: number
  readonly validationProfile: string
}

export interface CommandProgram {
  readonly schemaVersion: typeof COMMAND_MANIFEST_SCHEMA_VERSION
  readonly target: CommandProgramTarget
  readonly commandCount: number
  readonly phases: {
    readonly setup: readonly CommandStep[]
    readonly invoke: readonly CommandStep[]
    readonly cleanup: readonly CommandStep[]
  }
}

export function createCommandProgram(
  target: CommandProgramTarget,
  phases: CommandProgram['phases'],
): CommandProgram {
  const commandCount = phases.setup.length + phases.invoke.length + phases.cleanup.length
  return deepFreeze({
    schemaVersion: COMMAND_MANIFEST_SCHEMA_VERSION,
    target,
    commandCount,
    phases,
  })
}

export function serializeCommandManifest(program: CommandProgram): string {
  return `${JSON.stringify(program, null, 2)}\n`
}

export function renderCommandProgramText(program: CommandProgram): string {
  const lines = [
    `# RedScript command manifest v${program.schemaVersion}`,
    `# target: ${program.target.name}`,
    `# entry: ${program.target.entry}`,
    `# minecraft: ${program.target.minecraftVersion}`,
    `# command budget: ${program.target.commandBudget}`,
    `# validation: ${program.target.validationProfile}`,
  ]

  for (const phase of ['setup', 'invoke', 'cleanup'] as const) {
    lines.push('', `# phase: ${phase}`)
    for (const step of program.phases[phase]) {
      if (step.source?.file) {
        lines.push(`# source: ${step.source.file}:${step.source.line}:${step.source.col}`)
      }
      if (step.expansionTrace.length > 1) {
        lines.push(`# expansion: ${step.expansionTrace.join(' -> ')}`)
      }
      lines.push(step.command)
    }
  }

  return `${lines.join('\n')}\n`
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value as object)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key])
  }
  return Object.freeze(value)
}
