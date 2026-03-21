describe('emit/compile mocked branch coverage', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    jest.unmock('../../compile')
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

  test('whole-module import paths resolve, recurse, skip symbol imports, and warn on missing nested modules', () => {
    jest.isolateModules(() => {
      const parseQueue = [
        {
          imports: [
            { moduleName: 'mod', symbol: undefined, span: { line: 1, col: 1 } },
            { moduleName: 'sym', symbol: 'named', span: { line: 2, col: 1 } },
          ],
          declarations: [],
          structs: [],
          implBlocks: [],
          enums: [],
          consts: [],
          globals: [],
        },
        {
          imports: [
            { moduleName: 'nested', symbol: undefined },
            { moduleName: 'skip_nested', symbol: 'named' },
            { moduleName: 'missing_nested', symbol: undefined },
          ],
          declarations: [{ name: 'helper', decorators: [] }],
          structs: [],
          implBlocks: [],
          enums: [],
          consts: [],
          globals: [],
        },
        {
          imports: [],
          declarations: [{ name: 'nested_helper', decorators: [] }],
          structs: [],
          implBlocks: [],
          enums: [],
          consts: [],
          globals: [],
        },
      ]

      jest.doMock('../../compile', () => ({
        preprocessSourceWithMetadata: jest.fn((source: string) => ({ source })),
      }))
      jest.doMock('fs', () => ({
        existsSync: jest.fn((file: string) => (
          file === '/root/mod.mcrs' ||
          file === '/root/nested.mcrs'
        )),
        readFileSync: jest.fn((file: string) => {
          if (file === '/root/mod.mcrs') return 'mod-source'
          if (file === '/root/nested.mcrs') return 'nested-source'
          return ''
        }),
      }))
      jest.doMock('../../lexer', () => ({
        Lexer: jest.fn().mockImplementation(() => ({
          tokenize: () => [],
        })),
      }))
      jest.doMock('../../parser', () => ({
        Parser: jest.fn().mockImplementation(() => ({
          warnings: [],
          parse: () => parseQueue.shift(),
        })),
      }))
      jest.doMock('../../typechecker', () => ({
        TypeChecker: jest.fn().mockImplementation(() => ({
          check: () => [],
          getWarnings: () => [],
        })),
      }))
      jest.doMock('../../hir/lower', () => ({ lowerToHIR: jest.fn(() => ({ functions: [] })) }))
      jest.doMock('../../hir/monomorphize', () => ({ monomorphize: jest.fn(x => x) }))
      jest.doMock('../../hir/deprecated', () => ({ checkDeprecatedCalls: jest.fn(() => []) }))
      jest.doMock('../../mir/lower', () => ({ lowerToMIR: jest.fn(() => ({ functions: [] })) }))
      jest.doMock('../../optimizer/pipeline', () => ({ optimizeModule: jest.fn(x => x) }))
      jest.doMock('../../optimizer/coroutine', () => ({
        coroutineTransform: jest.fn(module => ({ module, generatedTickFunctions: [], warnings: [] })),
      }))
      jest.doMock('../../lir/lower', () => ({ lowerToLIR: jest.fn(() => ({ functions: [] })) }))
      jest.doMock('../../optimizer/lir/pipeline', () => ({ lirOptimizeModule: jest.fn(x => x) }))
      jest.doMock('../../lir/budget', () => ({ analyzeBudget: jest.fn(() => []) }))
      jest.doMock('../../events/types', () => ({ isEventTypeName: jest.fn(() => false) }))
      jest.doMock('../../emit/index', () => ({ emit: jest.fn(() => []) }))

      const { compile } = require('../../emit/compile')
      const result = compile('source', { namespace: 'mocked', filePath: '/root/main.mcrs' })

      expect(result.warnings).toContain(
        "[ImportWarning] Module 'missing_nested' not found (imported in /root/mod.mcrs)"
      )
    })
  })

  test('library imports, librarySources, lenient type errors, and decorator extraction flow into emit options', () => {
    jest.isolateModules(() => {
      const emit = jest.fn(() => [])
      const parseQueue = [
        {
          imports: [],
          declarations: [],
          structs: [],
          implBlocks: [],
          enums: [],
          consts: [],
          globals: [],
        },
        {
          imports: [],
          declarations: [{ name: 'lib_fn', decorators: [] }],
          structs: [],
          implBlocks: [],
          enums: [],
          consts: [],
          globals: [],
        },
        {
          declarations: [{ name: 'inline_fn', decorators: [] }],
          structs: [],
          implBlocks: [],
          enums: [],
          consts: [],
          globals: [],
        },
      ]

      jest.doMock('../../compile', () => ({
        preprocessSourceWithMetadata: jest.fn((source: string, options?: { filePath?: string }) => {
          if (options?.filePath === '/root/main.mcrs') {
            return {
              source,
              libraryImports: [{ source: 'module library;\nfn lib_fn(): int { return 1; }', filePath: '/root/lib.mcrs' }],
            }
          }
          return { source }
        }),
      }))
      jest.doMock('fs', () => ({
        existsSync: jest.fn(() => false),
        readFileSync: jest.fn(() => ''),
      }))
      jest.doMock('../../lexer', () => ({
        Lexer: jest.fn().mockImplementation(() => ({
          tokenize: () => [],
        })),
      }))
      jest.doMock('../../parser', () => ({
        Parser: jest.fn().mockImplementation(() => ({
          warnings: [],
          parse: () => parseQueue.shift(),
        })),
      }))
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
              name: 'tick_fn',
              decorators: [
                { name: 'tick' },
                { name: 'load' },
                { name: 'coroutine', args: { batch: 4, onDone: 'after' } },
                { name: 'schedule', args: { ticks: 5 } },
                { name: 'on', args: { eventType: 'PlayerJoin' } },
              ],
            },
            {
              name: 'ignored_event',
              decorators: [{ name: 'on', args: { eventType: 'NotReal' } }],
            },
          ],
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
