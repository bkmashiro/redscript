function readPackEntry(parsed) {
  const entries = Array.isArray(parsed) ? parsed
    : parsed && typeof parsed === 'object' ? ('filename' in parsed ? [parsed] : Object.values(parsed)) : []
  if (entries.length !== 1) throw new Error('`npm pack` must return exactly one package record')
  const entry = entries[0]
  if (!entry || typeof entry.filename !== 'string' || !entry.filename) throw new Error('`npm pack` returned no tarball filename')
  return entry
}
function assertPackFilePolicy(entry) {
  if (!Array.isArray(entry.files)) throw new Error('`npm pack` returned no file manifest')
  const paths = entry.files.map(file => file.path)
  const unsafe = paths.filter(name => typeof name !== 'string' || /(^|\/)(\.hermes|\.claude|__tests__)(\/|$)|^dist\/tests\/|(^|\/)(AGENTS|CLAUDE)\.md$|(^|\/)\.env(?:\.|$)/.test(name))
  if (unsafe.length) throw new Error(`Unsafe package paths: ${unsafe.join(', ')}`)
  for (const required of ['dist/src/index.js', 'dist/src/cli.js', 'dist/src/lsp/main.js', 'src/stdlib/math.mcrs', 'src/stdlib/cooldown.mcrs', 'builtins.d.mcrs']) {
    if (!paths.includes(required)) throw new Error(`Missing package runtime file: ${required}`)
  }
}
module.exports = { readPackEntry, assertPackFilePolicy }
