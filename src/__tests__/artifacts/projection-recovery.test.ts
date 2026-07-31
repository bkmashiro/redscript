import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { DatapackArtifactGraph } from '../../artifacts/model'

function graph(): DatapackArtifactGraph {
  const artifact = Object.freeze({
    identity: Object.freeze({ kind: 'opaque' as const, id: 'sentinel' }),
    outputPath: 'data/demo/sentinel.txt',
    mediaType: 'application/octet-stream' as const,
    lifecycle: 'build' as const,
    provenance: Object.freeze({ kind: 'generated' as const, stage: 'test' }),
    content: Buffer.from('new output'),
    references: Object.freeze([]),
  })
  return Object.freeze({
    minecraftVersion: 0,
    artifacts: Object.freeze([artifact]),
    byIdentity: new Map([['opaque:sentinel', artifact]]),
    byPath: new Map([[artifact.outputPath, artifact]]),
  })
}

describe('artifact projection recovery', () => {
  test('restores the complete previous directory when the staged commit rename fails', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-projection-recovery-'))
    const output = path.join(root, 'dist')
    fs.mkdirSync(output)
    fs.writeFileSync(path.join(output, 'sentinel.txt'), 'previous')

    try {
      jest.isolateModules(() => {
        jest.doMock('fs', () => {
          const actual = jest.requireActual<typeof import('fs')>('fs')
          return {
            ...actual,
            renameSync: (from: fs.PathLike, to: fs.PathLike) => {
              if (String(from).includes('.redscript-stage-') && path.resolve(String(to)) === output) {
                throw new Error('simulated staged commit failure')
              }
              return actual.renameSync(from, to)
            },
          }
        })
        const { writeArtifactDirectoryAtomically } = require('../../artifacts/projection') as typeof import('../../artifacts/projection')
        expect(() => writeArtifactDirectoryAtomically(graph(), output)).toThrow(/simulated staged commit failure/)
      })
    } finally {
      jest.dontMock('fs')
      jest.resetModules()
    }

    expect(fs.readFileSync(path.join(output, 'sentinel.txt'), 'utf8')).toBe('previous')
    expect(fs.readdirSync(root).filter(name => name.includes('.redscript-'))).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })
})
