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

test('events.mcrs compiles without errors', () => {
  const result = compile(EVENTS_SRC.replace(/^module.*$/m, 'namespace rs_events'), { namespace: 'rs_events' })
  expect(result.success).toBe(true)
})
