/**
 * Command Block Target
 * 
 * Generates a JSON structure representing command blocks that can be
 * placed in Minecraft to run the compiled datapack.
 */

export interface CommandBlock {
  type: 'repeat' | 'impulse' | 'chain'
  command: string
  pos: [number, number, number]
  auto?: boolean
  conditional?: boolean
}

export interface CommandBlockStructure {
  format: 'redscript-cmdblock-v1'
  namespace: string
  blocks: CommandBlock[]
}

/**
 * Generate a command block structure JSON for a given namespace.
 * 
 * Creates:
 * - 1 × Repeat block: function <namespace>:__tick
 * - 1 × Impulse block (auto): function <namespace>:__load
 */
export function generateCommandBlocks(
  namespace: string,
  hasTick: boolean,
  hasLoad: boolean
): CommandBlockStructure {
  const blocks: CommandBlock[] = []
  let x = 0

  // Load block - impulse with auto (runs once when placed)
  if (hasLoad) {
    blocks.push({
      type: 'impulse',
      command: `function ${namespace}:__load`,
      pos: [x, 0, 0],
      auto: true,
    })
    x++
  }

  // Tick block - repeat (runs every tick)
  if (hasTick) {
    blocks.push({
      type: 'repeat',
      command: `function ${namespace}:__tick`,
      pos: [x, 0, 0],
    })
    x++
  }

  return {
    format: 'redscript-cmdblock-v1',
    namespace,
    blocks,
  }
}
