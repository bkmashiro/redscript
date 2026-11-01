import * as fs from 'fs'
import * as path from 'path'

/** Compiler-owned data in source checkouts and installed npm layouts. */
export function getStdlibDir(): string {
  const candidates = [__dirname, path.resolve(__dirname, '../../../src/stdlib')]
  return candidates.find(dir => fs.existsSync(path.join(dir, 'math.mcrs'))) ?? candidates[0]
}

/** Only single known module names are aliases, never arbitrary filesystem paths. */
export function stdlibModuleName(specifier: string): string | undefined {
  const name = specifier.replace(/^stdlib\//, '').replace(/\.mcrs$/, '')
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return undefined
  return fs.existsSync(path.join(getStdlibDir(), `${name}.mcrs`)) ? name : undefined
}
