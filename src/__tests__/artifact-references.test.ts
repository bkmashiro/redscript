import * as fs from 'fs'
import * as path from 'path'

import { compile, type DatapackFile } from '../compile'

const FUNCTION_ID_RE = /^([0-9a-z_.-]+):([0-9a-z_./-]+)$/
const FUNCTION_FILE_RE = /^data\/([^/]+)\/functions?\/(.+)\.mcfunction$/

const TAG_PATHS = {
  load: [
    'data/minecraft/tags/function/load.json',
    'data/minecraft/tags/functions/load.json',
  ],
  tick: [
    'data/minecraft/tags/function/tick.json',
    'data/minecraft/tags/functions/tick.json',
  ],
}

// Narrow emitted-command scan (no full command parser):
// - `function namespace:path`
// - `function namespace:path with storage ...`
// - `execute ... run function namespace:path`
const FUNCTION_REF_RE = /\bfunction\s+([0-9a-z_.-]+:[0-9a-z_./-]+)\b/g
const FUNCTION_WITH_STORAGE_RE = /\bfunction\s+([0-9a-z_.-]+:[0-9a-z_./-]+)\s+with\s+storage\s+[0-9a-z_.-:]+\b/g
const EXECUTE_RUN_FUNCTION_RE = /\bexecute\b[^#\n]*\brun\s+function\s+([0-9a-z_.-]+:[0-9a-z_./-]+)\b/g

const EXTERNAL_NAMESPACES = new Set(['minecraft'])

interface ParsedFunctionRef {
  namespace: string
  id: string
}

function normalize(raw: string): string {
  return raw.trim().toLowerCase()
}

function parseFunctionRef(raw: string): ParsedFunctionRef | null {
  const match = normalize(raw).match(FUNCTION_ID_RE)
  if (!match) {
    return null
  }

  const [, namespace, id] = match
  return {
    namespace,
    id: `${namespace}:${id}`,
  }
}

function collectEmittedFunctionIds(files: DatapackFile[]): Set<string> {
  const emitted = new Set<string>()
  for (const file of files) {
    const match = file.path.match(FUNCTION_FILE_RE)
    if (!match) continue

    const namespace = match[1].toLowerCase()
    const idPath = match[2].toLowerCase()
    emitted.add(`${namespace}:${idPath}`)
  }
  return emitted
}

function extractFunctionRefs(line: string): string[] {
  const refs = new Set<string>()
  for (const match of line.matchAll(FUNCTION_WITH_STORAGE_RE)) {
    refs.add(normalize(match[1]))
  }
  for (const match of line.matchAll(EXECUTE_RUN_FUNCTION_RE)) {
    refs.add(normalize(match[1]))
  }
  for (const match of line.matchAll(FUNCTION_REF_RE)) {
    refs.add(normalize(match[1]))
  }
  return [...refs]
}

function getTagFile(files: DatapackFile[], tagType: 'load' | 'tick'): DatapackFile | undefined {
  const candidates = TAG_PATHS[tagType]
  return files.find(file => candidates.includes(file.path))
}

function collectReferenceViolations(files: DatapackFile[], namespace: string): string[] {
  const emitted = collectEmittedFunctionIds(files)
  const expectedNamespace = namespace.toLowerCase()
  const violations: string[] = []

  for (const file of files.filter(file => file.path.endsWith('.mcfunction'))) {
    const lines = file.content.split('\n')
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const trimmed = lines[lineNumber].trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('$')) continue

      for (const rawRef of extractFunctionRefs(trimmed)) {
        const parsed = parseFunctionRef(rawRef)
        if (!parsed) continue
        if (parsed.namespace === expectedNamespace && !EXTERNAL_NAMESPACES.has(parsed.namespace)) {
          if (!emitted.has(parsed.id)) {
            violations.push(`${file.path}:${lineNumber + 1}: '${parsed.id}'`)
          }
        }
      }
    }
  }

  for (const tagType of ['load', 'tick'] as const) {
    const tagFile = getTagFile(files, tagType)
    if (!tagFile) continue

    let parsedTag: unknown
    try {
      parsedTag = JSON.parse(tagFile.content)
    } catch (err) {
      violations.push(`Invalid JSON in ${tagFile.path}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    const values = (parsedTag as { values?: unknown }).values
    if (!Array.isArray(values)) {
      violations.push(`${tagFile.path}: values must be an array`)
      continue
    }

    for (const value of values) {
      if (typeof value !== 'string') {
        violations.push(`Invalid ${tagType}.json value '${String(value)}' in ${tagFile.path}`)
        continue
      }
      if (value.startsWith('#')) continue
      const normalized = normalize(value)
      if (normalized.endsWith(':*')) continue
      const parsed = parseFunctionRef(normalized)
      if (!parsed) {
        violations.push(`Invalid ${tagType}.json value '${value}' in ${tagFile.path}`)
        continue
      }
      if (parsed.namespace === expectedNamespace && !EXTERNAL_NAMESPACES.has(parsed.namespace)) {
        if (!emitted.has(parsed.id)) {
          violations.push(`${tagFile.path}: '${parsed.id}'`)
        }
      }
    }
  }

  return violations
}

function mkDatapackFile(pathname: string, content: string): DatapackFile {
  return { path: pathname, content }
}

describe('artifact-reference guard for emitted datapacks', () => {
  const inlineSource = `
    fn check_threshold(value: int): int {
      if (value > 0) {
        return 1
      } else {
        return 0
      }
    }

    @load
    fn setup() {
      let _: int = check_threshold(1)
    }

    @tick
    fn heartbeat() {
      let _: int = check_threshold(0)
    }
  `

  const fixtures = [
    {
      label: 'inline control-flow fixture',
      namespace: 'p5_artifact_guard_inline',
      source: inlineSource,
      expectLoadTag: true,
      expectTickTag: true,
    },
    {
      label: 'existing macro fixture',
      namespace: 'p5_artifact_guard_macro',
      source: fs.readFileSync(
        path.join(__dirname, 'fixtures', 'macro-test.mcrs'),
        'utf-8',
      ),
    },
  ]

  test.each(fixtures)('$label', ({ namespace, source, expectLoadTag, expectTickTag }) => {
    const result = compile(source, { namespace })
    const violations = collectReferenceViolations(result.files, namespace)

    if (expectLoadTag) {
      const loadTag = getTagFile(result.files, 'load')
      expect(loadTag).toBeDefined()
    }
    if (expectTickTag) {
      const tickTag = getTagFile(result.files, 'tick')
      expect(tickTag).toBeDefined()
    }

    expect(violations).toEqual([])
  })

  test('flags same-namespace missing function references in emitted functions', () => {
    const files = [
      mkDatapackFile(
        'data/guard_ns/functions/caller.mcfunction',
        'function guard_ns:missing\n',
      ),
    ]

    const violations = collectReferenceViolations(files, 'guard_ns')

    expect(violations).toEqual([
      "data/guard_ns/functions/caller.mcfunction:1: 'guard_ns:missing'",
    ])
  })

  test('does not flag resolved execute run function references in the same namespace', () => {
    const files = [
      mkDatapackFile(
        'data/guard_ns/functions/caller.mcfunction',
        'execute as @e run function guard_ns:present\n',
      ),
      mkDatapackFile('data/guard_ns/functions/present.mcfunction', 'scoreboard players set score foo 0\n'),
    ]

    const violations = collectReferenceViolations(files, 'guard_ns')

    expect(violations).toEqual([])
  })

  test('flags missing same-namespace references in load/tick tag values', () => {
    const files = [
      mkDatapackFile(
        'data/minecraft/tags/function/load.json',
        JSON.stringify({ values: ['guard_ns:missing'] }),
      ),
      mkDatapackFile(
        'data/minecraft/tags/function/tick.json',
        JSON.stringify({ values: ['guard_ns:missing'] }),
      ),
    ]

    const violations = collectReferenceViolations(files, 'guard_ns')

    expect(violations).toEqual([
      "data/minecraft/tags/function/load.json: 'guard_ns:missing'",
      "data/minecraft/tags/function/tick.json: 'guard_ns:missing'",
    ])
  })

  test('flags invalid tag values for same-namespace tags', () => {
    const files = [
      mkDatapackFile(
        'data/minecraft/tags/function/load.json',
        JSON.stringify({ values: [123] }),
      ),
      mkDatapackFile(
        'data/minecraft/tags/function/tick.json',
        JSON.stringify({ values: ['not-a-function-id'] }),
      ),
    ]

    const violations = collectReferenceViolations(files, 'guard_ns')

    expect(violations).toEqual([
      "Invalid load.json value '123' in data/minecraft/tags/function/load.json",
      "Invalid tick.json value 'not-a-function-id' in data/minecraft/tags/function/tick.json",
    ])
  })

  test('ignores external namespace references even when checking same namespace', () => {
    const files = [mkDatapackFile('data/guard_ns/functions/caller.mcfunction', 'function minecraft:load\n')]
    const violations = collectReferenceViolations(files, 'minecraft')

    expect(violations).toEqual([])
  })
})
