import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { compile } from '../emit/compile'

describe('stdlib include path', () => {
  it('import "stdlib/math" resolves to the stdlib math module', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-stdlib-'))
    const mainPath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(mainPath, 'import "stdlib/math";\nfn main() { let x: int = abs(-5); }\n')
    const source = fs.readFileSync(mainPath, 'utf-8')

    const result = compile(source, { namespace: 'test', filePath: mainPath })
    expect(result.files.some(f => f.path.includes('abs'))).toBe(true)
  })

  it('import "stdlib/math.mcrs" also resolves (explicit extension)', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-stdlib-'))
    const mainPath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(mainPath, 'import "stdlib/math.mcrs";\nfn main() { let x: int = abs(-5); }\n')
    const source = fs.readFileSync(mainPath, 'utf-8')

    const result = compile(source, { namespace: 'test', filePath: mainPath })
    expect(result.files.some(f => f.path.includes('abs'))).toBe(true)
  })

  it('import "stdlib/vec" resolves to the stdlib vec module', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-stdlib-'))
    const mainPath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(mainPath, 'import "stdlib/vec";\nfn main() { let d: int = dot2d(1, 2, 3, 4); }\n')
    const source = fs.readFileSync(mainPath, 'utf-8')

    const result = compile(source, { namespace: 'test', filePath: mainPath })
    expect(result.files.some(f => f.path.includes('dot2d'))).toBe(true)
  })

  it('non-existent stdlib module gives a clear error', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-stdlib-'))
    const mainPath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(mainPath, 'import "stdlib/nonexistent";\nfn main() {}\n')
    const source = fs.readFileSync(mainPath, 'utf-8')

    expect(() => compile(source, { namespace: 'test', filePath: mainPath }))
      .toThrow(/Cannot import/)
  })

  it('--include flag allows importing from custom directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-include-'))
    const libDir = path.join(tempDir, 'mylibs')
    fs.mkdirSync(libDir)
    const mainPath = path.join(tempDir, 'main.mcrs')
    const libPath = path.join(libDir, 'helpers.mcrs')

    fs.writeFileSync(libPath, 'fn triple(x: int) -> int { return x + x + x; }\n')
    fs.writeFileSync(mainPath, 'import "helpers";\nfn main() { let x: int = triple(3); }\n')
    const source = fs.readFileSync(mainPath, 'utf-8')

    const result = compile(source, { namespace: 'test', filePath: mainPath, includeDirs: [libDir] })
    expect(result.files.some(f => f.path.includes('triple'))).toBe(true)
  })
})
