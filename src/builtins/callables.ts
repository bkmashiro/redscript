import { BUILTIN_METADATA } from './metadata'

/** Parser-desugared and storage primitives handled directly by HIR/MIR lowering.
 * Keep these explicit: an arbitrary __name is not an external-call escape hatch.
 * Command builtins and runtime assets use the shared public builtin catalog.
 */
const LOWERING_INTRINSICS = new Set([
  '__array_length', '__array_pop', '__array_push',
  '__entity_has_tag', '__entity_tag', '__entity_untag',
  'assert', 'bool_to_str', 'int_to_str', 'to_string',
  'len', 'list_len', 'list_pop', 'list_push',
  'storage_get_int', 'storage_set_array',
])

export function isBuiltinFunction(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_METADATA, name) || LOWERING_INTRINSICS.has(name)
}
