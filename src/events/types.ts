import type { TypeNode } from '../ast/types'

export const EVENT_TYPES = {
  PlayerDeath: {
    tag: 'rs.just_died',
    params: ['player: Player'],
    detection: 'scoreboard',
  },
  PlayerJoin: {
    tag: 'rs.just_joined',
    params: ['player: Player'],
    detection: 'tag',
  },
  BlockBreak: {
    tag: 'rs.just_broke_block',
    params: ['player: Player', 'block: string'],
    detection: 'advancement',
  },
  EntityKill: {
    tag: 'rs.just_killed',
    params: ['player: Player'],
    detection: 'scoreboard',
  },
  ItemUse: {
    tag: 'rs.just_used_item',
    params: ['player: Player'],
    detection: 'scoreboard',
  },
} as const

export type EventTypeName = keyof typeof EVENT_TYPES

export interface EventParamSpec {
  name: string
  type: TypeNode
}

export function isEventTypeName(value: string): value is EventTypeName {
  return value in EVENT_TYPES
}

export function getEventParamSpecs(eventType: EventTypeName): EventParamSpec[] {
  return EVENT_TYPES[eventType].params.map(parseEventParam)
}

function parseEventParam(spec: string): EventParamSpec {
  const match = spec.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)$/)
  if (!match) {
    throw new Error(`Invalid event parameter spec: ${spec}`)
  }

  const [, name, typeName] = match
  return {
    name,
    type: toTypeNode(typeName),
  }
}

function toTypeNode(typeName: string): TypeNode {
  if (typeName === 'Player') {
    return { kind: 'entity', entityType: 'Player' }
  }

  if (typeName === 'string' || typeName === 'int' || typeName === 'bool' || typeName === 'float' || typeName === 'fixed' || typeName === 'void' || typeName === 'BlockPos' || typeName === 'byte' || typeName === 'short' || typeName === 'long' || typeName === 'double') {
    return { kind: 'named', name: typeName }
  }

  return { kind: 'struct', name: typeName }
}
