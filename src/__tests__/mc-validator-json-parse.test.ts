/**
 * Tests for diagnostic error messages when the Brigadier JSON file cannot
 * be parsed by MCCommandValidator's constructor.
 *
 * Targets: src/mc-validator/index.ts constructor try-catch.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { MCCommandValidator } from '../mc-validator'

function writeTempFile(content: string): string {
  const file = path.join(os.tmpdir(), `test-brigadier-${Date.now()}.json`)
  fs.writeFileSync(file, content, 'utf-8')
  return file
}

describe('MCCommandValidator constructor — malformed JSON', () => {
  test('throws with file path in message when JSON is invalid', () => {
    const file = writeTempFile('{ invalid json }')
    expect(() => new MCCommandValidator(file)).toThrow(
      /Failed to parse Brigadier JSON at .+/
    )
    fs.unlinkSync(file)
  })

  test('error message includes the file path', () => {
    const file = writeTempFile('[1, 2,')
    try {
      expect(() => new MCCommandValidator(file)).toThrow(file)
    } finally {
      fs.unlinkSync(file)
    }
  })

  test('error message includes the original parse error', () => {
    const file = writeTempFile('not-json-at-all')
    let caught: Error | undefined
    try {
      new MCCommandValidator(file)
    } catch (err) {
      caught = err as Error
    } finally {
      fs.unlinkSync(file)
    }
    expect(caught).toBeDefined()
    expect(caught!.message).toMatch(/Failed to parse Brigadier JSON at/)
    // Original SyntaxError message is included after the colon
    expect(caught!.message).toContain(':')
  })

  test('empty file throws with diagnostic message', () => {
    const file = writeTempFile('')
    expect(() => new MCCommandValidator(file)).toThrow(/Failed to parse Brigadier JSON at/)
    fs.unlinkSync(file)
  })

  test('valid JSON file constructs without error', () => {
    const file = writeTempFile(JSON.stringify({ root: { type: 'root', children: [] } }))
    expect(() => new MCCommandValidator(file)).not.toThrow()
    fs.unlinkSync(file)
  })
})
