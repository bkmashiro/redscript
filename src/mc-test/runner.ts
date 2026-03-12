/**
 * RedScript MC Integration Test Runner
 *
 * Compiles a .rs file, installs it to a running Paper server,
 * runs test scenarios, and reports results.
 *
 * Usage:
 *   npx ts-node src/mc-test/runner.ts src/examples/counter.rs
 *
 * Requires:
 *   - Paper server running with TestHarnessPlugin
 *   - MC_SERVER_DIR env var pointing to server directory
 *   - MC_HOST and MC_PORT env vars (default: localhost:25561)
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { MCTestClient } from './client'
import { compile } from '../compile'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')

export interface TestCase {
  name: string
  run: (mc: MCTestClient) => Promise<void>
}

export interface TestResult {
  name: string
  passed: boolean
  error?: string
  durationMs: number
}

export async function runMCTests(
  sourceFile: string,
  tests: TestCase[],
  options: { skipInstall?: boolean } = {}
): Promise<TestResult[]> {
  const mc = new MCTestClient(MC_HOST, MC_PORT)

  // Check server is online
  console.log(`Connecting to MC server at ${MC_HOST}:${MC_PORT}...`)
  const online = await mc.isOnline()
  if (!online) {
    throw new Error(`MC server not reachable at ${MC_HOST}:${MC_PORT}. Start Paper server first.`)
  }
  console.log('✓ Server online')

  if (!options.skipInstall) {
    // Compile and install datapack
    const outDir = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')
    console.log(`Compiling ${sourceFile}...`)
    const result = compile(fs.readFileSync(sourceFile, 'utf-8'))
    if (!result.success || !result.files) {
      throw result.error ?? new Error('Compilation failed')
    }
    // Write files
    fs.mkdirSync(outDir, { recursive: true })
    for (const file of result.files) {
      const filePath = path.join(outDir, file.path)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, file.content)
    }
    console.log(`✓ Datapack installed to ${outDir}`)

    // Reload datapacks
    await mc.command('/reload')
    await mc.ticks(40) // wait 2s for reload
    console.log('✓ Datapacks reloaded')
  }

  // Run tests
  const results: TestResult[] = []
  for (const test of tests) {
    await mc.reset() // clear logs before each test
    const start = Date.now()
    try {
      await test.run(mc)
      results.push({ name: test.name, passed: true, durationMs: Date.now() - start })
      console.log(`  ✓ ${test.name} (${Date.now() - start}ms)`)
    } catch (err: any) {
      results.push({
        name: test.name,
        passed: false,
        error: err.message,
        durationMs: Date.now() - start
      })
      console.log(`  ✗ ${test.name}: ${err.message}`)
    }
  }

  // Summary
  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed
  console.log(`\nResults: ${passed}/${results.length} passed${failed > 0 ? ` (${failed} FAILED)` : ''}`)

  return results
}

// CLI entry point
if (require.main === module) {
  const sourceFile = process.argv[2]
  if (!sourceFile) {
    console.error('Usage: ts-node runner.ts <source.rs>')
    process.exit(1)
  }

  // Example test suite (replace with actual tests)
  const exampleTests: TestCase[] = [
    {
      name: 'server is online',
      run: async (mc) => {
        const status = await mc.status()
        if (!status.online) throw new Error('Server not online')
      }
    },
    {
      name: 'datapack loads without errors',
      run: async (mc) => {
        await mc.command('/reload')
        await mc.ticks(20)
        // If reload didn't crash, we're good
      }
    }
  ]

  runMCTests(sourceFile, exampleTests)
    .then(results => {
      const failed = results.filter(r => !r.passed)
      process.exit(failed.length > 0 ? 1 : 0)
    })
    .catch(err => {
      console.error(err.message)
      process.exit(1)
    })
}
