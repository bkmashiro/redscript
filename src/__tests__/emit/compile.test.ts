import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  collectRuntimeMetadataStage,
  compile,
  emitDatapackStage,
  finalizeRuntimeLIRStage,
  parseSourceStage,
  preprocessSourceStage,
  runTypecheckStage,
  singletonObjectiveName,
} from '../../emit/compile'
import { DiagnosticBundleError, DiagnosticError } from '../../diagnostics'
import { lowerToHIR } from '../../hir/lower'
import { monomorphize } from '../../hir/monomorphize'
import type { CompileStageSnapshot } from '../../emit/compile'
import type { HIRModule } from '../../hir/types'
import type { LIRModule } from '../../lir/types'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

function collectRuntimeMetadataFromSource(source: string, namespace = 'metadata_stage_test') {
  const parsed = parseSourceStage(source, namespace)
  return collectRuntimeMetadataStage(monomorphize(lowerToHIR(parsed.ast)), namespace)
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

  test('collectRuntimeMetadataStage extracts runtime decorators without emitting files', () => {
    const metadata = collectRuntimeMetadataFromSource(`
      @tick
      @inline
      fn ticked(): void {}

      @load
      @no-inline
      fn loaded(): void {}

      @coroutine(batch=4, onDone="done")
      @schedule(ticks=20)
      fn scheduled(): void {}

      @profile
      @benchmark
      @throttle(ticks=3)
      @retry(max=2)
      @memoize
      fn wrapped(n: int): int { return n; }

      @on(PlayerDeath)
      fn death(): void {}

      @function_tag("custom:handlers")
      fn tagged(): void {}
    `)

    expect(metadata.tickFunctions).toEqual(['ticked'])
    expect(metadata.loadFunctions).toEqual(['loaded'])
    expect([...metadata.inlineFunctions]).toEqual(['ticked'])
    expect([...metadata.noInlineFunctions]).toEqual(['loaded'])
    expect(metadata.coroutineInfos).toEqual([{ fnName: 'scheduled', batch: 4, onDone: 'done' }])
    expect(metadata.scheduleFunctions).toEqual([{ name: 'scheduled', ticks: 20 }])
    expect(metadata.profiledFunctions).toEqual(['wrapped'])
    expect(metadata.benchmarkFunctions).toEqual(['wrapped'])
    expect(metadata.throttleFunctions).toEqual([{ name: 'wrapped', ticks: 3 }])
    expect(metadata.retryFunctions).toEqual([{ name: 'wrapped', max: 2 }])
    expect(metadata.memoizeFunctions).toEqual(['wrapped'])
    expect(metadata.eventHandlers.get('PlayerDeath')).toEqual(['metadata_stage_test:death'])
    expect(metadata.functionTags.get('custom:handlers')).toEqual(['metadata_stage_test:tagged'])
  })

  test('collectRuntimeMetadataStage preserves watchObjective fallback behavior', () => {
    const hir: HIRModule = {
      namespace: 'metadata_stage_test',
      globals: [],
      structs: [],
      implBlocks: [],
      enums: [],
      consts: [],
      functions: [{
        name: 'watched',
        params: [],
        returnType: { kind: 'named', name: 'void' },
        body: [],
        decorators: [{ name: 'watch', args: { objective: 'rs.kills' } }],
      }],
    }

    const metadata = collectRuntimeMetadataStage(hir, 'metadata_stage_test')

    expect(metadata.watchFunctions).toEqual([{ name: 'watched', objective: 'rs.kills' }])
  })

  test('emitDatapackStage emits load/tick/function tags and forwards singleton/function-tag options', () => {
    const finalizedLIR: LIRModule = {
      namespace: 'emit_stage_test',
      objective: '__emit_stage',
      functions: [
        {
          name: 'start',
          isMacro: false,
          macroParams: [],
          instructions: [{ kind: 'score_set', dst: { player: '$ret', obj: '__emit_stage' }, value: 0 }],
        },
      ],
    }

    const { files } = emitDatapackStage(finalizedLIR, {
      namespace: 'emit_stage_test',
      tickFunctions: ['start'],
      loadFunctions: ['bootstrap'],
      functionTags: new Map([['custom:handlers', ['emit_stage_test:start']]]),
      singletonObjectives: ['__singleton_obj'],
      libraryFilePaths: new Set<string>(),
    })

    const load = files.find(file => file.path === 'data/emit_stage_test/function/load.mcfunction')
    expect(load).toBeDefined()
    expect(load?.content).toContain('scoreboard objectives add __emit_stage dummy')
    expect(load?.content).toContain('scoreboard objectives add __singleton_obj dummy')

    const tickTag = files.find(file => file.path === 'data/minecraft/tags/function/tick.json')
    expect(tickTag).toBeDefined()
    expect(JSON.parse(tickTag!.content).values).toContain('emit_stage_test:start')

    const loadTag = files.find(file => file.path === 'data/minecraft/tags/function/load.json')
    expect(loadTag).toBeDefined()
    expect(JSON.parse(loadTag!.content).values).toEqual(
      expect.arrayContaining(['emit_stage_test:load', 'emit_stage_test:bootstrap']),
    )

    const functionTag = files.find(file => file.path === 'data/custom/tags/function/handlers.json')
    expect(functionTag).toBeDefined()
    expect(JSON.parse(functionTag!.content).values).toEqual(['emit_stage_test:start'])
  })

  test('emitDatapackStage prunes library files only when caller marks them for pruning', () => {
    const finalizedLIR: LIRModule = {
      namespace: 'emit_stage_prune',
      objective: '__emit_stage_prune',
      functions: [
        {
          name: 'library_fn',
          isMacro: false,
          macroParams: [],
          instructions: [{ kind: 'score_set', dst: { player: '$ret', obj: '__emit_stage_prune' }, value: 1 }],
        },
        {
          name: 'kept_fn',
          isMacro: false,
          macroParams: [],
          instructions: [{ kind: 'score_set', dst: { player: '$ret', obj: '__emit_stage_prune' }, value: 2 }],
        },
      ],
    }

    const libraryFile = 'data/emit_stage_prune/function/library_fn.mcfunction'
    const keptFile = 'data/emit_stage_prune/function/kept_fn.mcfunction'

    const full = emitDatapackStage(finalizedLIR, {
      namespace: 'emit_stage_prune',
      libraryFilePaths: new Set<string>(),
    })
    const fullPaths = full.files.map(file => file.path)
    expect(fullPaths).toContain(libraryFile)
    expect(fullPaths).toContain(keptFile)

    const pruned = emitDatapackStage(finalizedLIR, {
      namespace: 'emit_stage_prune',
      libraryFilePaths: new Set([libraryFile]),
    })
    const prunedPaths = pruned.files.map(file => file.path)
    expect(prunedPaths).not.toContain(libraryFile)
    expect(prunedPaths).toContain(keptFile)
  })

  test('finalizeRuntimeLIRStage injects @singleton get/set helpers and objective list', () => {
    const stage = finalizeRuntimeLIRStage(
      {
        namespace: 'singleton_stage_test',
        objective: '__ret',
        functions: [
          {
            name: 'main',
            isMacro: false,
            macroParams: [],
            instructions: [{ kind: 'score_set', dst: { player: '$ret', obj: '__ret' }, value: 0 }],
          },
        ],
      },
      {
        singletonStructs: [
          {
            name: 'GameState',
            fields: [
              { name: 'phase', type: { kind: 'named', name: 'int' } },
              { name: 'tick_count', type: { kind: 'named', name: 'int' } },
            ],
            isSingleton: true,
          },
        ],
      },
    )

    expect(stage.singletonObjectives).toEqual([
      singletonObjectiveName('GameState', 'phase'),
      singletonObjectiveName('GameState', 'tick_count'),
    ])
    const names = stage.lir.functions.map(f => f.name)
    expect(names).toContain('GameState::get')
    expect(names).toContain('GameState::set')

    const getFn = stage.lir.functions.find(f => f.name === 'GameState::get')
    const setFn = stage.lir.functions.find(f => f.name === 'GameState::set')

    expect(getFn).toBeDefined()
    expect(setFn).toBeDefined()

    expect(getFn?.instructions).toEqual(
      expect.arrayContaining([
        {
          kind: 'score_copy',
          dst: { player: '$__rf_phase', obj: '__ret' },
          src: { player: '__sng', obj: singletonObjectiveName('GameState', 'phase') },
        },
        {
          kind: 'score_copy',
          dst: { player: '$__rf_tick_count', obj: '__ret' },
          src: { player: '__sng', obj: singletonObjectiveName('GameState', 'tick_count') },
        },
      ],
    ))

    expect(setFn?.instructions).toEqual(
      expect.arrayContaining([
        {
          kind: 'score_copy',
          dst: { player: '__sng', obj: singletonObjectiveName('GameState', 'phase') },
          src: { player: '$p0', obj: '__ret' },
        },
        {
          kind: 'score_copy',
          dst: { player: '__sng', obj: singletonObjectiveName('GameState', 'tick_count') },
          src: { player: '$p1', obj: '__ret' },
        },
      ],
    ))
  })

  test('finalizeRuntimeLIRStage rewrites memoize/benchmark functions to <fn>_impl and rewrites self-calls', () => {
    const stage = finalizeRuntimeLIRStage(
      {
        namespace: 'memo_bench_stage_test',
        objective: '__ret',
        functions: [
          {
            name: 'memoized',
            isMacro: false,
            macroParams: [],
            instructions: [
              { kind: 'call', fn: 'memoized' },
              { kind: 'call', fn: 'helper' },
            ],
          },
          {
            name: 'bench',
            isMacro: false,
            macroParams: [],
            instructions: [{ kind: 'call', fn: 'bench' }],
          },
          {
            name: 'helper',
            isMacro: false,
            macroParams: [],
            instructions: [{ kind: 'score_set', dst: { player: '$ret', obj: '__ret' }, value: 1 }],
          },
        ],
      },
      {
        memoizeFunctions: ['memoized'],
        benchmarkFunctions: ['bench'],
      },
    )

    expect(stage.lir.functions.map(f => f.name)).toEqual(
      expect.arrayContaining(['memoized_impl', 'bench_impl', 'helper']),
    )
    expect(stage.lir.functions.some(f => f.name === 'memoized')).toBe(false)
    expect(stage.lir.functions.some(f => f.name === 'bench')).toBe(false)

    const memo = stage.lir.functions.find(f => f.name === 'memoized_impl')
    const bench = stage.lir.functions.find(f => f.name === 'bench_impl')
    expect(memo).toBeDefined()
    expect(bench).toBeDefined()
    expect(memo?.instructions[0]).toMatchObject({ kind: 'call', fn: 'memoized_impl' })
    expect(bench?.instructions[0]).toMatchObject({ kind: 'call', fn: 'bench_impl' })
  })

  test('finalizeRuntimeLIRStage warns on LIR score_set int32 overflow', () => {
    const { warnings } = finalizeRuntimeLIRStage(
      {
        namespace: 'overflow_stage_test',
        objective: '__ret',
        functions: [
          {
            name: 'overflow_fn',
            isMacro: false,
            macroParams: [],
            instructions: [
              { kind: 'score_set', dst: { player: '$ret', obj: '__ret' }, value: 2147483647 },
              { kind: 'score_set', dst: { player: '$ret', obj: '__ret' }, value: 2147483648 },
              { kind: 'score_set', dst: { player: '$ret', obj: '__ret' }, value: -2147483649 },
            ],
          },
        ],
      },
    )

    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('outside MC int32 range')
    expect(warnings[1]).toContain('outside MC int32 range')
  })

  test('compile can collect selected stage snapshots without changing output shape', () => {
    const stageSnapshots: CompileStageSnapshot[] = []
    const result = compile(`
      @tick
      fn ticked(): void {}

      @function_tag("custom:handlers")
      fn tagged(): void {}
    `, {
      namespace: 'snapshot_stage_test',
      snapshotStages: ['parse', 'runtimeMetadata'],
      stageSnapshots,
    })

    expect(result.success).toBe(true)
    expect(result.files.length).toBeGreaterThan(0)
    expect(stageSnapshots).toEqual([
      {
        stage: 'parse',
        summary: {
          namespace: 'snapshot_stage_test',
          functions: ['ticked', 'tagged'],
          structs: [],
          imports: 0,
          warnings: 0,
        },
      },
      {
        stage: 'runtimeMetadata',
        summary: {
          tickFunctions: ['ticked'],
          loadFunctions: [],
          watchFunctions: [],
          inlineFunctions: [],
          noInlineFunctions: [],
          coroutineFunctions: [],
          scheduleFunctions: [],
          profiledFunctions: [],
          benchmarkFunctions: [],
          throttleFunctions: [],
          retryFunctions: [],
          memoizeFunctions: [],
          eventHandlers: {},
          functionTags: { 'custom:handlers': ['snapshot_stage_test:tagged'] },
        },
      },
    ])
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
