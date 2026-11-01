import { compile } from '../compile'

test('selector parameter iteration retains the runtime selector instead of executing once', () => {
  const result = compile(`
    fn visit(target: selector): void {
      foreach (p in target) { scoreboard_set(p, "visited", 1); }
    }
    fn main(): void { visit(@e[tag=chosen]); }
  `, { namespace: 'selector_args' })
  const commands = result.files.filter(file => file.path.endsWith('.mcfunction')).map(file => file.content).join('\n')
  expect(commands).toContain('set value "@e[tag=chosen]"')
  expect(commands).toMatch(/\$execute as \$\(target\) run function selector_args:/)
})
