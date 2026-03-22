import type { Span, StructDecl, StructField } from '../ast/types'

export interface ExpandableStruct {
  name: string
  extends?: string
  fields: StructField[]
  isSingleton?: boolean
  span?: Span
}

export interface StructExpansionError {
  message: string
  node?: { span?: Span }
}

export function expandStructDeclarations<T extends ExpandableStruct>(
  structs: T[],
  onError?: (error: StructExpansionError) => void,
): T[] {
  const expandedByName = new Map<string, T>()
  const expanded: T[] = []

  for (const struct of structs) {
    const inheritedFields: StructField[] = []
    const seenFieldNames = new Set<string>()

    if (struct.extends) {
      const parent = expandedByName.get(struct.extends)
      if (!parent) {
        onError?.({
          message: `Struct '${struct.name}' extends unknown struct '${struct.extends}'`,
          node: struct,
        })
      } else {
        for (const field of parent.fields) {
          inheritedFields.push(field)
          seenFieldNames.add(field.name)
        }
      }
    }

    const ownFields: StructField[] = []
    for (const field of struct.fields) {
      if (seenFieldNames.has(field.name)) {
        onError?.({
          message: `Struct '${struct.name}' cannot override inherited field '${field.name}'`,
          node: struct,
        })
        continue
      }
      seenFieldNames.add(field.name)
      ownFields.push(field)
    }

    const resolved = {
      ...struct,
      fields: [...inheritedFields, ...ownFields],
    }
    expanded.push(resolved)
    expandedByName.set(struct.name, resolved)
  }

  return expanded
}
