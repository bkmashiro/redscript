/**
 * RedScript NBT Serializer
 *
 * Serializes NBT values to Minecraft NBT string format.
 * Handles both primitive types and helper functions like text(), enchant(), etc.
 */

import type { NBTValue } from '../ast/types'

/**
 * Serialize an NBTValue to Minecraft NBT string format.
 */
export function serializeNBT(value: NBTValue): string {
  switch (value.kind) {
    case 'byte':
      return `${value.value}b`
    case 'short':
      return `${value.value}s`
    case 'int':
      return `${value.value}`
    case 'long':
      return `${value.value}L`
    case 'float':
      return `${value.value}f`
    case 'double':
      return `${value.value}d`
    case 'string':
      return `"${value.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    case 'list':
      return `[${value.items.map(serializeNBT).join(',')}]`
    case 'compound':
      return `{${value.entries.map(([k, v]) => `${k}:${serializeNBT(v)}`).join(',')}}`
    case 'call':
      return serializeNBTCall(value)
  }
}

/**
 * Serialize NBT helper function calls to MC NBT format.
 */
function serializeNBTCall(call: { fn: string; args: NBTValue[] }): string {
  switch (call.fn) {
    case 'text':
      return serializeTextHelper(call.args)
    case 'enchant':
      return serializeEnchantHelper(call.args)
    case 'potion_effect':
      return serializePotionEffectHelper(call.args)
    default:
      // Unknown helper function - serialize as raw call (shouldn't normally happen)
      return `{__unknown_fn:"${call.fn}"}`
  }
}

/**
 * text("Hello") → '{"text":"Hello"}'
 * text("Hello", "gold") → '{"text":"Hello","color":"gold"}'
 */
function serializeTextHelper(args: NBTValue[]): string {
  if (args.length === 0) {
    return `'{"text":""}'`
  }

  const text = getNBTString(args[0])
  
  if (args.length >= 2) {
    const color = getNBTString(args[1])
    return `'{"text":"${escapeJsonString(text)}","color":"${color}"}'`
  }
  
  return `'{"text":"${escapeJsonString(text)}"}'`
}

/**
 * enchant("sharpness", 5) → {id:"minecraft:sharpness",lvl:5}
 * enchant("minecraft:sharpness", 5) → {id:"minecraft:sharpness",lvl:5}
 */
function serializeEnchantHelper(args: NBTValue[]): string {
  if (args.length < 2) {
    return `{id:"minecraft:unknown",lvl:1}`
  }

  let id = getNBTString(args[0])
  if (!id.includes(':')) {
    id = `minecraft:${id}`
  }
  
  const lvl = getNBTNumber(args[1])
  
  return `{id:"${id}",lvl:${lvl}}`
}

/**
 * potion_effect("speed", 600, 1) → {Id:"minecraft:speed",Duration:600,Amplifier:1,ShowParticles:0b}
 * potion_effect("speed", 600) → {Id:"minecraft:speed",Duration:600,Amplifier:0,ShowParticles:0b}
 */
function serializePotionEffectHelper(args: NBTValue[]): string {
  if (args.length < 2) {
    return `{Id:"minecraft:unknown",Duration:0,Amplifier:0,ShowParticles:0b}`
  }

  let effectId = getNBTString(args[0])
  if (!effectId.includes(':')) {
    effectId = `minecraft:${effectId}`
  }
  
  const duration = getNBTNumber(args[1])
  const amplifier = args.length >= 3 ? getNBTNumber(args[2]) : 0
  
  return `{Id:"${effectId}",Duration:${duration},Amplifier:${amplifier},ShowParticles:0b}`
}

/**
 * Extract string value from NBTValue.
 */
function getNBTString(value: NBTValue): string {
  if (value.kind === 'string') {
    return value.value
  }
  // Fallback for other types
  return String((value as any).value ?? '')
}

/**
 * Extract numeric value from NBTValue.
 */
function getNBTNumber(value: NBTValue): number {
  switch (value.kind) {
    case 'byte':
    case 'short':
    case 'int':
    case 'float':
    case 'double':
      return value.value as number
    case 'long':
      return Number(value.value)
    default:
      return 0
  }
}

/**
 * Escape a string for use in JSON inside NBT.
 */
function escapeJsonString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}
