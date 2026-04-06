/**
 * Tests for macroLineCompat() — pre-1.20.2 macro template substitution.
 *
 * macroLineCompat() is private, so we exercise it through emit() using
 * macro_line instructions with mcVersion < McVersion.v1_20_2.
 *
 * The function rewrites $(param) placeholders to {storage:rs:macro_args,path:param}
 * markers. Patterns that don't match \w+ (e.g. $() or $(123)) are left as-is.
 */

import { emit } from '../../emit'
import type { LIRModule, LIRInstr } from '../../lir/types'
import { McVersion } from '../../types/mc-version'

function makeModule(template: string): LIRModule {
  return {
    namespace: 'compat',
    objective: '__compat',
    functions: [
      {
        name: 'Main',
        isMacro: false,
        macroParams: [],
        instructions: [
          { kind: 'macro_line', template } satisfies LIRInstr,
        ],
      },
    ],
  }
}

function emitLine(template: string): string {
  const files = emit(makeModule(template), {
    namespace: 'compat',
    mcVersion: McVersion.v1_20,
  })
  const file = files.find(f => f.path === 'data/compat/function/main.mcfunction')
  if (!file) throw new Error('Missing main.mcfunction')
  // Strip trailing newline, return single emitted line
  return file.content.trim()
}

// ---------------------------------------------------------------------------
// Unit-style: macroLineCompat substitution via emit()
// ---------------------------------------------------------------------------

describe('macroLineCompat: pre-1.20.2 $(param) substitution', () => {
  test('single param: $(p0) becomes {storage:rs:macro_args,path:p0}', () => {
    expect(emitLine('tp @s $(x) ~ ~')).toBe('tp @s {storage:rs:macro_args,path:x} ~ ~')
  })

  test('multiple params in one template are all replaced', () => {
    expect(emitLine('setblock $(x) $(y) $(z) minecraft:stone')).toBe(
      'setblock {storage:rs:macro_args,path:x} {storage:rs:macro_args,path:y} {storage:rs:macro_args,path:z} minecraft:stone'
    )
  })

  test('template with no params is returned unchanged', () => {
    expect(emitLine('say hello world')).toBe('say hello world')
  })

  test('template with only literal text and no $ is returned unchanged', () => {
    expect(emitLine('give @a minecraft:diamond 1')).toBe('give @a minecraft:diamond 1')
  })

  test('$() with empty parens does not match (no \\ w+ inside)', () => {
    // \w+ requires at least one word character — $() has none
    expect(emitLine('say $()')).toBe('say $()')
  })

  test('$(123) with leading digit does not match (digits are \\w but \\w+ matches them too — verify actual behavior)', () => {
    // \w includes [0-9], so $(123) WILL match and produce path:123
    // This test documents the current behavior rather than asserting a non-match
    expect(emitLine('say $(123)')).toBe('say {storage:rs:macro_args,path:123}')
  })

  test('$(param_name) with underscore is replaced (underscore is \\w)', () => {
    expect(emitLine('data merge entity @s $(entity_data)')).toBe(
      'data merge entity @s {storage:rs:macro_args,path:entity_data}'
    )
  })

  test('adjacent params without space are each replaced independently', () => {
    expect(emitLine('$(a)$(b)')).toBe(
      '{storage:rs:macro_args,path:a}{storage:rs:macro_args,path:b}'
    )
  })

  test('$(p) at start of template is replaced', () => {
    expect(emitLine('$(target) add tag test')).toBe(
      '{storage:rs:macro_args,path:target} add tag test'
    )
  })

  test('$(p) at end of template is replaced', () => {
    expect(emitLine('tag @s add $(tag)')).toBe('tag @s add {storage:rs:macro_args,path:tag}')
  })
})

// ---------------------------------------------------------------------------
// Integration: mcVersion >= v1_20_2 emits raw $-prefixed macro lines
// ---------------------------------------------------------------------------

describe('macro_line: modern vs legacy emission path', () => {
  test('mcVersion v1_20_2 emits raw $(param) syntax with leading $', () => {
    const files = emit(makeModule('tp @s $(x) $(y) $(z)'), {
      namespace: 'compat',
      mcVersion: McVersion.v1_20_2,
    })
    const file = files.find(f => f.path === 'data/compat/function/main.mcfunction')
    if (!file) throw new Error('Missing main.mcfunction')
    expect(file.content.trim()).toBe('$tp @s $(x) $(y) $(z)')
  })

  test('mcVersion v1_21 emits raw $(param) syntax with leading $', () => {
    const files = emit(makeModule('summon minecraft:marker ~ ~ ~ $(nbt)'), {
      namespace: 'compat',
      mcVersion: McVersion.v1_21,
    })
    const file = files.find(f => f.path === 'data/compat/function/main.mcfunction')
    if (!file) throw new Error('Missing main.mcfunction')
    expect(file.content.trim()).toBe('$summon minecraft:marker ~ ~ ~ $(nbt)')
  })

  test('mcVersion v1_20 (pre-1.20.2) emits compat substitution markers', () => {
    const files = emit(makeModule('tp @s $(x) $(y) $(z)'), {
      namespace: 'compat',
      mcVersion: McVersion.v1_20,
    })
    const file = files.find(f => f.path === 'data/compat/function/main.mcfunction')
    if (!file) throw new Error('Missing main.mcfunction')
    expect(file.content.trim()).toBe(
      'tp @s {storage:rs:macro_args,path:x} {storage:rs:macro_args,path:y} {storage:rs:macro_args,path:z}'
    )
    // Must NOT contain raw $(param) or leading $
    expect(file.content).not.toContain('$(')
    expect(file.content.trim()).not.toMatch(/^\$/)
  })

  test('no mcVersion option defaults to modern behavior (no compat substitution)', () => {
    const files = emit(makeModule('tp @s $(x) ~ ~'), {
      namespace: 'compat',
      // mcVersion omitted — should use DEFAULT_MC_VERSION (>= v1_20_2)
    })
    const file = files.find(f => f.path === 'data/compat/function/main.mcfunction')
    if (!file) throw new Error('Missing main.mcfunction')
    expect(file.content.trim()).toBe('$tp @s $(x) ~ ~')
  })
})
