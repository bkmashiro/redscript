import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { Lowering } from '../../lowering'
import { nbt, TagType, writeNbt, type CompoundTag, type NbtTag } from '../../nbt'
import { createEmptyOptimizationStats, mergeOptimizationStats, type OptimizationStats } from '../../optimizer/commands'
import { optimizeWithStats } from '../../optimizer/passes'
import { optimizeForStructure, optimizeForStructureWithStats } from '../../optimizer/structure'
import { preprocessSource } from '../../compile'
import type { IRCommand, IRFunction, IRModule } from '../../ir/types'
import type { DatapackFile } from '../mcfunction'

const DATA_VERSION = 3953
const MAX_WIDTH = 16
const OBJ = 'rs'

const PALETTE_IMPULSE = 0
const PALETTE_CHAIN_UNCONDITIONAL = 1
const PALETTE_CHAIN_CONDITIONAL = 2
const PALETTE_REPEAT = 3

const palette = [
  { Name: 'minecraft:command_block', Properties: { conditional: 'false', facing: 'east' } },
  { Name: 'minecraft:chain_command_block', Properties: { conditional: 'false', facing: 'east' } },
  { Name: 'minecraft:chain_command_block', Properties: { conditional: 'true', facing: 'east' } },
  { Name: 'minecraft:repeating_command_block', Properties: { conditional: 'false', facing: 'east' } },
  { Name: 'minecraft:air', Properties: {} },
]

interface CommandEntry {
  functionName: string
  lineNumber: number
  command: string
  state: number
  conditional: boolean
  isRepeat: boolean
}

export interface StructureBlockInfo {
  command: string
  conditional: boolean
  state: number
  functionName: string
  lineNumber: number
}

export interface StructureCompileResult {
  buffer: Buffer
  blockCount: number
  blocks: StructureBlockInfo[]
  stats?: OptimizationStats
}

function escapeJsonString(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

function varRef(name: string): string {
  return name.startsWith('$') ? name : `$${name}`
}

function collectConsts(fn: IRFunction): Set<number> {
  const consts = new Set<number>()
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (instr.op === 'assign' && instr.src.kind === 'const') consts.add(instr.src.value)
      if (instr.op === 'binop') {
        if (instr.lhs.kind === 'const') consts.add(instr.lhs.value)
        if (instr.rhs.kind === 'const') consts.add(instr.rhs.value)
      }
      if (instr.op === 'cmp') {
        if (instr.lhs.kind === 'const') consts.add(instr.lhs.value)
        if (instr.rhs.kind === 'const') consts.add(instr.rhs.value)
      }
    }
    if (block.term.op === 'return' && block.term.value?.kind === 'const') {
      consts.add(block.term.value.value)
    }
  }
  return consts
}

function constSetup(value: number): string {
  return `scoreboard players set $const_${value} ${OBJ} ${value}`
}

function collectCommandEntriesFromModule(module: IRModule): CommandEntry[] {
  const entries: CommandEntry[] = []
  const triggerHandlers = module.functions.filter(fn => fn.isTriggerHandler && fn.triggerName)
  const triggerNames = new Set(triggerHandlers.map(fn => fn.triggerName!))
  const loadCommands = [
    `scoreboard objectives add ${OBJ} dummy`,
    ...module.globals.map(globalName => `scoreboard players set ${varRef(globalName)} ${OBJ} 0`),
    ...Array.from(triggerNames).flatMap(triggerName => [
      `scoreboard objectives add ${triggerName} trigger`,
      `scoreboard players enable @a ${triggerName}`,
    ]),
    ...Array.from(
      new Set(module.functions.flatMap(fn => Array.from(collectConsts(fn))))
    ).map(constSetup),
  ]

  const sections: Array<{ name: string; commands: IRCommand[]; repeat?: boolean }> = []

  if (loadCommands.length > 0) {
    sections.push({
      name: '__load',
      commands: loadCommands.map(cmd => ({ cmd })),
    })
  }

  for (const triggerName of triggerNames) {
    const handlers = triggerHandlers.filter(fn => fn.triggerName === triggerName)
    sections.push({
      name: `__trigger_${triggerName}_dispatch`,
      commands: [
        ...handlers.map(handler => ({ cmd: `function ${module.namespace}:${handler.name}` })),
        { cmd: `scoreboard players set @s ${triggerName} 0` },
        { cmd: `scoreboard players enable @s ${triggerName}` },
      ],
    })
  }

  for (const fn of module.functions) {
    if (!fn.commands || fn.commands.length === 0) continue
    sections.push({
      name: fn.name,
      commands: fn.commands,
    })
  }

  const tickCommands: IRCommand[] = []
  for (const fn of module.functions.filter(candidate => candidate.isTickLoop)) {
    tickCommands.push({ cmd: `function ${module.namespace}:${fn.name}` })
  }
  if (triggerNames.size > 0) {
    for (const triggerName of triggerNames) {
      tickCommands.push({
        cmd: `execute as @a[scores={${triggerName}=1..}] run function ${module.namespace}:__trigger_${triggerName}_dispatch`,
      })
    }
  }
  if (tickCommands.length > 0) {
    sections.push({
      name: '__tick',
      commands: tickCommands,
      repeat: true,
    })
  }

  for (const section of sections) {
    for (let i = 0; i < section.commands.length; i++) {
      const command = section.commands[i]
      const state =
        i === 0
          ? (section.repeat ? PALETTE_REPEAT : PALETTE_IMPULSE)
          : (command.conditional ? PALETTE_CHAIN_CONDITIONAL : PALETTE_CHAIN_UNCONDITIONAL)

      entries.push({
        functionName: section.name,
        lineNumber: i + 1,
        command: command.cmd,
        conditional: Boolean(command.conditional),
        state,
        isRepeat: Boolean(section.repeat && i === 0),
      })
    }
  }

  return entries
}

function toFunctionName(file: DatapackFile): string | null {
  const match = file.path.match(/^data\/[^/]+\/function\/(.+)\.mcfunction$/)
  return match?.[1] ?? null
}

function collectCommandEntriesFromFiles(files: DatapackFile[]): CommandEntry[] {
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

      const state = isFirstCommand
        ? (isTickFunction ? PALETTE_REPEAT : PALETTE_IMPULSE)
        : PALETTE_CHAIN_UNCONDITIONAL

      entries.push({
        functionName,
        lineNumber: i + 1,
        command,
        conditional: false,
        state,
        isRepeat: isTickFunction && isFirstCommand,
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

export function generateStructure(input: IRModule | DatapackFile[]): StructureCompileResult {
  const entries = Array.isArray(input)
    ? collectCommandEntriesFromFiles(input)
    : collectCommandEntriesFromModule(input)

  const blockTags = entries.map(createBlockTag)
  const sizeX = Math.max(1, Math.min(MAX_WIDTH, entries.length || 1))
  const sizeZ = Math.max(1, Math.min(MAX_WIDTH, Math.ceil(entries.length / MAX_WIDTH) || 1))
  const sizeY = Math.max(1, Math.ceil(entries.length / (MAX_WIDTH * MAX_WIDTH)) || 1)

  const root = nbt.compound({
    DataVersion: nbt.int(DATA_VERSION),
    size: nbt.list(TagType.Int, [nbt.int(sizeX), nbt.int(sizeY), nbt.int(sizeZ)]),
    palette: nbt.list(TagType.Compound, createPaletteTag()),
    blocks: nbt.list(TagType.Compound, blockTags),
    entities: nbt.list(TagType.Compound, []),
  })

  return {
    buffer: writeNbt(root, ''),
    blockCount: entries.length,
    blocks: entries.map(entry => ({
      command: entry.command,
      conditional: entry.conditional,
      state: entry.state,
      functionName: entry.functionName,
      lineNumber: entry.lineNumber,
    })),
  }
}

export function compileToStructure(source: string, namespace: string, filePath?: string): StructureCompileResult {
  const preprocessedSource = preprocessSource(source, { filePath })
  const tokens = new Lexer(preprocessedSource, filePath).tokenize()
  const ast = new Parser(tokens, preprocessedSource, filePath).parse(namespace)
  const ir = new Lowering(namespace).lower(ast)
  const stats = createEmptyOptimizationStats()
  const optimizedIRFunctions = ir.functions.map(fn => {
    const optimized = optimizeWithStats(fn)
    mergeOptimizationStats(stats, optimized.stats)
    return optimized.fn
  })
  const structureOptimized = optimizeForStructureWithStats(optimizedIRFunctions, namespace)
  mergeOptimizationStats(stats, structureOptimized.stats)
  const optimizedModule: IRModule = {
    ...ir,
    functions: structureOptimized.functions,
  }
  return {
    ...generateStructure(optimizedModule),
    stats,
  }
}
