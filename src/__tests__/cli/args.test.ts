import { deriveNamespace, parseArgs, sanitizeProjectName } from '../../cli/args'

describe('CLI arg helpers', () => {
  test('parses repeatable include dirs and command options', () => {
    expect(parseArgs(['compile', 'src/main.mcrs', '--namespace', 'demo', '--include', 'lib', '--include', 'vendor', '--source-map'])).toMatchObject({
      command: 'compile',
      file: 'src/main.mcrs',
      namespace: 'demo',
      includeDirs: ['lib', 'vendor'],
      sourceMap: true,
    })
  })

  test('derives safe namespaces and project names', () => {
    expect(deriveNamespace('/tmp/My Pack!.mcrs')).toBe('my_pack_')
    expect(sanitizeProjectName('My Pack!')).toBe('my_pack_')
    expect(sanitizeProjectName('!!!')).toBe('___')
  })
})
