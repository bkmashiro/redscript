describe('emit/compile mocked branch coverage', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    jest.unmock('../../compile')
    jest.unmock('../../compiler/source-program')
    jest.unmock('../../lexer')
    jest.unmock('../../parser')
    jest.unmock('../../typechecker')
    jest.unmock('../../hir/lower')
    jest.unmock('../../hir/monomorphize')
    jest.unmock('../../hir/deprecated')
    jest.unmock('../../mir/lower')
    jest.unmock('../../optimizer/pipeline')
    jest.unmock('../../optimizer/coroutine')
    jest.unmock('../../lir/lower')
    jest.unmock('../../optimizer/lir/pipeline')
    jest.unmock('../../lir/budget')
    jest.unmock('../../events/types')
    jest.unmock('../../emit/index')
    jest.unmock('fs')
  })

  test('shared discovery rejects missing nested imports, then closes named and whole-module dependencies', () => {
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-dependency-'))
    try {
      fs.writeFileSync(path.join(root, 'mod.mcrs'), 'module mod; import nested::nested_helper; import missing_nested; export fn helper(): int { return nested_helper(); }')
      fs.writeFileSync(path.join(root, 'nested.mcrs'), 'module nested; export fn nested_helper(): int { return 5; }')
      fs.writeFileSync(path.join(root, 'sym.mcrs'), 'module sym; export fn named(): int { return 7; }')
      const { compile } = require('../../emit/compile')
      const source = 'import mod; import sym::named; fn main(): int { return helper() + named(); }'
      const options = { namespace: 'dependencies', filePath: path.join(root, 'main.mcrs') }
      expect(() => compile(source, options)).toThrow(/Module 'missing_nested' not found/)
      fs.writeFileSync(path.join(root, 'missing_nested.mcrs'), 'module missing_nested;')
      expect(compile(source, options).success).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('library imports, librarySources, lenient type errors, and decorator extraction flow into emit options', () => {
    jest.isolateModules(() => {
      const emit = jest.fn(() => [])
      const prepared = {
        ast: { namespace: 'mocked', imports: [], declarations: [], structs: [], implBlocks: [], enums: [], consts: [], globals: [], interfaces: [] },
        warnings: [], hasLibraries: true,
      }
      const prepareSourceProgram = jest.fn(() => ({ ...prepared, root: prepared.ast }))
      jest.doMock('../../compiler/source-program', () => ({ prepareSourceProgram }))
      jest.doMock('../../typechecker', () => ({
        TypeChecker: jest.fn().mockImplementation(() => ({
          check: () => [{ location: { line: 3, col: 5 }, message: 'bad types' }],
          getWarnings: () => ['lint warning'],
        })),
      }))
      jest.doMock('../../hir/lower', () => ({
        lowerToHIR: jest.fn(() => ({
          functions: [
            {
              name: 'tick_fn', params: [], returnType: { kind: 'named', name: 'void' }, body: [],
              decorators: [
                { name: 'tick' },
                { name: 'load' },
                { name: 'coroutine', args: { batch: 4, onDone: 'after' } },
                { name: 'schedule', args: { ticks: 5 } },
                { name: 'on', args: { eventType: 'PlayerJoin' } },
              ],
            },
            {
              name: 'ignored_event', params: [], returnType: { kind: 'named', name: 'void' }, body: [],
              decorators: [{ name: 'on', args: { eventType: 'NotReal' } }],
            },
          ],
          namespace: 'mocked', globals: [], consts: [], structs: [], implBlocks: [], enums: [],
        })),
      }))
      jest.doMock('../../hir/monomorphize', () => ({ monomorphize: jest.fn(x => x) }))
      jest.doMock('../../hir/deprecated', () => ({ checkDeprecatedCalls: jest.fn(() => ['deprecated warning']) }))
      jest.doMock('../../mir/lower', () => ({ lowerToMIR: jest.fn(() => ({ functions: [] })) }))
      jest.doMock('../../optimizer/pipeline', () => ({ optimizeModule: jest.fn(x => x) }))
      jest.doMock('../../optimizer/coroutine', () => ({
        coroutineTransform: jest.fn(module => ({
          module,
          generatedTickFunctions: ['generated_tick'],
          warnings: ['coro warning'],
        })),
      }))
      jest.doMock('../../lir/lower', () => ({ lowerToLIR: jest.fn(() => ({ functions: [] })) }))
      jest.doMock('../../optimizer/lir/pipeline', () => ({ lirOptimizeModule: jest.fn(x => x) }))
      jest.doMock('../../lir/budget', () => ({ analyzeBudget: jest.fn(() => [{ level: 'warning', message: 'budget warning' }]) }))
      jest.doMock('../../events/types', () => ({
        isEventTypeName: jest.fn((name: string) => name === 'PlayerJoin'),
      }))
      jest.doMock('../../emit/index', () => ({ emit }))

      const { compile } = require('../../emit/compile')
      const result = compile('source', {
        namespace: 'mocked',
        filePath: '/root/main.mcrs',
        lenient: true,
        librarySources: ['module library;\nfn inline_fn(): int { return 2; }'],
      })

      expect(prepareSourceProgram).toHaveBeenCalledWith(expect.objectContaining({ librarySources: ['module library;\nfn inline_fn(): int { return 2; }'] }))
      expect(result.warnings).toEqual(expect.arrayContaining([
        'lint warning',
        '[TypeError] line 3, col 5: bad types',
        'deprecated warning',
        'coro warning',
        'budget warning',
      ]))
      expect(emit).toHaveBeenCalledWith(
        { functions: [] },
        expect.objectContaining({
          namespace: 'mocked',
          tickFunctions: ['tick_fn', 'generated_tick'],
          loadFunctions: ['tick_fn'],
          scheduleFunctions: [{ name: 'tick_fn', ticks: 5 }],
          eventHandlers: new Map([['PlayerJoin', ['mocked:tick_fn']]]),
        })
      )
    })
  })
})
