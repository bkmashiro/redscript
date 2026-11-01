import { describe, expect, test } from '@jest/globals'
import { compile } from '../../compile'
import { compileModules } from '../../emit/modules'
import { MCCommandValidator } from '../../mc-validator'
import * as path from 'path'

const validator = new MCCommandValidator(path.resolve(__dirname, '../../mc-validator/commands-1.21.4.json'))

describe('periodic tick registration', () => {
  test('uses the same periodic emitter for named project modules', () => {
    const result = compileModules([{ name: 'lib', source: 'module lib; @tick(rate=3) fn pulse() { say("tick"); }' }], { namespace: 'tick_package' })
    const tag = JSON.parse(result.files.find(file => file.path === 'data/minecraft/tags/function/tick.json')!.content)
    expect(tag.values).toContain('tick_package:__tick_rate_lib/pulse')
    expect(tag.values).not.toContain('tick_package:lib/pulse')
    expect(result.files.some(file => file.path.endsWith('/__tick_rate_lib/pulse.mcfunction'))).toBe(true)
  })

  test('routes rate>1 through a reset-on-load, module-owned counter without changing direct calls', () => {
    const result = compile(`
      @tick(rate=5) fn pulse() { scoreboard_set("#pulse", "out", 1); }
      fn manual() { pulse(); pulse(); }
    `, { namespace: 'tick_rate' })
    const get = (name: string) => result.files.find(file => file.path === name)!.content
    const tag = JSON.parse(get('data/minecraft/tags/function/tick.json'))
    expect(tag.values).toContain('tick_rate:__tick_rate_pulse')
    expect(tag.values).not.toContain('tick_rate:pulse')
    expect(get('data/tick_rate/function/load.mcfunction')).toContain('scoreboard players set #tick_rate/pulse __tick_rate 0')
    const wrapper = get('data/tick_rate/function/__tick_rate_pulse.mcfunction')
    expect(wrapper).toContain('matches 5.. run function tick_rate:pulse')
    expect(get('data/tick_rate/function/manual.mcfunction').split('function tick_rate:pulse')).toHaveLength(3)
    for (const command of wrapper.split('\n').filter(Boolean)) expect(validator.validate(command).valid).toBe(true)
  })

  test('bare tick and rate=1 do not introduce dispatchers', () => {
    const result = compile('@tick fn first() {} @tick(rate=1) fn second() {}', { namespace: 'tick_rate' })
    const tag = JSON.parse(result.files.find(file => file.path === 'data/minecraft/tags/function/tick.json')!.content)
    expect(tag.values).toEqual(['tick_rate:first', 'tick_rate:second'])
    expect(result.files.some(file => file.path.includes('__tick_rate_'))).toBe(false)
  })

  test.each(['0', '-1', '1.5', '2147483648', 'RATE', '20oops'])('rejects invalid rate=%s including lenient compilation', rate => {
    for (const lenient of [false, true]) {
      expect(() => compile(`@tick(rate=${rate}) fn pulse() {}`, { namespace: 'tick_rate', lenient }))
        .toThrow('@tick rate must be a positive integer')
    }
  })
})
