import esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const watch = process.argv.includes('--watch')

const common = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  minify: false,
}

// Extension host bundle
const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  external: ['vscode'],
}

// LSP server bundle — bundled separately so it runs in a clean Node process.
// The server is located in the monorepo root (../../src/lsp/main.ts).
const lspServerConfig = {
  ...common,
  entryPoints: [path.join(__dirname, '../../src/lsp/main.ts')],
  outfile: 'out/lsp-server.js',
  // No 'vscode' external — LSP server doesn't use vscode API
}

if (watch) {
  const [extCtx, lspCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(lspServerConfig),
  ])
  await Promise.all([extCtx.watch(), lspCtx.watch()])
  console.log('Watching for changes...')
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(lspServerConfig),
  ])
  console.log('Built out/extension.js + out/lsp-server.js')
}
