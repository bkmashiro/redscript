import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  loadProject,
  parseProjectManifest,
  ProjectManifestError,
} from '../../project/manifest'
import {
  PROJECT_LOCK_SCHEMA_VERSION,
  parseProjectLock,
  serializeProjectLock,
  type ProjectLock,
} from '../../project/lockfile'

function makeProject(manifest: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-remote-lock-'))
  fs.writeFileSync(path.join(root, 'redscript.toml'), manifest, 'utf8')
  return root
}

function remoteManifest(dependency: string): string {
  return `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
license = "MIT"
source-roots = ["src"]

[dependencies]
"example.com/shared" = ${dependency}

[target.pack]
kind = "datapack"
entry = "example.com/app::main"
`
}

function lockFixture(): ProjectLock {
  return {
    schemaVersion: PROJECT_LOCK_SCHEMA_VERSION,
    dependencies: [
      {
        modulePath: 'example.com/zeta',
        source: { kind: 'git', url: 'https://example.com/zeta.git' },
        constraints: ['^2.0.0'],
        version: '2.3.0',
        revision: '2222222222222222222222222222222222222222',
        contentHash: `sha256:${'b'.repeat(64)}`,
        license: {
          declared: null,
          source: 'redscript.toml#project.license',
        },
      },
      {
        modulePath: 'example.com/alpha',
        source: { kind: 'git', url: 'https://example.com/alpha.git' },
        constraints: ['~1.2.0'],
        version: '1.2.4',
        revision: '1111111111111111111111111111111111111111',
        contentHash: `sha256:${'a'.repeat(64)}`,
        license: {
          declared: 'Apache-2.0',
          source: 'redscript.toml#project.license',
        },
      },
    ],
  }
}

describe('remote dependency manifest and lockfile contract', () => {
  test('parses an explicit Git source and SemVer constraint without resolving network state', () => {
    const root = makeProject(remoteManifest(`{
      git = "https://EXAMPLE.com/shared.git/",
      version = "  ^1.2.0  "
    }`))

    try {
      const project = parseProjectManifest(path.join(root, 'redscript.toml'), {
        dependencyMode: 'declarations',
      })
      expect(project.manifest.project.license).toBe('MIT')
      expect(project.dependencies.size).toBe(0)
      expect(project.dependencySpecs.get('example.com/shared')).toEqual({
        kind: 'remote',
        modulePath: 'example.com/shared',
        source: {
          kind: 'git',
          url: 'https://example.com/shared.git/',
        },
        constraint: '^1.2.0',
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('ordinary project loading requires a lock before touching a remote dependency', () => {
    const root = makeProject(remoteManifest(`{
      git = "https://example.com/shared.git",
      version = "^1.2.0"
    }`))

    try {
      expect(() => loadProject(root)).toThrow(ProjectManifestError)
      expect(() => loadProject(root)).toThrow(/redscript\.lock.*redscript resolve/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test.each([
    [
      'mixed local and remote source',
      '{ path = "../shared", git = "https://example.com/shared.git", version = "1.0.0" }',
      /exactly one of 'path' or 'git'/i,
    ],
    [
      'missing version',
      '{ git = "https://example.com/shared.git" }',
      /version.*required/i,
    ],
    [
      'invalid semantic constraint',
      '{ git = "https://example.com/shared.git", version = "not-a-range" }',
      /valid semantic version constraint/i,
    ],
    [
      'credential-bearing URL',
      `{ git = "${['https://test-user', 'test-password@example.com/shared.git'].join(':')}", version = "1.0.0" }`,
      /must not contain credentials/i,
    ],
    [
      'unsupported transport',
      '{ git = "ssh://git@example.com/shared.git", version = "1.0.0" }',
      /https: or file:/i,
    ],
  ])('rejects %s', (_label, dependency, expected) => {
    const root = makeProject(remoteManifest(dependency))
    try {
      expect(() => parseProjectManifest(path.join(root, 'redscript.toml'), {
        dependencyMode: 'declarations',
      })).toThrow(expected)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('serializes dependencies in canonical module order and round-trips provenance', () => {
    const serialized = serializeProjectLock(lockFixture())
    expect(serialized.endsWith('\n')).toBe(true)
    expect(serialized.indexOf('example.com/alpha')).toBeLessThan(serialized.indexOf('example.com/zeta'))

    const parsed = parseProjectLock(serialized, '/project/redscript.lock')
    expect(parsed.dependencies.map(dependency => dependency.modulePath)).toEqual([
      'example.com/alpha',
      'example.com/zeta',
    ])
    expect(parsed.dependencies[0].license).toEqual({
      declared: 'Apache-2.0',
      source: 'redscript.toml#project.license',
    })
    expect(serializeProjectLock(parsed)).toBe(serialized)
  })

  test.each([
    [
      'unknown entry field',
      () => JSON.stringify({
        ...lockFixture(),
        dependencies: [{ ...lockFixture().dependencies[0], mutable: true }],
      }),
      /Unknown key.*mutable/i,
    ],
    [
      'duplicate module identity',
      () => JSON.stringify({
        ...lockFixture(),
        dependencies: [lockFixture().dependencies[0], lockFixture().dependencies[0]],
      }),
      /Duplicate locked module/i,
    ],
    [
      'invalid revision',
      () => JSON.stringify({
        ...lockFixture(),
        dependencies: [{ ...lockFixture().dependencies[0], revision: 'main' }],
      }),
      /revision.*commit hash/i,
    ],
    [
      'non-canonical module path',
      () => JSON.stringify({
        ...lockFixture(),
        dependencies: [{ ...lockFixture().dependencies[0], modulePath: '../shared' }],
      }),
      /modulePath.*canonical/i,
    ],
    [
      'invalid content hash',
      () => JSON.stringify({
        ...lockFixture(),
        dependencies: [{ ...lockFixture().dependencies[0], contentHash: 'sha256:nope' }],
      }),
      /contentHash.*sha256/i,
    ],
    [
      'non-canonical semantic version',
      () => JSON.stringify({
        ...lockFixture(),
        dependencies: [{ ...lockFixture().dependencies[1], version: 'v1.2.4' }],
      }),
      /version.*canonical/i,
    ],
    [
      'non-canonical constraint whitespace',
      () => JSON.stringify({
        ...lockFixture(),
        dependencies: [{ ...lockFixture().dependencies[1], constraints: [' ~1.2.0 '] }],
      }),
      /constraint.*canonical/i,
    ],
  ])('rejects lockfile with %s', (_label, source, expected) => {
    expect(() => parseProjectLock(source(), '/project/redscript.lock')).toThrow(expected)
  })
})
