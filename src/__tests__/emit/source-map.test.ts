import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { compile } from '../../index'
import type { NamespaceSourceMap, SourceMap } from '../../emit/sourcemap'

function getFile(files: ReturnType<typeof compile>['files'], filePath: string): string {
  const file = files.find(entry => entry.path === filePath)
  if (!file) {
    throw new Error(`Missing file: ${filePath}\nAvailable:\n${files.map(entry => entry.path).join('\n')}`)
  }
  return file.content
}

function compileWithSource(source: string, filePath = 'src/main.mcrs') {
  return compile(source, {
    namespace: 'trace',
    filePath,
    generateSourceMap: true,
  })
}

describe('emit source map output', () => {
  test('generates namespace sourcemap.json', () => {
    const result = compileWithSource(`
fn attack(target: string): void {
  say(target);
}
`)

    const map = JSON.parse(getFile(result.files, 'trace.sourcemap.json')) as NamespaceSourceMap
    expect(map.version).toBe(1)
    expect(map.sources).toEqual(['src/main.mcrs'])
  })

  test('mcfunction files include generated-from and source headers', () => {
    const result = compileWithSource(`
fn attack(target: string): void {
  say(target);
}
`)

    const fn = getFile(result.files, 'data/trace/function/attack.mcfunction')
    expect(fn).toContain('# Generated from: src/main.mcrs:2 (fn attack)')
    expect(fn).toContain('# Source: fn attack(target: string) -> void')
  })

  test('mcfunction files include src comments before semantic blocks', () => {
    const result = compileWithSource(`
fn attack(target: string): void {
  say("one");
  say(target);
}
`)

    const fn = getFile(result.files, 'data/trace/function/attack.mcfunction')
    expect(fn).toContain('# src: src/main.mcrs:3')
    expect(fn).toContain('# src: src/main.mcrs:4')
  })

  test('namespace sourcemap maps function names back to source names', () => {
    const result = compileWithSource(`
fn attack(target: string): void {
  say(target);
}
`)

    const map = JSON.parse(getFile(result.files, 'trace.sourcemap.json')) as NamespaceSourceMap
    expect(map.mappings['trace:attack']).toMatchObject({
      source: 0,
      line: 2,
      name: 'attack',
    })
  })

  test('supports multi-file namespace sourcemaps', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-sm-'))
    const srcDir = path.join(tempDir, 'src')
    fs.mkdirSync(srcDir, { recursive: true })
    const helperPath = path.join(srcDir, 'helper.mcrs')
    const mainPath = path.join(srcDir, 'main.mcrs')

    fs.writeFileSync(helperPath, `
fn support(): void {
  say("helper");
}
`)
    fs.writeFileSync(mainPath, `
import helper;

fn attack(): void {
  support();
}
`)

    const result = compile(fs.readFileSync(mainPath, 'utf-8'), {
      namespace: 'trace',
      filePath: mainPath,
      generateSourceMap: true,
    })

    const map = JSON.parse(getFile(result.files, 'trace.sourcemap.json')) as NamespaceSourceMap
    expect(map.sources).toEqual([mainPath, helperPath])
    expect(map.mappings['trace:attack']).toMatchObject({ source: 0, line: 4, name: 'attack' })
    expect(map.mappings['trace:support']).toMatchObject({ source: 1, line: 2, name: 'support' })
  })

  test('keeps per-file sourcemap sidecars', () => {
    const result = compileWithSource(`
fn attack(target: string): void {
  say(target);
}
`)

    const map = JSON.parse(getFile(result.files, 'data/trace/function/attack.sourcemap.json')) as SourceMap
    expect(map.generatedFile).toBe('data/trace/function/attack.mcfunction')
    expect(map.mappings.length).toBeGreaterThan(0)
  })

  test('execute-run helper call sites keep source comments for runtime tracebacks', () => {
    const result = compileWithSource(`
fn attack(): void {
  execute as @a run {
    say("hit");
  }
}
`)

    const main = getFile(result.files, 'data/trace/function/attack.mcfunction')
    const helperPath = result.files.find(file => file.path.includes('__exec_') && file.path.endsWith('.mcfunction'))?.path
    expect(main).toContain('# src: src/main.mcrs:3')
    expect(main).toContain('run function trace:')
    expect(helperPath).toBeDefined()
    const helper = getFile(result.files, helperPath!)
    expect(helper).toContain('# Generated from: src/main.mcrs:3')
  })

  test('namespace sourcemap records nested helper functions', () => {
    const result = compileWithSource(`
fn attack(flag: bool): void {
  if (flag) {
    say("hit");
  }
}
`)

    const map = JSON.parse(getFile(result.files, 'trace.sourcemap.json')) as NamespaceSourceMap
    const helperKey = Object.keys(map.mappings).find(key => key.includes('__then_'))
    expect(helperKey).toBeDefined()
    expect(map.mappings[helperKey!]).toMatchObject({ source: 0, line: 2, name: expect.any(String) })
  })
})
