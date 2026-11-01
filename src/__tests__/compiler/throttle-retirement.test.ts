import { describe, expect, test } from '@jest/globals'
import { compile } from '../../compile'

const source = '@throttle(ticks=5) fn limited(value: int): int { return value }'

describe('4.0 throttle retirement', () => {
  test.each([false, true])('rejects the retired decorator even with lenient=%s', lenient => {
    expect(() => compile(source, { namespace: 'retirement', lenient })).toThrow('@throttle was removed')
    try { compile(source, { namespace: 'retirement', lenient }) } catch (error) {
      expect(String(error)).toContain('@tick(rate=N)')
      expect(String(error)).toContain('cooldown')
    }
  })
})
