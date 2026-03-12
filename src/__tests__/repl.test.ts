import { ReplSession } from '../repl'

describe('ReplSession', () => {
  it('keeps statements between evaluations', () => {
    const session = new ReplSession('repltest')

    session.evaluate('let value: int = 1')
    const result = session.evaluate('value = value + 1')

    expect(session.getSource()).toContain('let value: int = 1;')
    expect(session.getSource()).toContain('value = value + 1;')
    expect(result.output).toContain('data/repltest/function/__repl.mcfunction')
  })

  it('keeps top-level declarations between evaluations', () => {
    const session = new ReplSession('repltest')

    session.evaluate('fn damage(amount: int, multiplier: int = 1) -> int { return amount * multiplier; }')
    session.evaluate('let dealt: int = damage(10)')

    expect(session.getSource()).toContain('fn damage(amount: int, multiplier: int = 1) -> int { return amount * multiplier; }')
    expect(session.getSource()).toContain('let dealt: int = damage(10);')
  })

  it('clears state', () => {
    const session = new ReplSession('repltest')

    session.evaluate('let value: int = 1')
    session.clear()

    expect(session.getSource()).toBe('fn __repl() {\n}')
  })
})
