import { compile } from '../../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

describe('emit: compile coverage', () => {
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
