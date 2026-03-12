/**
 * MC Test Setup Script
 *
 * Pre-compiles all RedScript test fixtures into the datapack directory.
 * Run this ONCE before starting the Paper server, or before running tests
 * with a fresh server.
 *
 * Usage:
 *   MC_SERVER_DIR=~/mc-test-server npx ts-node src/mc-test/setup.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'

const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')
const EXAMPLES_DIR = path.join(__dirname, '../examples')

function writeFixture(source: string, namespace: string): void {
  const result = compile(source, { namespace })
  let fileCount = 0
  for (const file of result.files ?? []) {
    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, file.content)
    fileCount++
  }
  console.log(`  ✓ ${namespace} (${fileCount} files)`)
}

function main() {
  console.log(`Setting up MC test fixtures in:\n  ${DATAPACK_DIR}\n`)
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })

  // Example files
  const exampleNamespaces = ['counter', 'world_manager']
  for (const ns of exampleNamespaces) {
    const file = path.join(EXAMPLES_DIR, `${ns}.rs`)
    if (fs.existsSync(file)) {
      writeFixture(fs.readFileSync(file, 'utf-8'), ns)
    } else {
      console.log(`  ⚠ ${ns}.rs not found, skipping`)
    }
  }

  // Inline test fixtures
  writeFixture(`
    @tick
    fn on_tick() {
      scoreboard_set("#tick_counter", "ticks", scoreboard_get("#tick_counter", "ticks") + 1)
    }
  `, 'tick_test')

  writeFixture(`
    fn check_score() {
      let x: int = scoreboard_get("#check_x", "test_score")
      if (x > 5) {
        scoreboard_set("#check_x", "result", 1)
      } else {
        scoreboard_set("#check_x", "result", 0)
      }
    }
  `, 'inline_test')

  console.log('\n✅ All fixtures written. Restart the MC server to load them.')
  console.log('   Then run: MC_SERVER_DIR=... npx jest mc-integration --testTimeout=60000')
}

main()
