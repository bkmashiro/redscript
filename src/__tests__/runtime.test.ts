import * as fs from 'fs'
import * as path from 'path'

import { compile } from '../compile'
import { MCRuntime, Entity } from '../runtime'

function loadCompiledProgram(source: string, namespace = 'runtime'): MCRuntime {
  const result = compile(source, { namespace })
  expect(result.success).toBe(true)
  expect(result.files).toBeDefined()

  const runtime = new MCRuntime(namespace)
  for (const file of result.files ?? []) {
    if (!file.path.endsWith('.mcfunction')) continue

    const match = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!match) continue

    const [, ns, fnPath] = match
    runtime.loadFunction(`${ns}:${fnPath}`, file.content.split('\n'))
  }

  return runtime
}

function loadExample(name: string): string {
  return fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf-8')
}

describe('MCRuntime behavioral integration', () => {
  it('runs the counter example and increments the scoreboard across ticks', () => {
    const runtime = loadCompiledProgram(loadExample('counter.rs'))

    runtime.load()
    runtime.ticks(5)

    expect(runtime.getScore('counter', 'ticks')).toBe(5)
    expect(runtime.tickCount).toBe(5)
  })

  it('executes compiled math control flow and stores the expected result', () => {
    const runtime = loadCompiledProgram(`
fn compute() {
    let x: int = 3;
    let result: int = 0;

    if (x > 2) {
        result = 11;
    } else {
        result = 29;
    }

    scoreboard_set("math", "result", result);
}
`)

    runtime.load()
    runtime.execFunction('compute')

    expect(runtime.getScore('math', 'result')).toBe(11)
  })

  it('captures say, announce, actionbar, and title output in the chat log', () => {
    const runtime = loadCompiledProgram(`
fn chat() {
    say("hello");
    announce("broadcast");
    actionbar(@a, "warning");
    title(@a, "Boss Wave");
}
`)

    runtime.load()
    runtime.execFunction('chat')

    expect(runtime.getChatLog()).toEqual([
      '[Server] hello',
      'broadcast',
      '[ACTIONBAR] warning',
      '[TITLE] Boss Wave',
    ])
  })

  it('renders interpolated strings through tellraw score components', () => {
    const runtime = loadCompiledProgram(`
fn chat() {
    let score: int = 7;
    say("You have \${score} points");
}
`)

    runtime.load()
    runtime.execFunction('chat')

    expect(runtime.getChatLog()).toEqual([
      'You have 7 points',
    ])
  })

  it('kills only entities matched by a foreach selector', () => {
    const runtime = loadCompiledProgram(`
fn purge_zombies() {
    foreach (z in @e[type=zombie]) {
        kill(z);
    }
}
`)

    const zombieA = runtime.spawnEntity(['hostile'], 'minecraft:zombie')
    const zombieB = runtime.spawnEntity(['hostile'], 'zombie')
    const skeleton = runtime.spawnEntity(['hostile'], 'minecraft:skeleton')

    runtime.load()
    runtime.execFunction('purge_zombies')

    expect(runtime.entities.map(entity => entity.id)).toEqual([skeleton.id])
    expect(runtime.entities.find(entity => entity.id === zombieA.id)).toBeUndefined()
    expect(runtime.entities.find(entity => entity.id === zombieB.id)).toBeUndefined()
  })

  it('executes array push, pop, and len through storage operations', () => {
    const runtime = loadCompiledProgram(`
fn arrays() {
    let arr: int[] = [];
    arr.push(4);
    arr.push(9);
    let popped: int = arr.pop();
    let len: int = arr.len;

    scoreboard_set("arrays", "len", len);
    scoreboard_set("arrays", "last", popped);
}
`)

    runtime.load()
    runtime.execFunction('arrays')

    expect(runtime.getScore('arrays', 'len')).toBe(1)
    expect(runtime.getScore('arrays', 'last')).toBe(9)
    expect(runtime.getStorage('rs:heap.arr')).toEqual([4])
  })

  it('tracks world state, weather, and time from compiled world commands', () => {
    const runtime = loadCompiledProgram(`
fn reset_world() {
    let floor_start: BlockPos = (0, 64, 0);
    let floor_end: BlockPos = (1, 64, 1);
    let centerpiece: BlockPos = (1, 64, 1);
    fill(floor_start, floor_end, "minecraft:stone");
    setblock(centerpiece, "minecraft:gold_block");
    weather("rain");
    time_set("noon");
}
`)

    runtime.load()
    runtime.execFunction('reset_world')

    expect(runtime.world.get('0,64,0')).toBe('minecraft:stone')
    expect(runtime.world.get('0,64,1')).toBe('minecraft:stone')
    expect(runtime.world.get('1,64,0')).toBe('minecraft:stone')
    expect(runtime.world.get('1,64,1')).toBe('minecraft:gold_block')
    expect(runtime.weather).toBe('rain')
    expect(runtime.worldTime).toBe(6000)
  })

  it('respects @tick(rate=5) scheduling when ticking the runtime', () => {
    const runtime = loadCompiledProgram(`
@tick(rate=5)
fn pulse() {
    let count: int = scoreboard_get("pulse", "count");
    count = count + 1;
    scoreboard_set("pulse", "count", count);
}
`)

    runtime.load()
    runtime.ticks(10)

    expect(runtime.getScore('pulse', 'count')).toBe(2)
  })

  it('executes only the matching match arm', () => {
    const runtime = loadCompiledProgram(`
fn choose() {
    let choice: int = 2;
    match (choice) {
        1 => { say("one"); }
        2 => { say("two"); }
        _ => { say("other"); }
    }
}
`)

    runtime.load()
    runtime.execFunction('choose')

    expect(runtime.getChatLog()).toEqual([
      '[Server] two',
    ])
  })

  it('updates position, effects, and xp for executor-targeted builtins', () => {
    const runtime = loadCompiledProgram(`
fn buff_player() {
    tp(@s, (5, 70, -2));
    effect(@s, "speed", 15, 2);
    xp_add(@s, 5);
    xp_set(@s, 12, "levels");
}
`)

    const player: Entity = runtime.spawnEntity(['player'], 'minecraft:player')

    runtime.load()
    runtime.execFunction('buff_player', player)

    expect(player.position).toEqual({ x: 5, y: 70, z: -2 })
    expect(runtime.effects.get(player.id)).toEqual([
      { effect: 'speed', duration: 15, amplifier: 2 },
    ])
    expect(runtime.xp.get(player.id)).toBe(12)
  })

  it('executes lambda variables through generated sub-functions', () => {
    const runtime = loadCompiledProgram(`
fn test() {
    let double: (int) -> int = (x: int) => x * 2;
    let result: int = double(5);
    scoreboard_set("lambda", "direct", result);
}
`)

    runtime.load()
    runtime.execFunction('test')

    expect(runtime.getScore('lambda', 'direct')).toBe(10)
  })

  it('executes lambdas passed as callback arguments', () => {
    const runtime = loadCompiledProgram(`
fn apply(val: int, cb: (int) -> int) -> int {
    return cb(val);
}

fn test() {
    let result: int = apply(5, (x: int) => x * 3);
    scoreboard_set("lambda", "callback", result);
}
`)

    runtime.load()
    runtime.execFunction('test')

    expect(runtime.getScore('lambda', 'callback')).toBe(15)
  })

  it('executes block-body lambdas', () => {
    const runtime = loadCompiledProgram(`
fn test() {
    let process: (int) -> int = (x: int) => {
        let doubled: int = x * 2;
        return doubled + 1;
    };
    let result: int = process(5);
    scoreboard_set("lambda", "block", result);
}
`)

    runtime.load()
    runtime.execFunction('test')

    expect(runtime.getScore('lambda', 'block')).toBe(11)
  })

  it('executes immediately-invoked expression-body lambdas', () => {
    const runtime = loadCompiledProgram(`
fn test() {
    let result: int = ((x: int) => x * 2)(5);
    scoreboard_set("lambda", "iife", result);
}
`)

    runtime.load()
    runtime.execFunction('test')

    expect(runtime.getScore('lambda', 'iife')).toBe(10)
  })
})
