describe('mc integration console filter', () => {
  const helperPath = '../test-utils/mc-integration-console'

  afterEach(() => {
    jest.resetModules()
  })

  test('suppresses console.log by default while preserving warnings and errors', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { installMcIntegrationConsoleFilter } = require(helperPath)
    const calls: unknown[][] = []
    const fakeConsole = {
      log: (...args: unknown[]) => calls.push(args),
      warn: (...args: unknown[]) => calls.push(['warn', ...args]),
      error: (...args: unknown[]) => calls.push(['error', ...args]),
    }

    installMcIntegrationConsoleFilter({ env: {}, consoleObj: fakeConsole })

    fakeConsole.log('success noise')
    fakeConsole.warn('warning')
    fakeConsole.error('error')

    expect(calls).toEqual([
      ['warn', 'warning'],
      ['error', 'error'],
    ])
  })

  test('keeps console.log when MC_VERBOSE is truthy', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { installMcIntegrationConsoleFilter } = require(helperPath)
    const calls: unknown[][] = []
    const fakeConsole = {
      log: (...args: unknown[]) => calls.push(args),
    }

    installMcIntegrationConsoleFilter({ env: { MC_VERBOSE: '1' }, consoleObj: fakeConsole })
    fakeConsole.log('visible')

    expect(calls).toEqual([['visible']])
  })
})
