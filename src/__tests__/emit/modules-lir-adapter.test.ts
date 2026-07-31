import { compileModules, compileModulesWithLIR } from '../../emit/modules'

describe('compileModules LIR adapter', () => {
  const modules = [{
    name: 'cmd',
    source: `
module cmd;

export fn main(): void {
  helper();
}

fn helper(): void {
  raw("say helper");
}
`,
  }]

  test('qualifies named-module local function calls consistently with emitted paths', () => {
    const result = compileModules(modules, {
      namespace: 'app',
      entryFunctions: ['cmd/main'],
    })
    const main = result.files.find(file => file.path === 'data/app/function/cmd/main.mcfunction')
    const helper = result.files.find(file => file.path === 'data/app/function/cmd/helper.mcfunction')

    expect(main?.content).toContain('function app:cmd/helper')
    expect(main?.content).not.toContain('function app:helper')
    expect(helper?.content).toContain('say helper')
  })

  test('exposes deeply frozen optimized LIR without changing the artifact API', () => {
    const result = compileModulesWithLIR(modules, {
      namespace: 'app',
      entryFunctions: ['cmd/main'],
    })
    const module = result.lirModules[0]
    const main = module.functions.find(fn => fn.name === 'cmd/main')
    const helperCall = main?.instructions.find(instr => instr.kind === 'call')

    expect(result.files).toEqual(compileModules(modules, {
      namespace: 'app',
      entryFunctions: ['cmd/main'],
    }).files)
    expect(Object.isFrozen(result.lirModules)).toBe(true)
    expect(Object.isFrozen(module)).toBe(true)
    expect(Object.isFrozen(module.functions)).toBe(true)
    expect(Object.isFrozen(main?.instructions)).toBe(true)
    expect(helperCall).toMatchObject({ kind: 'call', fn: 'app:cmd/helper' })
  })

  test('can lower to LIR without constructing datapack artifacts', () => {
    const result = compileModulesWithLIR(modules, {
      namespace: 'app',
      entryFunctions: ['cmd/main'],
      emitArtifacts: false,
    })

    expect(result.files).toEqual([])
    expect(result.lirModules[0].functions.map(fn => fn.name)).toEqual([
      'cmd/main',
      'cmd/helper',
    ])
  })

  test('does not let the LIR-only hook change legacy compileModules behavior', () => {
    const result = compileModules(modules, {
      namespace: 'app',
      entryFunctions: ['cmd/main'],
      emitArtifacts: false,
    } as Parameters<typeof compileModulesWithLIR>[1])

    expect(result.files.some(file => file.path === 'pack.mcmeta')).toBe(true)
    expect(result.files.some(file => file.path === 'data/app/function/cmd/main.mcfunction')).toBe(true)
  })

  test('scopes impl methods and specialized clones to the named module path', () => {
    const result = compileModulesWithLIR([{
      name: 'cmd',
      source: `
module cmd;
struct Counter { value: int }
impl Counter {
  fn ping(self): void { raw("say ping"); }
}
export fn main(): void {
  let counter: Counter = Counter { value: 0 };
  counter.ping();
}
`,
    }], {
      namespace: 'app',
      entryFunctions: ['cmd/main'],
    })
    const module = result.lirModules[0]
    const main = module.functions.find(fn => fn.name === 'cmd/main')!
    const call = main.instructions.find(instr => instr.kind === 'call') as Extract<
      typeof main.instructions[number],
      { kind: 'call' }
    >
    const identities = new Set(module.functions.map(fn => `app:${fn.name.replace(/::/g, '/').toLowerCase()}`))

    expect(call.fn).toMatch(/^app:cmd\/counter\/ping/)
    expect(identities).toContain(call.fn)
    expect(result.files.some(file => (
      file.path === `data/app/function/${call.fn.slice('app:'.length)}.mcfunction`
    ))).toBe(true)
  })
})
