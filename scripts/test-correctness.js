#!/usr/bin/env node
// Keep project ignores when adding the no-benchmark filter. A Jest CLI override
// alone would replace them and accidentally collect helpers/integration tests.
const path = require('path')
const { spawnSync } = require('child_process')
const root = path.resolve(__dirname, '..')
const config = require(path.join(root, 'jest.config.js'))
const unit = config.projects.find(project => project.displayName === 'unit')
if (!unit) throw new Error('unit Jest project not configured')
const ignored = [...(unit.testPathIgnorePatterns ?? []), 'benchmark', 'perf']
const result = spawnSync(process.execPath, [
  require.resolve('jest/bin/jest'),
  '--selectProjects', 'unit', '--runInBand',
  '--testPathIgnorePatterns', ignored.join('|'),
  ...process.argv.slice(2),
], { cwd: root, env: { ...process.env, MC_OFFLINE: 'true' }, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
