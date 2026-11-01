/**
 * docs.ts — helpers for the `redscript docs` CLI command.
 *
 * Extracted as a separate module so tests can import without running main().
 */

import { execSync } from 'child_process'

/** Base URL for the hosted RedScript documentation site. */
export const DOCS_BASE_URL = 'https://redscript-docs.pages.dev'

/**
 * All shipped stdlib module names, grouped for CLI display.
 */
export const STDLIB_MODULES: string[] = [
  // Mathematics
  'math', 'math_hp', 'bits', 'bigint', 'calculus', 'linalg', 'ode', 'fft',
  // Data Structures
  'list', 'sets', 'set_int', 'map', 'queue', 'heap', 'graph', 'sort', 'result', 'matrix', 'vec', 'quaternion',
  // Randomness & Statistics
  'random', 'noise',
  // Signal Processing
  'signal', 'expr',
  // Geometry & Graphics
  'geometry', 'advanced', 'parabola', 'easing', 'particles', 'color', 'pathfind',
  // Physics
  'physics',
  // Minecraft Mechanics
  'player', 'mobs', 'combat', 'effects', 'spawn', 'interactions',
  'inventory', 'bossbar', 'cooldown', 'state', 'timer', 'tags',
  'teams', 'world', 'ecs', 'events', 'dialog', 'scheduler',
]

/**
 * Build the documentation URL for the given module (or the stdlib index).
 *
 * @param module  Optional module name (e.g. "math")
 * @returns Full URL string
 */
export function buildDocsUrl(module?: string): string {
  if (module) {
    return `${DOCS_BASE_URL}/en/stdlib/${module}`
  }
  return `${DOCS_BASE_URL}/en/stdlib/`
}

/**
 * Open the given URL in the system default browser.
 *
 * Throws if the underlying command fails.
 */
export function openUrl(url: string): void {
  const { platform } = process
  let cmd: string
  if (platform === 'win32') {
    cmd = `start "" "${url}"`
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`
  } else {
    // Linux / other POSIX
    cmd = `xdg-open "${url}"`
  }
  execSync(cmd, { stdio: 'ignore' })
}

/**
 * Execute the `redscript docs` command.
 *
 * @param module   Optional stdlib module name to jump to directly
 * @param list     If true, print all available module names and return
 * @param _open    Injectable open function (used in tests to suppress browser)
 */
export function docsCommand(
  module?: string,
  list = false,
  _open: (url: string) => void = openUrl,
): void {
  if (list) {
    console.log('Available stdlib modules:\n')
    for (const mod of STDLIB_MODULES) {
      console.log(`  ${mod}`)
    }
    return
  }

  if (module && !STDLIB_MODULES.includes(module)) {
    console.warn(`Warning: '${module}' is not a known stdlib module. Opening docs anyway.`)
  }

  const url = buildDocsUrl(module)
  console.log(`Opening docs: ${url}`)

  try {
    _open(url)
  } catch {
    console.error(`Could not open browser automatically. Visit:\n  ${url}`)
  }
}
