import * as fs from 'fs'
import * as path from 'path'

export interface DiscoveredProjectManifest {
  rootDir: string
  manifestPath: string
}

function startingDirectory(startPath: string): string {
  const absolute = path.resolve(startPath)
  try {
    return fs.statSync(absolute).isDirectory() ? absolute : path.dirname(absolute)
  } catch {
    // Callers often ask discovery about an output or source path that has not
    // been created yet. Treat it as a directory unless it clearly names a file.
    return path.extname(absolute) === '' ? absolute : path.dirname(absolute)
  }
}

/** Find the nearest redscript.toml without crossing a filesystem root. */
export function discoverProjectManifest(startPath: string): DiscoveredProjectManifest | null {
  let directory = startingDirectory(startPath)

  while (true) {
    const manifestPath = path.join(directory, 'redscript.toml')
    if (fs.existsSync(manifestPath)) {
      return { rootDir: directory, manifestPath }
    }

    const parent = path.dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}
