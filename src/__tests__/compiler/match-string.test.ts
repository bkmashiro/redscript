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

  test('specializes literal string call arguments before matching', () => {
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
    expect(content).toContain('function test:handle_cmd__str_cmd__help')
    expect(content).toContain('say help')
    expect(content).not.toContain('say other')
  })
})
