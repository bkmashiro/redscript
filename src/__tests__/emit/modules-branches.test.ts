import { compileModules } from '../../emit/modules'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

describe('emit/modules branch coverage', () => {
  test('rewrites imported helpers through foreach and context blocks', () => {
    const result = compileModules([
      {
        name: 'lib',
        source: [
          'module lib;',
          'export fn helper(): int { return 1; }',
          '',
        ].join('\n'),
      },
      {
        name: 'main',
        source: [
          'import lib::helper;',
          'fn entry(): int {',
          '  let nums: int[] = [1, 2];',
          '  foreach (n in @a) at @s {',
          '    let x: int = helper();',
          '  }',
          '  as @a { let y: int = helper(); }',
          '  at @s { let z: int = helper(); }',
          '  as @a at @s { let w: int = helper(); }',
          '  for item in nums {',
          '    let value: int = helper() + item;',
          '  }',
          '  return helper();',
          '}',
          '',
        ].join('\n'),
      },
    ], { namespace: 'mod_ctx' })

    const allContent = result.files.map(file => file.content).join('\n')
    expect(allContent).toContain('function mod_ctx:lib/helper')
  })

  test('rewrites destructuring, tuple, index, member assign, invoke, and static call inputs', () => {
    const result = compileModules([
      {
        name: 'lib',
        source: [
          'module lib;',
          'export fn helper(): int { return 2; }',
          '',
        ].join('\n'),
      },
      {
        name: 'main',
        source: [
          'import lib::helper;',
          'struct Box { value: int }',
          'struct Util {}',
          'impl Box {',
          '  fn bump(self): int {',
          '    return self.value + helper();',
          '  }',
          '}',
          'impl Util {',
          '  fn build(n: int): int {',
          '    return n + helper();',
          '  }',
          '}',
          'fn pair(): (int, int) { return (helper(), helper()); }',
          'fn entry(): int {',
          '  let (a, b) = pair();',
          '  let nums: int[] = [helper(), helper()];',
          '  let bx: Box = Box { value: helper() };',
          '  bx.value = helper();',
          '  nums[0] = helper();',
          '  let first: int = nums[0];',
          '  let total: int = bx.bump() + Util::build(helper()) + a + b + first;',
          '  return total;',
          '}',
          '',
        ].join('\n'),
      },
    ], { namespace: 'mod_expr' })

    expect(result.files.some(file => file.path.includes('entry.mcfunction'))).toBe(true)
    expect(getFile(result.files, 'box/bump.mcfunction')).toContain('function mod_expr:lib/helper')
    expect(getFile(result.files, 'entry.mcfunction')).toContain('function mod_expr:lib/helper')
  })
})
