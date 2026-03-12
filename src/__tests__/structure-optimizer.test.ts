import { compileToStructure } from '../codegen/structure'

describe('structure target optimizer', () => {
  test('inlines small then-branch into conditional chain', () => {
    const source = `
fn test() {
  let x: int = 5;
  if (x > 3) {
    say("big");
  }
}
`

    const result = compileToStructure(source, 'test')

    expect(result.blocks.some(block => block.command.includes('run function test:test/'))).toBe(false)
    expect(result.blocks.some(block => block.command.includes('say big'))).toBe(true)
  })

  test('emits conditional chain blocks for an inlined if body', () => {
    const source = `
fn test(x: int) {
  if (x > 3) {
    say("big");
    say("still big");
  }
}
`

    const result = compileToStructure(source, 'test')
    const bodyBlocks = result.blocks.filter(block =>
      block.command.includes('say big') || block.command.includes('say still big')
    )

    expect(bodyBlocks).toHaveLength(2)
    expect(bodyBlocks.every(block => block.conditional)).toBe(true)
  })
})
