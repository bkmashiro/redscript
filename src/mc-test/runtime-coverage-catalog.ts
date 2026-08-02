import * as fs from 'fs'
import * as path from 'path'

import { Lexer } from '../lexer'
import { Parser } from '../parser'

export type RuntimeCatalogDeclarationKind =
  | 'function'
  | 'method'
  | 'constant'
  | 'enum'
  | 'struct'

export interface RuntimeCatalogEntry {
  readonly id: string
  readonly module: string
  readonly sourcePath: string
  readonly kind: RuntimeCatalogDeclarationKind
  readonly name: string
  readonly owner?: string
  readonly internal: boolean
  readonly requiresRuntimeProbe: boolean
}

export interface RuntimeCoverageCatalog {
  readonly schemaVersion: 1
  readonly modules: readonly string[]
  readonly entries: readonly RuntimeCatalogEntry[]
}

function bytewiseCompare(left: string, right: string): number {
  const leftBytes = Buffer.from(left, 'utf8')
  const rightBytes = Buffer.from(right, 'utf8')
  return Buffer.compare(leftBytes, rightBytes)
}

function declarationId(
  moduleName: string,
  kind: RuntimeCatalogDeclarationKind,
  name: string,
  owner?: string,
): string {
  return ['stdlib', moduleName, kind, owner, name].filter(Boolean).join('.')
}

function entry(
  moduleName: string,
  sourcePath: string,
  kind: RuntimeCatalogDeclarationKind,
  name: string,
  owner?: string,
): RuntimeCatalogEntry {
  const internal = name.startsWith('_')
  return Object.freeze({
    id: declarationId(moduleName, kind, name, owner),
    module: moduleName,
    sourcePath,
    kind,
    name,
    ...(owner == null ? {} : { owner }),
    internal,
    requiresRuntimeProbe: (kind === 'function' || kind === 'method') && !internal,
  })
}

export function buildStdlibRuntimeCatalog(stdlibDir: string): RuntimeCoverageCatalog {
  const root = path.resolve(stdlibDir)
  const moduleFiles = fs.readdirSync(root)
    .filter(fileName => fileName.endsWith('.mcrs'))
    .sort(bytewiseCompare)

  const entries: RuntimeCatalogEntry[] = []
  for (const fileName of moduleFiles) {
    const moduleName = fileName.slice(0, -'.mcrs'.length)
    const sourcePath = path.join(root, fileName)
    const source = fs.readFileSync(sourcePath, 'utf8')
    const program = new Parser(new Lexer(source).tokenize()).parse(moduleName)

    for (const declaration of program.declarations) {
      entries.push(entry(moduleName, sourcePath, 'function', declaration.name))
    }
    for (const implBlock of program.implBlocks) {
      for (const method of implBlock.methods) {
        entries.push(entry(moduleName, sourcePath, 'method', method.name, implBlock.typeName))
      }
    }
    for (const constant of program.consts) {
      entries.push(entry(moduleName, sourcePath, 'constant', constant.name))
    }
    for (const enumDeclaration of program.enums) {
      entries.push(entry(moduleName, sourcePath, 'enum', enumDeclaration.name))
    }
    for (const structDeclaration of program.structs) {
      entries.push(entry(moduleName, sourcePath, 'struct', structDeclaration.name))
    }
  }

  entries.sort((left, right) => bytewiseCompare(left.id, right.id))
  const seen = new Set<string>()
  for (const catalogEntry of entries) {
    if (seen.has(catalogEntry.id)) {
      throw new Error(`Duplicate runtime coverage catalog id '${catalogEntry.id}'`)
    }
    seen.add(catalogEntry.id)
  }

  return Object.freeze({
    schemaVersion: 1,
    modules: Object.freeze(moduleFiles.map(fileName => fileName.slice(0, -'.mcrs'.length))),
    entries: Object.freeze(entries),
  })
}
