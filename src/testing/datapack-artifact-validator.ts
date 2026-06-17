import type { DatapackFile } from '../emit'

interface DatapackValidationError {
  file?: string
  line?: number
  message: string
}

export interface DatapackValidationResult {
  valid: boolean
  errors: DatapackValidationError[]
}

interface FunctionRef {
  raw: string
  namespace: string
  id: string
}

const FUNCTION_FILE_RE = /^data\/([^/]+)\/functions?\/(.+)\.mcfunction$/
const FUNCTION_TAG_LOAD_PATHS = ['data/minecraft/tags/function/load.json', 'data/minecraft/tags/functions/load.json']
const FUNCTION_TAG_TICK_PATHS = ['data/minecraft/tags/function/tick.json', 'data/minecraft/tags/functions/tick.json']

const FUNCTION_ID_RE = /^([0-9a-z_.-]+):([0-9a-z_./-]+)$/

function addError(errors: DatapackValidationError[], message: string, file?: string, line?: number): void {
  errors.push({ file, line, message })
}

function validatePath(path: string, errors: DatapackValidationError[]): void {
  const absoluteLike = path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
  if (absoluteLike) {
    addError(errors, `Invalid file path: expected relative path, found absolute '${path}'`, path)
    return
  }

  if (path.includes('\\')) {
    addError(errors, `Invalid file path: backslash is not allowed in datapack paths '${path}'`, path)
    return
  }

  const parts = path.split('/')
  if (parts.includes('..')) {
    addError(errors, `Invalid file path: '..' segment is not allowed '${path}'`, path)
  }
}

function normalizeFunctionId(raw: string): string {
  return raw.toLowerCase()
}

function parseFunctionRef(raw: string): FunctionRef | null {
  const normalized = normalizeFunctionId(raw)
  const match = normalized.match(FUNCTION_ID_RE)
  if (!match) {
    return null
  }

  const [, namespace] = match
  return {
    raw,
    namespace,
    id: normalized,
  }
}

function isWildcardReference(reference: FunctionRef): boolean {
  return reference.id.endsWith(':*')
}

function isGeneratedNamespace(reference: FunctionRef, generatedNamespaces: Set<string>): boolean {
  return generatedNamespaces.has(reference.namespace.toLowerCase())
}

function extractTaggedFunctionRefs(
  rawValues: unknown,
  errors: DatapackValidationError[],
  tagPath: string,
): string[] {
  if (!Array.isArray(rawValues)) {
    addError(errors, 'Tag file values must be an array', tagPath)
    return []
  }

  const ids: string[] = []
  for (const entry of rawValues) {
    if (typeof entry !== 'string') {
      addError(errors, `Tag file contains non-string value: ${String(entry)}`, tagPath)
      continue
    }

    if (entry.startsWith('#')) {
      continue
    }

    const parsed = parseFunctionRef(entry)
    if (!parsed) {
      addError(errors, `Tag value is not a valid function id: ${entry}`, tagPath)
      continue
    }

    ids.push(parsed.id)
  }

  return ids
}

function collectMatches(line: string, pattern: RegExp): string[] {
  const refs: string[] = []
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    if (match[1]) {
      refs.push(normalizeFunctionId(match[1]))
    }
  }
  return refs
}

function extractFunctionRefsFromLine(line: string): string[] {
  const functionPattern = /\bfunction\s+([^\s#]+)(?:\s+with\s+storage\s+([^\s#]+))?/g
  return Array.from(new Set(collectMatches(line, functionPattern)))
}

export function validateDatapackArtifact(files: DatapackFile[]): DatapackValidationResult {
  const errors: DatapackValidationError[] = []

  const functionIds = new Set<string>()
  const generatedNamespaces = new Set<string>()
  let hasPackMcmeta = false

  for (const file of files) {
    validatePath(file.path, errors)

    const match = file.path.match(FUNCTION_FILE_RE)
    if (match) {
      const namespace = match[1].toLowerCase()
      const pathPart = match[2].toLowerCase()
      generatedNamespaces.add(namespace)
      functionIds.add(normalizeFunctionId(`${namespace}:${pathPart}`))
    }

    if (file.path === 'pack.mcmeta') {
      hasPackMcmeta = true
      let parsed: unknown
      try {
        parsed = JSON.parse(file.content)
      } catch {
        addError(errors, 'pack.mcmeta is not valid JSON', file.path)
        continue
      }

      const candidate = parsed as { pack?: { pack_format?: unknown } }
      if (!candidate?.pack || typeof candidate.pack !== 'object' || candidate.pack === null) {
        addError(errors, 'pack.mcmeta does not contain pack metadata object', file.path)
        continue
      }

      if (typeof candidate.pack.pack_format !== 'number') {
        addError(errors, 'pack.mcmeta.pack.pack_format must be a number', file.path)
      }
    }
  }

  if (!hasPackMcmeta) {
    addError(errors, 'Missing required file: pack.mcmeta', 'pack.mcmeta')
  }

  const allTagPaths = [...FUNCTION_TAG_LOAD_PATHS, ...FUNCTION_TAG_TICK_PATHS]
  for (const tagPath of allTagPaths) {
    const tagFile = files.find(file => file.path === tagPath)
    if (!tagFile) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(tagFile.content)
    } catch {
      addError(errors, `Invalid JSON in ${tagPath}`, tagPath)
      continue
    }

    const value = (parsed as { values?: unknown }).values
    const references = extractTaggedFunctionRefs(value, errors, tagPath)
    for (const ref of references) {
      const parsedRef = parseFunctionRef(ref)
      if (!parsedRef) {
        continue
      }

      if (isWildcardReference(parsedRef)) {
        continue
      }

      if (parsedRef.namespace.toLowerCase() === 'minecraft') {
        continue
      }

      if (isGeneratedNamespace(parsedRef, generatedNamespaces) && !functionIds.has(parsedRef.id)) {
        addError(errors, `Tag ${tagPath} references missing local function '${parsedRef.id}'`, tagFile.path)
      }
    }
  }

  for (const file of files.filter(f => f.path.endsWith('.mcfunction'))) {
    const lines = file.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('$')) {
        continue
      }

      const refs = extractFunctionRefsFromLine(trimmed)
      for (const ref of refs) {
        const parsedRef = parseFunctionRef(ref)
        if (!parsedRef) {
          addError(errors, `Invalid function reference in command: ${ref}`, file.path, i + 1)
          continue
        }

        if (!isGeneratedNamespace(parsedRef, generatedNamespaces)) {
          continue
        }

        if (!functionIds.has(parsedRef.id)) {
          addError(
            errors,
            `Unresolved local function reference '${parsedRef.id}'`,
            file.path,
            i + 1,
          )
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
