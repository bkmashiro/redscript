// Test that @on(EventType) generates correct tag JSON
import { compile } from '../../emit/compile'
import * as fs from 'fs'

const EVENTS_SRC = fs.readFileSync('src/stdlib/events.mcrs', 'utf-8')

test('@on(PlayerJoin) generates function tag JSON', () => {
  const src = `
    namespace test_events
    @on(PlayerJoin) fn welcome(p: Player) {
      raw("say welcome")
    }
  `
  const result = compile(src, { namespace: 'test_events', librarySources: [EVENTS_SRC] })
  const tagFile = result.files.find(f => f.path === 'data/rs/tags/function/on_player_join.json')
  expect(tagFile).toBeDefined()
  const tag = JSON.parse(tagFile!.content)
  expect(tag.values).toContain('test_events:welcome')
})

test('multiple @on(PlayerJoin) handlers all appear in tag', () => {
  const src = `
    namespace test_events
    @on(PlayerJoin) fn welcome(p: Player) { raw("say hi") }
    @on(PlayerJoin) fn give_kit(p: Player) { raw("say kit") }
  `
  const result = compile(src, { namespace: 'test_events', librarySources: [EVENTS_SRC] })
  const tagFile = result.files.find(f => f.path === 'data/rs/tags/function/on_player_join.json')
  expect(tagFile).toBeDefined()
  const tag = JSON.parse(tagFile!.content)
  expect(tag.values).toContain('test_events:welcome')
  expect(tag.values).toContain('test_events:give_kit')
})

test('compile auto-includes runtime assets for @on decorators from manifest declarations', () => {
  const src = `
    namespace test_events_auto
    @on(PlayerJoin) fn welcome(p: Player) { raw("say hi") }
  `
  const result = compile(src, { namespace: 'test_events_auto' })

  const tagFile = result.files.find(f => f.path === 'data/rs/tags/function/on_player_join.json')
  expect(tagFile).toBeDefined()
  const tag = JSON.parse(tagFile!.content)
  expect(tag.values).toContain('test_events_auto:welcome')

  expect(result.files.filter(f => f.path === 'data/test_events_auto/function/__events_load.mcfunction')).toHaveLength(1)
  expect(result.files.filter(f => f.path === 'data/test_events_auto/function/__events_tick.mcfunction')).toHaveLength(1)

  const loadTagFile = result.files.find(f => f.path === 'data/minecraft/tags/function/load.json')
  const tickTagFile = result.files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
  expect(loadTagFile).toBeDefined()
  expect(tickTagFile).toBeDefined()
  expect(JSON.parse(loadTagFile!.content).values.filter((value: string) => value === 'test_events_auto:__events_load')).toHaveLength(1)
  expect(JSON.parse(tickTagFile!.content).values.filter((value: string) => value === 'test_events_auto:__events_tick')).toHaveLength(1)
})

test('compile does not include event runtime assets without @on decorators', () => {
  const src = `
    namespace test_events_auto
    fn hello() { raw("say hi") }
  `
  const result = compile(src, { namespace: 'test_events_auto' })

  expect(result.files.find(f => f.path === 'data/test_events_auto/function/__events_load.mcfunction')).toBeUndefined()
  expect(result.files.find(f => f.path === 'data/test_events_auto/function/__events_tick.mcfunction')).toBeUndefined()
})

test('@on(PlayerDeath) generates on_player_death tag', () => {
  const src = `
    namespace test_events
    @on(PlayerDeath) fn on_death(p: Player) { raw("say dead") }
  `
  const result = compile(src, { namespace: 'test_events', librarySources: [EVENTS_SRC] })
  const tagFile = result.files.find(f => f.path === 'data/rs/tags/function/on_player_death.json')
  expect(tagFile).toBeDefined()
  const tag = JSON.parse(tagFile!.content)
  expect(tag.values).toContain('test_events:on_death')
})

test('@on(PlayerDeath) supports no-parameter handlers using @s context', () => {
  const src = `
    namespace test_events
    @on(PlayerDeath) fn on_death() { raw("say dead") }
  `
  const result = compile(src, { namespace: 'test_events', librarySources: [EVENTS_SRC] })
  const tagFile = result.files.find(f => f.path === 'data/rs/tags/function/on_player_death.json')
  expect(tagFile).toBeDefined()
  const tag = JSON.parse(tagFile!.content)
  expect(tag.values).toContain('test_events:on_death')
})

test('@on(PlayerDeath) legacy Player parameter lowers as @s context alias', () => {
  const src = `
    namespace test_events
    @on(PlayerDeath) fn on_death(player: Player) {
      tell(player, "dead")
      let deaths: int = scoreboard_get(player, "rs.deaths")
      scoreboard_set(player, "rs.seen_deaths", deaths)
    }
  `
  const result = compile(src, { namespace: 'test_events', librarySources: [EVENTS_SRC] })
  const handler = result.files.find(f => f.path === 'data/test_events/function/on_death.mcfunction')
  expect(handler).toBeDefined()
  expect(handler!.content).not.toContain('$p0')
  expect(handler!.content).toContain('tellraw @s {"text":"dead"}')
  expect(handler!.content).toContain('scoreboard players get @s rs.deaths')
  expect(handler!.content).toContain('execute store result score @s rs.seen_deaths run scoreboard players get')
})

test('@function_tag registers a handler tag without compiler event semantics', () => {
  const src = `
    namespace test_events
    @function_tag("rs:on_player_death")
    fn on_death(): void { raw("say dead") }
  `
  const result = compile(src, { namespace: 'test_events' })
  const tagFile = result.files.find(f => f.path === 'data/rs/tags/function/on_player_death.json')
  expect(tagFile).toBeDefined()
  const tag = JSON.parse(tagFile!.content)
  expect(tag.values).toEqual(['test_events:on_death'])
})

test('events.mcrs compiles without errors', () => {
  const result = compile(EVENTS_SRC.replace(/^module.*$/m, 'namespace rs_events'), { namespace: 'rs_events' })
  expect(result.success).toBe(true)
})
