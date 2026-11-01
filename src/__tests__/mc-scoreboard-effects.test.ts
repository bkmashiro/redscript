/** Managed, strict Paper correctness checks. Opt in with the package script. */
import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals'
import * as fs from 'fs'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import { MCTestClient } from '../mc-test/client'
import { compile } from '../compile'
import { createCompilerSession } from '../emit/compile'
import { compileModules } from '../emit/modules'
import { loadProject, resolveBuildTarget } from '../project/manifest'
import { McVersion } from '../types/mc-version'
import { deployCorpusPack, removeCorpusPack } from '../mc-test/corpus-deployer'
import { runMcCoreCase } from '../mc-test/case-runner'
import { findHarnessPlugin, findJava, ManagedPaperServer, prepareServerRoot } from '../mc-test/managed-paper'
import * as effects from '../optimizer/scoreboard-effects'
import { SCORE_EFFECTS_CASES } from '../../tests/mc-cases/scoreboard-call-effects-cases'

const live = process.env.MC_SCORE_EFFECTS_REQUIRE_ONLINE === 'true'

async function requireFreePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()))
  })
}

const describeLive = live ? describe : describe.skip

describeLive('managed Paper scoreboard call effects', () => {
  let managed: ManagedPaperServer | undefined
  let root: string
  let mc: MCTestClient

  beforeAll(async () => {
    if (process.env.MC_OFFLINE === 'true') throw new Error('Strict live scoreboard checks cannot run with MC_OFFLINE=true')
    await requireFreePort(25561)
    await requireFreePort(25566)
    const template = process.env.MC_SCORE_EFFECTS_TEMPLATE_DIR ?? path.join(os.homedir(), 'mc-test-server')
    const java = findJava()
    const plugin = findHarnessPlugin(template)
    if (!process.env.MC_HARNESS_PLUGIN && path.basename(plugin) === 'redscript-testharness-1.2.0.jar') {
      throw new Error('TestHarness 1.2.0 binds all interfaces. Supply a loopback-only 1.2.1+ jar with MC_HARNESS_PLUGIN; keep the template unchanged.')
    }
    root = prepareServerRoot(template, plugin)
    mc = new MCTestClient('127.0.0.1', 25561)
    managed = new ManagedPaperServer(root, java.executable, mc, { sourceTemplateDir: template })
    const started = await managed.start()
    expect(started.status.version).toContain('MC: 1.21.4')
    await mc.deterministicReset({ minecraftVersion: '1.21.4' })
    await mc.command('scoreboard objectives add effect_inputs dummy')
    await mc.command('scoreboard objectives add effect_outputs dummy')
  }, 120000)

  afterAll(async () => {
    if (!managed) return
    const cleanup = await managed.cleanup()
    expect(cleanup.failures).toEqual([])
    expect(fs.existsSync(root)).toBe(false)
  }, 30000)

  test('periodic tick cadence, direct calls, reload phase and namespace isolation', async () => {
    const packs: ReturnType<typeof deployCorpusPack>[] = []
    const source = fs.readFileSync(path.resolve(__dirname, '../../tests/mc-cases/tick-rate.mcrs'), 'utf8')
    const alternate = source.replace('@tick(rate=5)', '@tick(rate=7)')
      .replaceAll('#five', '#alt_five').replaceAll('#three', '#alt_three').replaceAll('#one', '#alt_one')
    const score = (player: string) => mc.scoreboard(player, 'effect_outputs')
    const step = async (ticks: number, total: number) => {
      await mc.tickStep(ticks)
      await mc.waitForScore('#one', 'effect_outputs', total)
      await mc.command('scoreboard players add #tick_barrier effect_outputs 0')
      expect(await score('#alt_one')).toBe(total)
    }
    await mc.tickFreeze()
    try {
      for (const [namespace, text] of [['tick_primary', source], ['tick_alternate', alternate]]) {
        packs.push(deployCorpusPack(root, namespace, compile(text, { namespace, mcVersion: McVersion.v1_21_4 }).files))
      }
      await mc.reload()
      // Load tags resume with simulation ticks. Seed only public observation
      // markers while frozen; emitted load code still owns private counters.
      for (const player of ['#one', '#three', '#five', '#alt_one', '#alt_three', '#alt_five']) {
        await mc.command(`scoreboard players set ${player} effect_outputs 0`)
      }
      await step(4, 4)
      expect(await score('#one')).toBe(4)
      expect(await score('#five')).toBe(0)
      expect(await score('#three')).toBe(1)
      expect(await score('#alt_five')).toBe(0)
      await step(1, 5)
      expect(await score('#five')).toBe(1)
      expect(await score('#alt_five')).toBe(0)
      await step(2, 7)
      expect(await score('#alt_five')).toBe(1)
      expect(await score('#three')).toBe(2)
      await mc.command('function tick_primary:pulse')
      await mc.command('function tick_primary:pulse')
      expect(await score('#five')).toBe(3)
      await step(3, 10)
      expect(await score('#one')).toBe(10)
      expect(await score('#five')).toBe(4)
      expect(await score('#alt_five')).toBe(1)
      // The alternate counter is at 3/7 here. Reload must restart the phase,
      // not preserve it and fire after only four ticks in the new epoch.
      await mc.reload()
      await step(4, 4)
      expect(await score('#one')).toBe(4)
      expect(await score('#five')).toBe(0)
      expect(await score('#alt_five')).toBe(0)
      await step(1, 5)
      expect(await score('#five')).toBe(1)
      await step(2, 7)
      expect(await score('#alt_five')).toBe(1)
    } finally {
      try {
        for (const pack of packs) removeCorpusPack(pack.root, pack.caseId)
        await mc.reload()
      } finally {
        await mc.tickUnfreeze()
      }
    }
  }, 60000)

  test('project stdlib package initialization and cross-package numeric calls on Paper', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-stdlib-project-live-'))
    const namespace = 'dx_project'
    let pack: ReturnType<typeof deployCorpusPack> | undefined
    try {
      fs.mkdirSync(path.join(projectRoot, 'src'))
      fs.writeFileSync(path.join(projectRoot, 'redscript.toml'), `[project]
name = "demo"
module = "local/demo"
namespace = "${namespace}"
source-roots = ["src"]
mc-version = "1.21.4"
[target.pack]
kind = "datapack"
entry = "local/demo::main"
out = "dist"
`)
      fs.writeFileSync(path.join(projectRoot, 'src/main.mcrs'), `package demo; import math;
        export fn main(): void { scoreboard_set("#project_sin", "effect_outputs", math::sin_fixed(scoreboard_get("#dx_input", "effect_inputs"))); }`)
      const project = loadProject(projectRoot)!
      const result = createCompilerSession({ project, target: resolveBuildTarget(project) }).compileProject()
      if (result.kind !== 'datapack') throw new Error('Expected datapack')
      const entry = result.files.find(file => file.path.endsWith('/main.mcfunction'))!
      const resource = entry.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)!
      pack = deployCorpusPack(root, namespace, result.files)
      await mc.reload()
      for (const [degrees, expected] of [[30, 500], [90, 1000], [-30, -500]]) {
        await mc.command(`scoreboard players set #dx_input effect_inputs ${degrees}`)
        expect((await mc.command(`function ${resource[1]}:${resource[2]}`)).ok).toBe(true)
        expect(await mc.scoreboard('#project_sin', 'effect_outputs')).toBe(expected)
      }
    } finally {
      if (pack) { removeCorpusPack(pack.root, pack.caseId); await mc.reload() }
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  }, 60000)

  test('typed function values execute selected callbacks across module objectives on Paper', async () => {
    const namespace = 'dx_fv'
    const modules = [
      { name: 'app', source: 'module app; import lib::apply; export fn main(): void { let double: (int) -> int = (x: int) => x * 2; let square: (int) -> int = (x: int) => x * x; scoreboard_set("#function_values", "effect_outputs", apply(double, 7) * 100 + apply(square, 9)); }' },
      { name: 'lib', source: 'module lib; export fn apply(f: (int) -> int, x: int): int { return f(x); }' },
    ]
    for (const inputs of [modules, [...modules].reverse()]) {
      const result = compileModules(inputs, { namespace, entryFunctions: ['app/main'] })
      const pack = deployCorpusPack(root, namespace, result.files)
      try {
        await mc.reload()
        await mc.command(`function ${namespace}:app/main`)
        expect(await mc.scoreboard('#function_values', 'effect_outputs')).toBe(1481)
      } finally {
        removeCorpusPack(pack.root, pack.caseId)
        await mc.reload()
      }
    }
  }, 60000)

  test('module globals initialize before user load hooks and preserve independent mutable receivers on Paper', async () => {
    const namespace = 'dx_globals'
    const source = `struct Counter { value: int }
impl Counter {
  fn bump(self): int { self.value = self.value + 1; return self.value; }
  fn reset(self): void { self.value = 0; }
}
let first: Counter = { value: 5 };
let second: Counter = { value: 8 };
let count: int = 7;
fn read_first(): int { return first.value; }
fn inc(): int { count = count + 1; return count; }
fn read_count(): int { return count; }
fn fresh_read(): void { let before: int = count; inc(); scoreboard_set("#fresh_read", "effect_outputs", before * 100 + count * 10 + count); }
fn scalar_shadow(): void { let count: int = 1; count = count + 1; scoreboard_set("#scalar_shadow", "effect_outputs", count * 100 + read_count()); }
@load fn observe_initial(): void { scoreboard_set("#initial", "effect_outputs", first.value * 100 + second.value * 10 + count); say(f"initial={first.value}"); }
fn shadow(): void { let first: Counter = Counter { value: 1 }; scoreboard_set("#shadow", "effect_outputs", first.bump() * 10 + read_first()); }
fn exercise(): void {
  let a: int = first.bump(); let b: int = first.bump(); let c: int = second.bump(); first.reset();
  scoreboard_set("#globals", "effect_outputs", a * 1000 + b * 100 + c * 10 + first.value);
  scoreboard_set("#scalar", "effect_outputs", inc() * 10 + inc());
}`
    const compiled = compile(source, { namespace })
    const capture = compiled.files.find(file => file.path.endsWith('/observe_initial.mcfunction'))!.content.match(/with storage dx_globals:text (c_[a-f0-9]+)/)![1]
    const pack = deployCorpusPack(root, namespace, compiled.files)
    try {
      await mc.reload()
      expect(await mc.scoreboard('#initial', 'effect_outputs')).toBe(587)
      await mc.command(`execute store result score #text_capture effect_outputs run data get storage ${namespace}:text ${capture}.value_0`)
      expect(await mc.scoreboard('#text_capture', 'effect_outputs')).toBe(5)
      await mc.command(`function ${namespace}:shadow`)
      expect(await mc.scoreboard('#shadow', 'effect_outputs')).toBe(25)
      await mc.command(`function ${namespace}:exercise`)
      expect(await mc.scoreboard('#globals', 'effect_outputs')).toBe(6790)
      expect(await mc.scoreboard('#scalar', 'effect_outputs')).toBe(89)
      await mc.command(`function ${namespace}:exercise`)
      expect(await mc.scoreboard('#globals', 'effect_outputs')).toBe(1300)
      expect(await mc.scoreboard('#scalar', 'effect_outputs')).toBe(111)
      await mc.command(`function ${namespace}:fresh_read`)
      expect(await mc.scoreboard('#fresh_read', 'effect_outputs')).toBe(1232)
      await mc.command(`function ${namespace}:scalar_shadow`)
      expect(await mc.scoreboard('#scalar_shadow', 'effect_outputs')).toBe(212)
      await mc.reload()
      expect(await mc.scoreboard('#initial', 'effect_outputs')).toBe(587)
      await mc.command(`function ${namespace}:exercise`)
      expect(await mc.scoreboard('#globals', 'effect_outputs')).toBe(6790)
    } finally {
      removeCorpusPack(pack.root, pack.caseId)
      await mc.reload()
    }
  }, 60000)

  test('standalone selected imports preserve separate private callees on Paper', async () => {
    const directory = fs.mkdtempSync(path.join(root, 'bound-source-'))
    fs.writeFileSync(path.join(directory, 'left.mcrs'), 'module left; fn hidden(): int { return 5; } export fn left_value(): int { return hidden(); }')
    fs.writeFileSync(path.join(directory, 'right.mcrs'), 'module right; fn hidden(): int { return 8; } export fn right_value(): int { return hidden(); }')
    const namespace = 'dx_bound'
    const result = compile('import left::left_value; import right::right_value; fn main(): void { scoreboard_set("#bound_result", "effect_outputs", left_value() + right_value()); }', {
      namespace, filePath: path.join(directory, 'main.mcrs'),
    })
    const pack = deployCorpusPack(root, namespace, result.files)
    try {
      await mc.reload()
      expect((await mc.command(`function ${namespace}:main`)).ok).toBe(true)
      expect(await mc.scoreboard('#bound_result', 'effect_outputs')).toBe(13)
    } finally {
      removeCorpusPack(pack.root, pack.caseId)
      fs.rmSync(directory, { recursive: true, force: true })
      await mc.reload()
    }
  }, 60000)

  test('math showcase uses the actual array bigint API for Fibonacci values on Paper', async () => {
    const filePath = path.resolve(__dirname, '../../examples/math-showcase.mcrs')
    let source = fs.readFileSync(filePath, 'utf8')
    const at50 = 'say(f"  fib(50)  chunks: [{a[1]}][{a[2]}][{a[3]}]");'
    const at70 = 'say(f"  fib(70)  chunks: [{a[0]}][{a[1]}][{a[2]}][{a[3]}]");'
    expect(source).toContain(at50)
    expect(source).toContain(at70)
    // Replace only presentation with an independent scoreboard observation.
    source = source.replace(at50, [1, 2, 3].map(i => `scoreboard_set("#fib50_${i}", "effect_outputs", a[${i}]);`).join('\n'))
    source = source.replace(at70, [0, 1, 2, 3].map(i => `scoreboard_set("#fib70_${i}", "effect_outputs", a[${i}]);`).join('\n'))
    const namespace = 'dx_bigint'
    const result = compile(source, { namespace, filePath })
    const pack = deployCorpusPack(root, namespace, result.files)
    try {
      await mc.reload()
      expect((await mc.command(`function ${namespace}:bigint_showcase`)).ok).toBe(true)
      let left = 0n, right = 1n
      for (let step = 1; step <= 70; step++) {
        ;[left, right] = [right, left + right]
        if (step === 50 || step === 70) {
          const count = step === 50 ? 3 : 4
          for (let index = 0; index < count; index++) {
            const chunk = Number(left / (10000n ** BigInt(count - index - 1)) % 10000n)
            expect(await mc.scoreboard(`#fib${step}_${index + (step === 50 ? 1 : 0)}`, 'effect_outputs')).toBe(chunk)
          }
        }
      }
    } finally {
      removeCorpusPack(pack.root, pack.caseId)
      await mc.reload()
    }
  }, 60000)

  test.each(['random', 'random_native'])('%s returns native values for literal and dynamic bounds on Paper', async name => {
    const namespace = 'dx_random'
    const result = compile(`fn main(): void {
      scoreboard_set("#fixed", "effect_outputs", ${name}(7, 7));
      let low: int = scoreboard_get("#rng_low", "effect_inputs");
      let high: int = scoreboard_get("#rng_high", "effect_inputs");
      scoreboard_set("#bounded", "effect_outputs", ${name}(low, high));
    }`, { namespace })
    const pack = deployCorpusPack(root, namespace, result.files)
    try {
      await mc.reload()
      for (const [low, high] of [[2, 5], [4, 4], [-5, -2], [-3, -3]]) {
        await mc.command(`scoreboard players set #rng_low effect_inputs ${low}`)
        await mc.command(`scoreboard players set #rng_high effect_inputs ${high}`)
        expect((await mc.command(`function ${namespace}:main`)).ok).toBe(true)
        expect(await mc.scoreboard('#fixed', 'effect_outputs')).toBe(7)
        const bounded = await mc.scoreboard('#bounded', 'effect_outputs')
        expect(bounded).toBeGreaterThanOrEqual(low)
        expect(bounded).toBeLessThanOrEqual(high)
      }
    } finally {
      removeCorpusPack(pack.root, pack.caseId)
      await mc.reload()
    }
  }, 60000)

  test('cross-module selector and string ABI marks only selected entities on Paper', async () => {
    const namespace = 'dx_abi'
    const result = compileModules([
      { name: 'app', objective: '__abi_app', source: 'module app; import lib::mark; export fn main(): void { mark(@e[tag=dx_abi_chosen], "dx_abi_marked"); }' },
      { name: 'lib', objective: '__abi_lib', source: 'module lib; export fn mark(target: selector, label: string): void { tag_add(target, label); }' },
    ], { namespace, entryFunctions: ['app/main'] })
    const pack = deployCorpusPack(root, namespace, result.files)
    try {
      await mc.reload()
      for (const x of [0, 1]) expect((await mc.command(`summon minecraft:marker ${x} 64 0 {Tags:["dx_abi_chosen"]}`)).ok).toBe(true)
      expect((await mc.command('summon minecraft:marker 2 64 0 {Tags:["dx_abi_control"]}')).ok).toBe(true)
      await mc.command('scoreboard players set #abi_hits effect_outputs 0')
      expect((await mc.command(`function ${namespace}:app/main`)).ok).toBe(true)
      await mc.command('execute as @e[tag=dx_abi_marked] run scoreboard players add #abi_hits effect_outputs 1')
      expect(await mc.scoreboard('#abi_hits', 'effect_outputs')).toBe(2)
    } finally {
      await mc.command('kill @e[tag=dx_abi_chosen]')
      await mc.command('kill @e[tag=dx_abi_control]')
      removeCorpusPack(pack.root, pack.caseId)
      await mc.reload()
    }
  }, 60000)

  test('selector parameter iteration executes for the selected entities on Paper', async () => {
    const namespace = 'dx_selector'
    const result = compile(`
      fn visit(target: selector): void {
        foreach (p in target) { scoreboard_set("#selector_hits", "effect_outputs", scoreboard_get("#selector_hits", "effect_outputs") + 1); }
      }
      fn main(): void { visit(@e[tag=dx_selector_chosen]); }
    `, { namespace })
    const pack = deployCorpusPack(root, namespace, result.files)
    try {
      await mc.reload()
      await mc.command('summon minecraft:marker 0 64 0 {Tags:["dx_selector_chosen"]}')
      await mc.command('summon minecraft:marker 1 64 0 {Tags:["dx_selector_chosen"]}')
      await mc.command('scoreboard players set #selector_hits effect_outputs 0')
      expect((await mc.command(`function ${namespace}:main`)).ok).toBe(true)
      expect(await mc.scoreboard('#selector_hits', 'effect_outputs')).toBe(2)
    } finally {
      await mc.command('kill @e[tag=dx_selector_chosen]')
      removeCorpusPack(pack.root, pack.caseId)
      await mc.reload()
    }
  }, 60000)

  test('inverse trig scale, signs and Option payload binding on Paper', async () => {
    const namespace = 'dx_numeric'
    const source = `import math;
      fn evaluate(): void {
        let x: int = scoreboard_get("#dx_input", "effect_inputs");
        scoreboard_set("#dx_asin", "effect_outputs", asin_approx(x));
        scoreboard_set("#dx_acos", "effect_outputs", acos_approx(x));
        let option: Option<int> = Some(x);
        let result: int = 0;
        match option { Some(value) => { result = value + 1; } None => { result = -1; } }
        scoreboard_set("#dx_option", "effect_outputs", result);
      }`
    const pack = deployCorpusPack(root, namespace, compile(source, { namespace, mcVersion: McVersion.v1_21_4 }).files)
    try {
      await mc.reload()
      for (const [input, expected] of [[-20000, -900000], [-10000, -900000], [-5000, -300000], [0, 0], [5000, 300000], [10000, 900000], [20000, 900000]]) {
        await mc.command(`scoreboard players set #dx_input effect_inputs ${input}`)
        expect((await mc.command(`function ${namespace}:evaluate`)).ok).toBe(true)
        expect(await mc.scoreboard('#dx_asin', 'effect_outputs')).toBe(expected)
        expect(await mc.scoreboard('#dx_acos', 'effect_outputs')).toBe(900000 - expected)
        expect(await mc.scoreboard('#dx_option', 'effect_outputs')).toBe(input + 1)
      }
    } finally {
      removeCorpusPack(pack.root, pack.caseId)
      await mc.reload()
    }
  }, 60000)

  const nativeArithmetic: Array<[string, number, string, number, number]> = [
    ['large product', 2147483647, '*=', 2147483647, 1],
    ['negative large product', -2147483647, '*=', 2147483647, -1],
    ['addition wrap', 2147483647, '+=', 1, -2147483648],
    ['subtraction wrap', -2147483648, '-=', 1, 2147483647],
    ['division negative numerator', -7, '/=', 3, -3],
    ['division negative divisor', 7, '/=', -3, -3],
    ['division both negative', -7, '/=', -3, 2],
    ['division overflow', -2147483648, '/=', -1, -2147483648],
    ['modulo negative numerator', -7, '%=', 3, 2],
    ['modulo negative divisor', 7, '%=', -3, -2],
    ['modulo both negative', -7, '%=', -3, -1],
  ]
  test.each(nativeArithmetic)('native scoreboard semantics: %s', async (_name, left, operator, right, expected) => {
    await mc.command(`scoreboard players set #left effect_inputs ${left}`)
    await mc.command(`scoreboard players set #right effect_inputs ${right}`)
    const operation = await mc.command(`scoreboard players operation #left effect_inputs ${operator} #right effect_inputs`)
    expect(operation.ok).toBe(true)
    expect(await mc.scoreboard('#left', 'effect_inputs')).toBe(expected)
  })

  for (const useEffects of [false, true]) {
    describe(useEffects ? 'effect-aware output' : 'conservative output', () => {
      for (const descriptor of SCORE_EFFECTS_CASES) {
        test(descriptor.name, async () => {
          const baseline = useEffects ? undefined : jest.spyOn(effects, 'findScoreboardPreservingFunctions')
            .mockReturnValue(new Set<string>())
          try {
            const result = await runMcCoreCase(descriptor, { client: mc, serverRoot: root })
            if (result.status !== 'passed') throw new Error(JSON.stringify(result, null, 2))
          } catch (error) {
            console.error(managed?.currentOutput().split('\n').slice(-30).join('\n'))
            throw error
          } finally {
            baseline?.mockRestore()
          }
        }, 30000)
      }
    })
  }
})
