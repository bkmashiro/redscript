import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { compile } from '../index'

const root = path.resolve(__dirname, '../..')

function compileOutsideCheckout(source: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-readme-'))
  try {
    const filePath = path.join(dir, 'main.mcrs')
    fs.writeFileSync(filePath, source)
    const result = compile(source, { namespace: 'readme_check', filePath })
    expect(result.files.length).toBeGreaterThan(0)
    const defined = new Set(result.files.map(file => file.path.match(/^data\/([^/]+)\/functions?\/(.*)\.mcfunction$/))
      .filter((match): match is RegExpMatchArray => match !== null).map(match => `${match[1]}:${match[2]}`))
    for (const file of result.files) {
      for (const call of file.content.matchAll(/\bfunction\s+(readme_check:[a-z0-9_./-]+)/g)) {
        expect(defined.has(call[1])).toBe(true)
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('README hero snippet resolves stdlib outside the source checkout', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  const demo = readme.split('## See it in action')[1].match(/```rs\n([\s\S]*?)```/)![1]
  compileOutsideCheckout(demo)
})

test.each(['README.md', 'README.zh.md'])('%s module-table example is a working import and call', file => {
  const readme = fs.readFileSync(path.join(root, file), 'utf8')
  const cell = readme.match(/\| (?:Modules|模块) \| `([^`]+)`/)![1]
  const split = cell.indexOf(';') + 1
  compileOutsideCheckout(`${cell.slice(0, split)}\nfn main(): void { ${cell.slice(split)} }`)
})
