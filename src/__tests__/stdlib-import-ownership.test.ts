import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { compile } from '../compile'

test.each([' ', '\n'])('explicit stdlib ownership is unchanged by import line layout (%p)', separator => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-stdlib-owner-'))
  try {
    fs.mkdirSync(path.join(root, 'stdlib'))
    fs.writeFileSync(path.join(root, 'stdlib/math.mcrs'), 'module library; fn shadow_only(): void {}')
    expect(() => compile(`import "stdlib/math";${separator}fn main(): void { shadow_only(); }`, {
      namespace: 'ownership', filePath: path.join(root, 'main.mcrs'),
    })).toThrow(/Unknown function 'shadow_only'/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
