#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const { buildStdlibRuntimeCatalog } = require(path.join(
  repoRoot,
  'dist',
  'src',
  'mc-test',
  'runtime-coverage-catalog.js',
))

const catalog = buildStdlibRuntimeCatalog(path.join(repoRoot, 'src', 'stdlib'))
const entries = catalog.entries
const runtimeRequired = entries.filter(entry => entry.requiresRuntimeProbe).map(entry => entry.id)
const internalFunctions = entries
  .filter(entry => (entry.kind === 'function' || entry.kind === 'method') && entry.internal)
  .map(entry => entry.id)
const compileOnly = entries
  .filter(entry => entry.kind === 'constant' || entry.kind === 'enum' || entry.kind === 'struct')
  .map(entry => entry.id)

const output = path.join(repoRoot, 'docs', 'plans', 'mcrs-runtime-coverage-manifest.json')
const existing = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {}
const scenarioMappings = existing.scenarioMappings ?? {}
const requiredSet = new Set(runtimeRequired)
const retiredMappings = Object.keys(scenarioMappings).filter(id => !requiredSet.has(id))
if (retiredMappings.length > 0) {
  throw new Error(`Review retired runtime mappings before regeneration: ${retiredMappings.join(', ')}`)
}

const manifest = {
  ...existing,
  schemaVersion: 1,
  scope: 'src/stdlib/*.mcrs',
  ordering: 'bytewise',
  inventory: {
    modules: catalog.modules.length,
    totalFunctionsAndMethods: runtimeRequired.length + internalFunctions.length,
    publicRuntimeRequired: runtimeRequired.length,
    internalFunctionsAndMethods: internalFunctions.length,
    exportedConstants: entries.filter(entry => entry.kind === 'constant').length,
  },
  runtimeRequired,
  internalFunctions,
  compileOnly,
  scenarioMappings,
  expectedMissingRuntimeCount: runtimeRequired.filter(id => !scenarioMappings[id]).length,
}

fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${path.relative(repoRoot, output)}: ${runtimeRequired.length} runtime-required, ${internalFunctions.length} internal, ${compileOnly.length} compile-only`)
