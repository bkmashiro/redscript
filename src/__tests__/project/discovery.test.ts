import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { discoverProjectManifest } from '../../project/discovery'

function makeDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-discovery-'))
}

describe('project discovery', () => {
  test('returns the nearest manifest and accepts a source-file start path', () => {
    const outer = makeDir()
    const nested = path.join(outer, 'nested')
    const sourceDir = path.join(nested, 'src')
    const sourceFile = path.join(sourceDir, 'main.mcrs')
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(path.join(outer, 'redscript.toml'), '[project]\nname = "outer"\n')
    fs.writeFileSync(path.join(nested, 'redscript.toml'), '[project]\nname = "nested"\n')
    fs.writeFileSync(sourceFile, 'fn main() {}\n')

    try {
      expect(discoverProjectManifest(sourceFile)).toEqual({
        rootDir: nested,
        manifestPath: path.join(nested, 'redscript.toml'),
      })
    } finally {
      fs.rmSync(outer, { recursive: true, force: true })
    }
  })

  test('normalizes a missing nested path before walking to its parent manifest', () => {
    const root = makeDir()
    fs.writeFileSync(path.join(root, 'redscript.toml'), '[project]\nname = "root"\n')

    try {
      expect(discoverProjectManifest(path.join(root, 'src', 'future'))).toEqual({
        rootDir: root,
        manifestPath: path.join(root, 'redscript.toml'),
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('returns null when no manifest exists', () => {
    const root = makeDir()
    try {
      expect(discoverProjectManifest(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
