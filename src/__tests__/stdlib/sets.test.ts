import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/sets.mcrs'), 'utf-8')

function functionContent(result: ReturnType<typeof compile>, name: string): string {
  return result.files.find(file => file.path.endsWith(`/function/${name}.mcfunction`))?.content ?? ''
}

describe('stdlib/sets.mcrs', () => {
  test('file loads without parse errors', () => {
    expect(() => compile(SRC + '\nfn _noop(): int { return 0; }', { namespace: 'test' })).not.toThrow()
  })

  test('set_new uses the string-return ABI', () => {
    const result = compile('@keep fn probe() { let id: string = set_new(); set_add(id, "apple"); }', {
      namespace: 'test', librarySources: [SRC],
    })
    expect(functionContent(result, 'probe')).toContain('set from storage rs:strings __sret')
    expect(functionContent(result, 'set_new')).toContain('function test:__set_new_apply with storage rs:macro_args')
  })

  test('set operations emit compound-backed macro helpers', () => {
    const result = compile('@keep fn probe() { let id: string = set_new(); set_add(id, "apple"); let ok: int = set_contains(id, "apple"); set_remove(id, "apple"); set_clear(id); }', {
      namespace: 'test', librarySources: [SRC],
    })
    const all = result.files.map(file => file.content).join('\n')
    expect(all).toContain('storage rs:sets $(set).$(value)')
    expect(all).toContain('execute store success score $ret __test if data storage rs:sets')
    expect(all).not.toContain('compiler builtin — do not call directly')
  })

  test('shared string-return ABI snapshots callee values', () => {
    const result = compile('@no-inline fn identity(value: string): string { return value; } @keep fn probe() { let copied: string = identity("apple"); }', { namespace: 'stringret' })
    expect(functionContent(result, 'identity')).toContain('rs:strings __sret set from storage rs:strings __sp0')
    expect(functionContent(result, 'probe')).toContain('set from storage rs:strings __sret')
  })
})
