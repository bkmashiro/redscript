/**
 * Tests that @throttle and @retry decorated functions each get their own
 * per-function scoreboard objective, preventing interference between concurrent calls.
 */
import { emit } from '../../emit'
import type { DatapackFile } from '../../emit'
import type { LIRFunction, LIRInstr, LIRModule } from '../../lir/types'

function getFile(files: DatapackFile[], path: string): string {
  const file = files.find(entry => entry.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(entry => entry.path).join('\n')}`)
  }
  return file.content
}

function makeFn(name: string): LIRFunction {
  const sourceLoc = { file: 'src/test.mcrs', line: 1, col: 1 }
  return {
    name,
    isMacro: false,
    macroParams: [],
    sourceLoc,
    sourceSnippet: `fn ${name}() -> void`,
    instructions: [{ kind: 'raw', cmd: `say ${name}`, sourceLoc } satisfies LIRInstr],
  }
}

function makeModule(fns: LIRFunction[]): LIRModule {
  return { namespace: 'iso', objective: '__iso', functions: fns }
}

describe('@throttle: per-function objective isolation', () => {
  const module = makeModule([makeFn('alpha'), makeFn('beta')])
  const files = emit(module, {
    namespace: 'iso',
    throttleFunctions: [
      { name: 'alpha', ticks: 20 },
      { name: 'beta', ticks: 5 },
    ],
  })

  test('load.mcfunction registers distinct objectives for each throttled function', () => {
    const load = getFile(files, 'data/iso/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __throttle_alpha dummy')
    expect(load).toContain('scoreboard objectives add __throttle_beta dummy')
    // Must not register a shared generic objective
    expect(load).not.toContain('scoreboard objectives add __throttle dummy')
  })

  test('alpha dispatcher uses __throttle_alpha objective, not beta\'s', () => {
    const alpha = getFile(files, 'data/iso/function/__throttle_alpha.mcfunction')
    expect(alpha).toContain('__throttle_alpha __throttle_alpha')
    expect(alpha).not.toContain('__throttle_beta')
  })

  test('beta dispatcher uses __throttle_beta objective, not alpha\'s', () => {
    const beta = getFile(files, 'data/iso/function/__throttle_beta.mcfunction')
    expect(beta).toContain('__throttle_beta __throttle_beta')
    expect(beta).not.toContain('__throttle_alpha')
  })

  test('alpha and beta objectives are distinct strings', () => {
    const alpha = getFile(files, 'data/iso/function/__throttle_alpha.mcfunction')
    const beta = getFile(files, 'data/iso/function/__throttle_beta.mcfunction')
    // Extract the objective name from the first scoreboard command in each dispatcher
    const extractObj = (content: string): string => {
      const match = content.match(/scoreboard players add \S+ (\S+) \d+/)
      if (!match) throw new Error(`No scoreboard add found in:\n${content}`)
      return match[1]
    }
    expect(extractObj(alpha)).not.toBe(extractObj(beta))
  })

  test('single throttled function still gets a function-scoped objective name', () => {
    const solo = emit(makeModule([makeFn('solo')]), {
      namespace: 'iso',
      throttleFunctions: [{ name: 'solo', ticks: 10 }],
    })
    const load = getFile(solo, 'data/iso/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __throttle_solo dummy')
    expect(load).not.toContain('scoreboard objectives add __throttle dummy')
  })
})

describe('@retry: per-function objective isolation', () => {
  const module = makeModule([makeFn('fetch'), makeFn('connect')])
  const files = emit(module, {
    namespace: 'iso',
    retryFunctions: [
      { name: 'fetch', max: 3 },
      { name: 'connect', max: 5 },
    ],
  })

  test('load.mcfunction registers distinct objectives for each retried function', () => {
    const load = getFile(files, 'data/iso/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __retry_fetch dummy')
    expect(load).toContain('scoreboard objectives add __retry_connect dummy')
    // Must not register a shared generic objective
    expect(load).not.toContain('scoreboard objectives add __retry dummy')
  })

  test('fetch dispatcher uses __retry_fetch objective, not connect\'s', () => {
    const fetch = getFile(files, 'data/iso/function/__retry_fetch.mcfunction')
    expect(fetch).toContain('__retry_fetch __retry_fetch')
    expect(fetch).not.toContain('__retry_connect')
  })

  test('connect dispatcher uses __retry_connect objective, not fetch\'s', () => {
    const connect = getFile(files, 'data/iso/function/__retry_connect.mcfunction')
    expect(connect).toContain('__retry_connect __retry_connect')
    expect(connect).not.toContain('__retry_fetch')
  })

  test('_start files use their own function-scoped objective', () => {
    const fetchStart = getFile(files, 'data/iso/function/fetch_start.mcfunction')
    const connectStart = getFile(files, 'data/iso/function/connect_start.mcfunction')
    expect(fetchStart).toContain('__retry_fetch __retry_fetch 3')
    expect(connectStart).toContain('__retry_connect __retry_connect 5')
    expect(fetchStart).not.toContain('__retry_connect')
    expect(connectStart).not.toContain('__retry_fetch')
  })

  test('fetch and connect objectives are distinct strings', () => {
    const fetch = getFile(files, 'data/iso/function/__retry_fetch.mcfunction')
    const connect = getFile(files, 'data/iso/function/__retry_connect.mcfunction')
    const extractObj = (content: string): string => {
      const match = content.match(/execute if score \S+ (\S+) matches/)
      if (!match) throw new Error(`No execute if score found in:\n${content}`)
      return match[1]
    }
    expect(extractObj(fetch)).not.toBe(extractObj(connect))
  })

  test('single retried function still gets a function-scoped objective name', () => {
    const solo = emit(makeModule([makeFn('solo')]), {
      namespace: 'iso',
      retryFunctions: [{ name: 'solo', max: 2 }],
    })
    const load = getFile(solo, 'data/iso/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __retry_solo dummy')
    expect(load).not.toContain('scoreboard objectives add __retry dummy')
  })
})
