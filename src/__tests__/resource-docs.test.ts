import * as fs from 'fs'
import * as path from 'path'

const repoRoot = path.resolve(__dirname, '..', '..')

describe('typed resource docs', () => {
  it('shows typed and string-compatible resource command forms without claiming live Paper proof', () => {
    const reference = fs.readFileSync(path.join(repoRoot, 'docs/LANGUAGE_REFERENCE.md'), 'utf-8')

    expect(reference).toContain('## Resource IDs')
    expect(reference).toContain('resource<particle>')
    expect(reference).toContain('resource<effect>')
    expect(reference).toContain('declare fn burst(id: resource<particle>): void;')
    expect(reference).toContain('particle("minecraft:flame", 0, 64, 0);')
    expect(reference).toContain('Typed resource checks are compile/typechecker diagnostics, not live Paper proof.')
  })
})
