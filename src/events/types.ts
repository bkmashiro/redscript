import type { TypeNode } from '../ast/types'
import { EVENT_RUNTIME_MANIFESTS, eventTypesFromManifests } from './manifest'

export const EVENT_TYPES = eventTypesFromManifests(EVENT_RUNTIME_MANIFESTS)

export type EventTypeName = keyof typeof EVENT_TYPES

export interface EventTypeSpec {
  tag: string
  handlerTag: string
  params: readonly string[]
  detection: string
  executorContext: TypeNode
  runtimeAssets?: readonly string[]
}

export interface EventParamSpec {
  name: string
  type: TypeNode
}

export function isEventTypeName(value: string): value is EventTypeName {
  return value in EVENT_TYPES
}

export function getEventExecutorContext(eventType: EventTypeName): TypeNode {
  return EVENT_TYPES[eventType].executorContext
}

export function getEventParamSpecs(eventType: EventTypeName): EventParamSpec[] {
  return EVENT_TYPES[eventType].params.map(parseEventParam)
}

export function getEventHandlerTagId(eventType: EventTypeName): string {
  return EVENT_TYPES[eventType].handlerTag
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
