import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { compile, parseSourceStage, preprocessSourceStage, runTypecheckStage } from '../../emit/compile'
import { DiagnosticBundleError, DiagnosticError } from '../../diagnostics'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

describe('emit: compile coverage', () => {
  test('parseSourceStage returns AST and parser warnings without emitting files', () => {
    const parsed = parseSourceStage(`
      fn main(): void {
        let value: int = 1;
      }
    `, 'parse_stage_test', { filePath: '/tmp/parse-stage-test.mcrs' })

    expect(parsed.ast.namespace).toBe('parse_stage_test')
    expect(parsed.ast.declarations.map(fn => fn.name)).toContain('main')
    expect(parsed.ast.declarations.find(fn => fn.name === 'main')?.sourceFile).toBe('/tmp/parse-stage-test.mcrs')
    expect(parsed.warnings).toEqual([])
  })

  test('parseSourceStage preserves stopAfterCheck parse-error bundling', () => {
    expect(() => parseSourceStage('fn broken(: void {', 'parse_stage_test', { stopAfterCheck: true }))
      .toThrow(DiagnosticBundleError)
  })

  test('preprocessSourceStage returns processed source, ranges, and library imports', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-emit-preprocess-'))
    const mainPath = path.join(tmpDir, 'main.mcrs')
    const helperPath = path.join(tmpDir, 'helpers.mcrs')
    const libPath = path.join(tmpDir, 'mylib.mcrs')

    fs.writeFileSync(helperPath, 'fn helper(): int { return 2; }\n')
    fs.writeFileSync(libPath, 'module library;\nfn lib_value(): int { return 3; }\n')
    fs.writeFileSync(mainPath, 'import "helpers";\nimport "mylib";\nfn main(): int { return helper(); }\n')

    try {
      const stage = preprocessSourceStage(fs.readFileSync(mainPath, 'utf-8'), { filePath: mainPath })

      expect(stage.processedSource).toContain('fn helper()')
      expect(stage.processedSource).toContain('fn main()')
      expect(stage.ranges.map(range => range.filePath)).toContain(path.resolve(helperPath))
      expect(stage.ranges.map(range => range.filePath)).toContain(path.resolve(mainPath))
      expect(stage.libraryImports).toHaveLength(1)
      expect(stage.libraryImports?.[0].filePath).toBe(path.resolve(libPath))
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('preprocessSourceStage preserves import diagnostics with source file and line', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rscript-emit-preprocess-error-'))
    const mainPath = path.join(tmpDir, 'main.mcrs')
    fs.writeFileSync(mainPath, 'import "missing_module";\nfn main(): int { return 1; }\n')

    try {
      expect(() => preprocessSourceStage(fs.readFileSync(mainPath, 'utf-8'), { filePath: mainPath }))
        .toThrow(DiagnosticError)

      try {
        preprocessSourceStage(fs.readFileSync(mainPath, 'utf-8'), { filePath: mainPath })
      } catch (err) {
        expect(err).toBeInstanceOf(DiagnosticError)
        const diag = err as DiagnosticError
        expect(diag.location.file).toBe(mainPath)
        expect(diag.location.line).toBe(1)
        expect(diag.message).toContain("Cannot import 'missing_module'")
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('runTypecheckStage returns typechecker warnings without emitting files', () => {
    const source = `
      fn main(a: float, b: float): float {
        return a + b;
      }
    `
    const parsed = parseSourceStage(source, 'typecheck_stage_test')

    const stage = runTypecheckStage(parsed.ast, source)

    expect(stage.warnings.some(warning => warning.includes('[FloatArithmetic]'))).toBe(true)
  })

  test('runTypecheckStage preserves diagnostic bundling and source file for decorator errors', () => {
    const filePath = '/tmp/typecheck-stage-test.mcrs'
    const source = `
      @watch("rs.kills")
      fn watched(value: int): void {}
    `
    const parsed = parseSourceStage(source, 'typecheck_stage_test', { filePath })

    try {
      runTypecheckStage(parsed.ast, source, { filePath, stopAfterCheck: true })
      throw new Error('expected runTypecheckStage to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(DiagnosticBundleError)
      const bundle = err as DiagnosticBundleError
      expect(bundle.diagnostics[0].location.file).toBe(filePath)
      expect(bundle.diagnostics[0].message).toContain('@watch')
    }
  })

  test('control-flow statements generate emit-time branching artifacts', () => {
    const source = `
      fn flow(): void {
        let total: int = 0;
        let arr: int[] = [1, 2, 3];

        if (total == 0) {
          total = 1;
        } else {
          total = 2;
        }

        while (total < 3) {
          total = total + 1;
        }

        for i in 0..=2 {
          total = total + i;
        }

        for x in arr {
          total = total + x;
        }

        match total {
          0 => { total = 10; }
          _ => { total = 11; }
        }

        scoreboard_set("#out", "emit_cf", total);
      }
    `

    const result = compile(source, { namespace: 'emit_cf' })
    const main = getFile(result.files, 'flow.mcfunction')
    const allPaths = result.files.map(f => f.path)
    const allContent = result.files.map(f => f.content).join('\n')

    expect(main).toBeDefined()
    expect(allPaths.some(path => path.includes('__loop_header_'))).toBe(true)
    expect(allPaths.some(path => path.includes('__loop_body_'))).toBe(true)
    expect(allPaths.some(path => path.includes('__loop_exit_'))).toBe(true)
    expect(allPaths.some(path => path.includes('__match_arm_'))).toBe(true)
    expect(allPaths.some(path => path.includes('__match_merge_'))).toBe(true)
    expect(allPaths.some(path => path.includes('__dyn_idx_emit_cf_arrays_arr'))).toBe(true)
    expect(allContent).toContain('execute if score')
    expect(allContent).toContain('with storage')
  })

  test('edge cases for empty, single-line, and nested-call functions compile cleanly', () => {
    const source = `
      fn empty(): void {}

      fn single(): int { return 1; }

      fn nested(): int {
        return single() + single();
      }
    `

    const result = compile(source, { namespace: 'emit_edge' })
    const empty = getFile(result.files, 'empty.mcfunction')
    const single = getFile(result.files, 'single.mcfunction')
    const nested = getFile(result.files, 'nested.mcfunction')

    expect(empty).toBe('\n')
    expect(single).toContain('scoreboard players set')
    // After auto-inline, single() may be inlined into nested — check either case
    const allContent = result.files.map(f => f.content).join('\n')
    expect(
      (nested ?? '').includes('function emit_edge:single') ||
      allContent.includes('scoreboard players set $__const_1')
    ).toBe(true)
  })

  test('special builtins raw, scoreboard interop, tell, and setblock emit expected commands', () => {
    const source = `
      fn builtins(): void {
        raw("say hi");
        tell(@s, "ok");
        setblock((1, 2, 3), "minecraft:stone");
        let current: int = scoreboard_get("#p", "obj");
        scoreboard_set("#p", "obj", current);
        scoreboard_add("#p", "obj", 1);
      }
    `

    const result = compile(source, { namespace: 'emit_builtin' })
    const fn = getFile(result.files, 'builtins.mcfunction')

    expect(fn).toBeDefined()
    expect(fn).toContain('say hi')
    expect(fn).toContain('tellraw @s {"text":"ok"}')
    expect(fn).toContain('setblock 1 2 3 minecraft:stone')
    expect(fn).toContain('execute store result score $')
    expect(fn).toContain('run scoreboard players get #p obj')
    expect(fn).toContain('execute store result score #p obj run scoreboard players get')
    expect(fn).toContain('function emit_builtin:scoreboard_add')
  })
})
