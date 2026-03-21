import { compile } from '../../emit/compile'

function allContent(result: ReturnType<typeof compile>): string {
  return result.files.map(f => f.content).join('\n')
}

describe('compiler: string match', () => {
  test('compiles string literal match arms via rs:strings storage checks', () => {
    const result = compile(`
      fn handle_cmd(cmd: string): void {
        match cmd {
          "help" => { say("help") }
          "quit" => { say("quit") }
          _ => { say("other") }
        }
      }
    `, { namespace: 'test' })

    const content = allContent(result)
    expect(content).toContain('execute store success score $handle_cmd_t0 __test if data storage rs:strings __sp0 matches "help"')
    expect(content).toContain('execute store success score $handle_cmd_t2 __test if data storage rs:strings __sp0 matches "quit"')
    expect(content).toContain('say help')
    expect(content).toContain('say quit')
    expect(content).toContain('say other')
  })

  test('copies string call arguments into string parameter slots before matching', () => {
    const result = compile(`
      fn handle_cmd(cmd: string): void {
        match cmd {
          "help" => { say("help") }
          _ => { say("other") }
        }
      }

      fn main(): void {
        handle_cmd("help")
      }
    `, { namespace: 'test' })

    const content = allContent(result)
    expect(content).toContain('data modify storage rs:strings __sp0 set from storage rs:strings')
    expect(content).toContain('set value "help"')
  })
})
