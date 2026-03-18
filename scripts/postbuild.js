#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const shims = [
  ['dist/cli.js', './src/cli'],
  ['dist/index.js', './src/index'],
  ['dist/compile.js', './src/compile'],
]

for (const [outPath, target] of shims) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `// shim — delegates to dist/src/\nmodule.exports = require('${target}');\n`)
}
console.log('postbuild: shims written')

// Auto-package VSCode extension after every build
const vscodeDir = path.join(__dirname, '..', 'editors', 'vscode')
if (fs.existsSync(vscodeDir)) {
  try {
    console.log('postbuild: packaging VSCode extension...')
    execSync('npm run package', { cwd: vscodeDir, stdio: 'pipe' })
    // Find the newly created vsix
    const vsixFiles = fs.readdirSync(vscodeDir)
      .filter(f => f.endsWith('.vsix'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(vscodeDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    if (vsixFiles.length > 0) {
      console.log(`postbuild: vsix ready → editors/vscode/${vsixFiles[0].name}`)
    }
  } catch (e) {
    console.warn('postbuild: vsix packaging failed (non-fatal):', e.message)
  }
}
