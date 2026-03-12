import { compile } from '../../index'
import type { DatapackFile } from '../mcfunction'
import { nbt, TagType, writeNbt, type CompoundTag, type NbtTag } from '../../nbt'

const DATA_VERSION = 3953
const MAX_WIDTH = 16

const palette = [
  { Name: 'minecraft:command_block', Properties: { conditional: 'false', facing: 'east' } },
  { Name: 'minecraft:chain_command_block', Properties: { conditional: 'false', facing: 'east' } },
  { Name: 'minecraft:repeating_command_block', Properties: { conditional: 'false', facing: 'east' } },
  { Name: 'minecraft:air', Properties: {} },
]

interface CommandEntry {
  functionName: string
  lineNumber: number
  command: string
  state: number
  isRepeat: boolean
}

export interface StructureCompileResult {
  buffer: Buffer
  blockCount: number
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

function toFunctionName(file: DatapackFile): string | null {
  const match = file.path.match(/^data\/[^/]+\/function\/(.+)\.mcfunction$/)
  return match?.[1] ?? null
}

function collectCommandEntries(files: DatapackFile[]): CommandEntry[] {
  const entries: CommandEntry[] = []

  for (const file of files) {
    const functionName = toFunctionName(file)
    if (!functionName) continue

    const lines = file.content.split('\n')
    let isFirstCommand = true
    const isTickFunction = functionName === '__tick'

    for (let i = 0; i < lines.length; i++) {
      const command = lines[i].trim()
      if (command === '' || command.startsWith('#')) continue

      let state = 1
      let isRepeat = false

      if (isFirstCommand) {
        if (isTickFunction) {
          state = 2
          isRepeat = true
        } else {
          state = 0
        }
      }

      entries.push({
        functionName,
        lineNumber: i + 1,
        command,
        state,
        isRepeat,
      })

      isFirstCommand = false
    }
  }

  return entries
}

function createPaletteTag(): CompoundTag[] {
  return palette.map(entry =>
    nbt.compound({
      Name: nbt.string(entry.Name),
      Properties: nbt.compound(
        Object.fromEntries(
          Object.entries(entry.Properties).map(([key, value]) => [key, nbt.string(value)])
        )
      ),
    })
  )
}

function createBlockEntityTag(entry: CommandEntry): NbtTag {
  return nbt.compound({
    id: nbt.string('minecraft:command_block'),
    Command: nbt.string(entry.command),
    auto: nbt.byte(entry.isRepeat ? 1 : 0),
    powered: nbt.byte(0),
    conditionMet: nbt.byte(0),
    UpdateLastExecution: nbt.byte(1),
    LastExecution: nbt.long(0n),
    TrackOutput: nbt.byte(1),
    SuccessCount: nbt.int(0),
    LastOutput: nbt.string(''),
    CustomName: nbt.string(`{"text":"${escapeJsonString(`${entry.functionName}:${entry.lineNumber}`)}"}`),
  })
}

function createBlockTag(entry: CommandEntry, index: number): CompoundTag {
  const x = index % MAX_WIDTH
  const z = Math.floor(index / MAX_WIDTH) % MAX_WIDTH
  const y = Math.floor(index / (MAX_WIDTH * MAX_WIDTH))

  return nbt.compound({
    pos: nbt.list(TagType.Int, [nbt.int(x), nbt.int(y), nbt.int(z)]),
    state: nbt.int(entry.state),
    nbt: createBlockEntityTag(entry),
  })
}

export function generateStructure(files: DatapackFile[]): StructureCompileResult {
  const commands = collectCommandEntries(files)
  const blockTags = commands.map(createBlockTag)
  const sizeX = Math.max(1, Math.min(MAX_WIDTH, commands.length || 1))
  const sizeZ = Math.max(1, Math.min(MAX_WIDTH, Math.ceil(commands.length / MAX_WIDTH) || 1))
  const sizeY = Math.max(1, Math.ceil(commands.length / (MAX_WIDTH * MAX_WIDTH)) || 1)

  const root = nbt.compound({
    DataVersion: nbt.int(DATA_VERSION),
    size: nbt.list(TagType.Int, [nbt.int(sizeX), nbt.int(sizeY), nbt.int(sizeZ)]),
    palette: nbt.list(TagType.Compound, createPaletteTag()),
    blocks: nbt.list(TagType.Compound, blockTags),
    entities: nbt.list(TagType.Compound, []),
  })

  return {
    buffer: writeNbt(root, ''),
    blockCount: commands.length,
  }
}

export function compileToStructure(source: string, namespace: string, filePath?: string): StructureCompileResult {
  const result = compile(source, { namespace, filePath })
  return generateStructure(result.files)
}
