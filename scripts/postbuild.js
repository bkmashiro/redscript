#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

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
