import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'

describe('check CLI --fix', () => {
  const cliPath = path.resolve(__dirname, '..', 'cli.ts')
  const cliRunner = [require.resolve('ts-node/register/transpile-only')]

  function runCheckFix(filePath: string, extraArgs: string[] = []) {
    return spawnSync(
      process.execPath,
      ['-r', ...cliRunner, cliPath, 'check', filePath, '--fix', ...extraArgs],
      {
        encoding: 'utf-8',
        env: { ...process.env, REDSCRIPT_NO_UPDATE_CHECK: '1' },
      }
    )
  }

  test('removes an unused named import', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const filePath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(filePath, 'import lib::helper;\n\nfn main() {\n  say("ok");\n}\n')

    const result = runCheckFix(filePath)

    expect(result.status).toBe(0)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('\nfn main() {\n  say("ok");\n}\n')
    expect(result.stdout).toContain('Removed unused imports: 1')
  })

  test('keeps a used import', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const libPath = path.join(tempDir, 'lib.mcrs')
    const filePath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(libPath, 'module lib;\nexport fn helper(): int {\n  return 1;\n}\n')
    fs.writeFileSync(filePath, 'import lib::helper;\n\nfn main(): int {\n  return helper();\n}\n')

    const result = runCheckFix(filePath)

    expect(result.status).toBe(0)
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('import lib::helper;')
    expect(result.stdout).toContain('Removed unused imports: 0')
  })

  test('removes an always-true dead branch', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const filePath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(filePath, 'fn main() {\n  if true {\n    say("live");\n  } else {\n    say("dead");\n  }\n}\n')

    const result = runCheckFix(filePath)

    expect(result.status).toBe(0)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('fn main() {\n  say("live");\n}\n')
    expect(result.stdout).toContain('Removed dead branches: 1')
  })

  test('removes an always-false dead branch and keeps else body', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const filePath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(filePath, 'fn main() {\n  if 1 == 2 {\n    say("dead");\n  } else {\n    say("live");\n  }\n}\n')

    const result = runCheckFix(filePath)

    expect(result.status).toBe(0)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('fn main() {\n  say("live");\n}\n')
  })

  test('removes an always-false dead branch without else', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const filePath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(filePath, 'fn main() {\n  if false {\n    say("dead");\n  }\n  say("live");\n}\n')

    const result = runCheckFix(filePath)

    expect(result.status).toBe(0)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('fn main() {\n  say("live");\n}\n')
  })

  test('replaces an always-false branch with else-if content', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const filePath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(filePath, 'fn main() {\n  if false {\n    say("dead");\n  } else if true {\n    say("live");\n  }\n}\n')

    const result = runCheckFix(filePath)

    expect(result.status).toBe(0)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('fn main() {\n  if true {\n    say("live");\n  }\n}\n')
  })

  test('annotates magic numbers once', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const filePath = path.join(tempDir, 'main.mcrs')
    fs.writeFileSync(filePath, 'fn main(): int {\n  return 42;\n}\n')

    const first = runCheckFix(filePath)
    const second = runCheckFix(filePath)
    const content = fs.readFileSync(filePath, 'utf-8')

    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(content).toBe('fn main(): int {\n  return 42; // FIXME: consider const\n}\n')
    expect(second.stdout).toContain('Annotated magic numbers: 0')
  })

  test('does not modify files when parsing fails', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-check-fix-'))
    const filePath = path.join(tempDir, 'main.mcrs')
    const source = 'fn main( {\n  return;\n}\n'
    fs.writeFileSync(filePath, source)

    const result = runCheckFix(filePath)

    expect(result.status).toBe(2)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(source)
  })
})
