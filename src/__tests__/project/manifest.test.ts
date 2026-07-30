import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  ProjectManifestError,
  loadProject,
  resolveBuildTarget,
} from '../../project/manifest'

function makeProject(manifest: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-project-'))
  fs.writeFileSync(path.join(root, 'redscript.toml'), manifest, 'utf8')
  return root
}

function removeProject(root: string): void {
  fs.rmSync(root, { recursive: true, force: true })
}

describe('strict project manifest', () => {
  test('loads named targets and resolves every path from the manifest root', () => {
    const root = makeProject(`
[project]
name = "castle"
module = "github.com/bkmashiro/castle"
namespace = "castle"
mc-version = "26.2"
source-roots = ["src", "generated"]

[target.pack]
kind = "datapack"
entry = "github.com/bkmashiro/castle/cmd/pack::main"
out = "dist/castle"
default = true

[target.admin]
kind = "commands"
entry = "github.com/bkmashiro/castle/cmd/admin::main"
out = "dist/admin.commands.json"
`)

    try {
      const project = loadProject(path.join(root, 'src', 'nested'))
      expect(project).not.toBeNull()
      expect(project!.rootDir).toBe(root)
      expect(project!.manifestPath).toBe(path.join(root, 'redscript.toml'))
      expect(project!.manifest.project.modulePath).toBe('github.com/bkmashiro/castle')
      expect(project!.sourceRoots).toEqual([
        path.join(root, 'src'),
        path.join(root, 'generated'),
      ])
      expect(project!.defaultTarget).toBe('pack')
      expect(project!.targets.pack).toMatchObject({
        name: 'pack',
        kind: 'datapack',
        namespace: 'castle',
        minecraftVersion: '26.2',
        outputPath: path.join(root, 'dist', 'castle'),
      })
      expect(resolveBuildTarget(project!, 'admin')).toMatchObject({
        name: 'admin',
        kind: 'commands',
        outputPath: path.join(root, 'dist', 'admin.commands.json'),
      })
    } finally {
      removeProject(root)
    }
  })

  test('maps the legacy manifest shape to one implicit datapack target', () => {
    const root = makeProject(`
[project]
name = "legacy"
namespace = "legacy_pack"
mc-version = "1.21.4"

[compiler]
optimization = 2
include-dirs = ["src/shared"]

[output]
dir = "dist"
`)

    try {
      const project = loadProject(root)
      expect(project).not.toBeNull()
      expect(project!.manifest.project.modulePath).toBe('local/legacy')
      expect(project!.defaultTarget).toBe('default')
      expect(project!.targets.default).toMatchObject({
        kind: 'datapack',
        namespace: 'legacy_pack',
        minecraftVersion: '1.21.4',
        outputPath: path.join(root, 'dist'),
        compatibility: 'legacy-implicit',
      })
      expect(project!.compiler.includeDirs).toEqual([path.join(root, 'src', 'shared')])
    } finally {
      removeProject(root)
    }
  })

  test('rejects unknown keys with a nearest-key suggestion', () => {
    const root = makeProject(`
[project]
name = "castle"
namespase = "castle"
`)

    try {
      expect(() => loadProject(root)).toThrow(ProjectManifestError)
      expect(() => loadProject(root)).toThrow(/Unknown key 'project\.namespase'.*namespace/)
    } finally {
      removeProject(root)
    }
  })

  test('rejects multiple default targets', () => {
    const root = makeProject(`
[project]
name = "castle"
module = "example.com/castle"
namespace = "castle"

[target.one]
kind = "datapack"
entry = "example.com/castle/cmd/one::main"
default = true

[target.two]
kind = "commands"
entry = "example.com/castle/cmd/two::main"
default = true
`)

    try {
      expect(() => loadProject(root)).toThrow(/Multiple default targets: one, two/)
    } finally {
      removeProject(root)
    }
  })

  test('rejects output and source paths that escape the project root', () => {
    const outputRoot = makeProject(`
[project]
name = "castle"
module = "example.com/castle"
namespace = "castle"

[target.pack]
kind = "datapack"
entry = "local/castle::main"
out = "../outside"
`)
    const sourceRoot = makeProject(`
[project]
name = "castle"
namespace = "castle"
source-roots = ["../outside"]
`)

    try {
      expect(() => loadProject(outputRoot)).toThrow(/target\.pack\.out.*escapes project root/)
      expect(() => loadProject(sourceRoot)).toThrow(/project\.source-roots.*escapes project root/)
    } finally {
      removeProject(outputRoot)
      removeProject(sourceRoot)
    }
  })

  test('requires module identity and entry points for explicit targets', () => {
    const missingModule = makeProject(`
[project]
name = "castle"
namespace = "castle"

[target.pack]
kind = "datapack"
entry = "local/castle::main"
`)
    const missingEntry = makeProject(`
[project]
name = "castle"
module = "example.com/castle"
namespace = "castle"

[target.pack]
kind = "datapack"
`)

    try {
      expect(() => loadProject(missingModule)).toThrow(/project\.module.*required.*explicit targets/i)
      expect(() => loadProject(missingEntry)).toThrow(/target\.pack\.entry.*required/i)
    } finally {
      removeProject(missingModule)
      removeProject(missingEntry)
    }
  })

  test('rejects module identities with reserved symbol/path characters', () => {
    const root = makeProject(`
[project]
name = "castle"
module = "example.com:443/castle"
namespace = "castle"

[target.pack]
kind = "datapack"
entry = "example.com:443/castle::main"
`)

    try {
      expect(() => loadProject(root)).toThrow(/project\.module.*canonical slash-separated module path/i)
    } finally {
      removeProject(root)
    }
  })

  test('rejects an existing symlink that escapes the project root', () => {
    const root = makeProject(`
[project]
name = "castle"
module = "example.com/castle"
namespace = "castle"
source-roots = ["linked"]
`)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-outside-'))
    fs.symlinkSync(outside, path.join(root, 'linked'))

    try {
      expect(() => loadProject(root)).toThrow(/project\.source-roots.*escapes project root/)
    } finally {
      removeProject(root)
      removeProject(outside)
    }
  })

  test('reports malformed TOML with manifest path and source position', () => {
    const root = makeProject('[project\nname = "broken"\n')
    const manifestPath = path.join(root, 'redscript.toml')

    try {
      let error: unknown
      try {
        loadProject(root)
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(ProjectManifestError)
      expect((error as ProjectManifestError).manifestPath).toBe(manifestPath)
      expect((error as ProjectManifestError).line).toBeGreaterThan(0)
      expect((error as ProjectManifestError).message).toContain(manifestPath)
    } finally {
      removeProject(root)
    }
  })
})
