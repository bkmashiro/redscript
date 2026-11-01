import { expect, test } from '@jest/globals'
import { compile } from '../../compile'

test('tile_of uses native floor division without a second negative-coordinate correction', () => {
  const result = compile('import geometry; fn tile(coord: int): int { return tile_of(coord, 100); }', { namespace: 'tile_floor' })
  const body = result.files.find(file => file.path.endsWith('/tile_of.mcfunction'))!.content
  expect(body).toContain('/=')
  expect(body).not.toMatch(/execute (if|unless)/)
  expect(result.files.some(file => file.path.includes('tile_of__'))).toBe(false)
})
