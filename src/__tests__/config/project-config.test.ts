import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { loadProjectConfig, buildTomlTemplate, ProjectConfig } from '../../config/project-config'

// Helper: create a temp directory tree and write files
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-config-test-'))
}

function writeToml(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, 'redscript.toml'), content, 'utf-8')
}

afterAll(() => {
  // Cleanup is handled per-test via individual tmpdir removal
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 1: Returns null when no redscript.toml exists
// ──────────────────────────────────────────────────────────────────────────────
test('returns null when no redscript.toml is found', () => {
  const dir = makeTmpDir()
  const result = loadProjectConfig(dir)
  expect(result).toBeNull()
  fs.rmSync(dir, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 2: Parses [project] section correctly
// ──────────────────────────────────────────────────────────────────────────────
test('parses [project] section fields correctly', () => {
  const dir = makeTmpDir()
  writeToml(dir, `
[project]
name = "my-datapack"
namespace = "my_pack"
mc-version = "1.21.4"
description = "My awesome datapack"
`)
  const config = loadProjectConfig(dir)
  expect(config).not.toBeNull()
  expect(config!.project?.name).toBe('my-datapack')
  expect(config!.project?.namespace).toBe('my_pack')
  expect(config!.project?.['mc-version']).toBe('1.21.4')
  expect(config!.project?.description).toBe('My awesome datapack')
  fs.rmSync(dir, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 3: Parses [compiler] section correctly
// ──────────────────────────────────────────────────────────────────────────────
test('parses [compiler] section fields correctly', () => {
  const dir = makeTmpDir()
  writeToml(dir, `
[compiler]
optimization = 2
include-dirs = ["src/shared", "src/stdlib"]
no-dce = false
`)
  const config = loadProjectConfig(dir)
  expect(config).not.toBeNull()
  expect(config!.compiler?.optimization).toBe(2)
  expect(config!.compiler?.['include-dirs']).toEqual(['src/shared', 'src/stdlib'])
  expect(config!.compiler?.['no-dce']).toBe(false)
  fs.rmSync(dir, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 4: Parses [output] section correctly
// ──────────────────────────────────────────────────────────────────────────────
test('parses [output] section fields correctly', () => {
  const dir = makeTmpDir()
  writeToml(dir, `
[output]
dir = "dist/"
`)
  const config = loadProjectConfig(dir)
  expect(config).not.toBeNull()
  expect(config!.output?.dir).toBe('dist/')
  fs.rmSync(dir, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 5: Full config — all sections together
// ──────────────────────────────────────────────────────────────────────────────
test('parses all sections in a full redscript.toml', () => {
  const dir = makeTmpDir()
  writeToml(dir, `
[project]
name = "my-datapack"
namespace = "my_pack"
mc-version = "1.21.4"
description = "My awesome datapack"

[compiler]
optimization = 2
include-dirs = ["src/shared", "src/stdlib"]
no-dce = false

[output]
dir = "dist/"
`)
  const config = loadProjectConfig(dir)
  expect(config).not.toBeNull()
  expect(config!.project?.namespace).toBe('my_pack')
  expect(config!.compiler?.optimization).toBe(2)
  expect(config!.output?.dir).toBe('dist/')
  fs.rmSync(dir, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 6: Walks up the directory tree (sub-directory can find parent toml)
// ──────────────────────────────────────────────────────────────────────────────
test('finds redscript.toml by walking up the directory tree', () => {
  const rootDir = makeTmpDir()
  writeToml(rootDir, `
[project]
namespace = "parent_pack"
`)
  // Create a nested sub-directory (simulating src/nested)
  const subDir = path.join(rootDir, 'src', 'nested')
  fs.mkdirSync(subDir, { recursive: true })

  // loadProjectConfig called from subDir should find the toml in rootDir
  const config = loadProjectConfig(subDir)
  expect(config).not.toBeNull()
  expect(config!.project?.namespace).toBe('parent_pack')
  fs.rmSync(rootDir, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 7: CLI flags take priority over toml values (simulated merge)
// ──────────────────────────────────────────────────────────────────────────────
test('CLI flags override toml values when merged', () => {
  const dir = makeTmpDir()
  writeToml(dir, `
[project]
namespace = "toml_namespace"
mc-version = "1.21.0"
description = "From TOML"

[output]
dir = "dist/"
`)
  const tomlConfig = loadProjectConfig(dir)
  expect(tomlConfig).not.toBeNull()

  // Simulate CLI merge logic: CLI args take priority
  const cliNamespace = 'cli_namespace'          // provided by CLI
  const cliMcVersion: string | undefined = undefined  // not provided by CLI
  const cliOutput: string | undefined = undefined     // not provided by CLI

  const namespace = cliNamespace ?? tomlConfig!.project?.namespace ?? 'default'
  const mcVersion = cliMcVersion ?? tomlConfig!.project?.['mc-version'] ?? '1.21'
  const outputDir = cliOutput ?? tomlConfig!.output?.dir ?? './dist'

  expect(namespace).toBe('cli_namespace')   // CLI wins
  expect(mcVersion).toBe('1.21.0')          // falls back to toml
  expect(outputDir).toBe('dist/')           // falls back to toml

  fs.rmSync(dir, { recursive: true })
})

// ──────────────────────────────────────────────────────────────────────────────
// Test 8: buildTomlTemplate generates valid parseable content
// ──────────────────────────────────────────────────────────────────────────────
test('buildTomlTemplate generates a parseable template', () => {
  const dir = makeTmpDir()
  const template = buildTomlTemplate('test_pack')
  fs.writeFileSync(path.join(dir, 'redscript.toml'), template, 'utf-8')

  const config = loadProjectConfig(dir)
  expect(config).not.toBeNull()
  expect(config!.project?.name).toBe('test_pack')
  expect(config!.project?.namespace).toBe('test_pack')
  expect(config!.project?.['mc-version']).toBe('1.21.4')
  expect(config!.output?.dir).toBe('dist/')

  fs.rmSync(dir, { recursive: true })
})
