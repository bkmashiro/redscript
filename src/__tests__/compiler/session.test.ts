import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { CompilerSession } from '../../compiler/session'
import { DuplicateSourceError, SourceManager } from '../../compiler/source-manager'
import { compile, compilePipeline } from '../../emit/compile'
import { createCompilerSession as createPublicCompilerSession } from '../../index'
import { loadProject, resolveBuildTarget } from '../../project/manifest'

function sortedFiles(result: ReturnType<typeof compile>): Array<{ path: string; content: string | Buffer }> {
  return [...result.files].sort((left, right) => left.path.localeCompare(right.path))
}

describe('SourceManager', () => {
  test('gives one immutable identity to equivalent file paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-sources-'))
    const manager = new SourceManager({ cwd: root })

    try {
      const first = manager.addSource({
        filePath: path.join('src', 'main.mcrs'),
        text: 'fn main() {}\n',
      })
      const second = manager.addSource({
        filePath: path.join(root, 'src', '.', 'main.mcrs'),
        text: 'fn main() {}\n',
      })

      expect(second).toBe(first)
      expect(first.filePath).toBe(path.join(root, 'src', 'main.mcrs'))
      expect(first.displayName).toBe(path.join('src', 'main.mcrs'))
      expect(Object.isFrozen(first)).toBe(true)
      expect(manager.list()).toEqual([first])
      expect(() => manager.addSource({
        filePath: path.join(root, 'src', 'main.mcrs'),
        text: 'fn changed() {}\n',
      })).toThrow(DuplicateSourceError)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('reads a file once into an immutable source unit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-sources-'))
    const filePath = path.join(root, 'main.mcrs')
    fs.writeFileSync(filePath, 'fn main() {}\n')
    const manager = new SourceManager({ cwd: root })

    try {
      const source = manager.readFile('main.mcrs')
      fs.writeFileSync(filePath, 'fn changed() {}\n')

      expect(source.text).toBe('fn main() {}\n')
      expect(manager.get(source.id)).toBe(source)
      expect(manager.getByPath(filePath)).toBe(source)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('CompilerSession compatibility spine', () => {
  test('is available from the public compiler API', () => {
    expect(createPublicCompilerSession()).toBeInstanceOf(CompilerSession)
  })

  test('binds resolved project and target context to the project root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-session-project-'))
    fs.mkdirSync(path.join(root, 'src'))
    fs.writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "demo"
module = "example.com/demo"
namespace = "demo"
source-roots = ["src"]

[target.pack]
kind = "datapack"
entry = "example.com/demo::main"
out = "dist"
default = true
`)

    try {
      const project = loadProject(root)!
      const target = resolveBuildTarget(project)
      const session = createPublicCompilerSession({ project, target })
      const unit = session.sources.addSource({ filePath: 'src/main.mcrs', text: 'fn main() {}' })

      expect(session.project).toBe(project)
      expect(session.target).toBe(target)
      expect(unit.filePath).toBe(path.join(root, 'src', 'main.mcrs'))
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('session compilation is byte-identical to the extracted legacy pipeline', () => {
    const source = [
      '@load',
      'fn boot() { say("boot"); }',
      'fn add(x: int, y: int) -> int { return x + y; }',
      '',
    ].join('\n')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-session-'))
    const filePath = path.join(root, 'main.mcrs')
    const session = new CompilerSession(compilePipeline, { cwd: root })
    const sourceUnit = session.sources.addSource({ filePath, text: source })

    try {
      const direct = compilePipeline(source, { namespace: 'session_parity', filePath })
      const throughSession = session.compile(sourceUnit.id, { namespace: 'session_parity' })

      expect(throughSession.warnings).toEqual(direct.warnings)
      expect(sortedFiles(throughSession)).toEqual(sortedFiles(direct))
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('the public compile adapter preserves legacy output exactly', () => {
    const source = 'fn main() { say("hello"); }\n'
    const options = { namespace: 'ephemeral' }

    const direct = compilePipeline(source, options)
    const adapted = compile(source, options)

    expect(adapted.warnings).toEqual(direct.warnings)
    expect(sortedFiles(adapted)).toEqual(sortedFiles(direct))
  })
})
