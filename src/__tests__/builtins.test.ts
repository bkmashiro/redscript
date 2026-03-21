import {
  BUILTIN_METADATA,
  builtinToDeclaration,
  generateDts,
} from '../builtins/metadata'

describe('builtin metadata', () => {
  it('keeps metadata entries structurally consistent', () => {
    const entries = Object.entries(BUILTIN_METADATA)

    expect(entries.length).toBeGreaterThan(40)

    for (const [name, def] of entries) {
      expect(def.name).toBe(name)
      expect(def.doc).toBeTruthy()
      expect(def.docZh).toBeTruthy()
      expect(def.category).toBeTruthy()
      expect(def.examples.length).toBeGreaterThan(0)

      for (const param of def.params) {
        expect(param.name).toBeTruthy()
        expect(param.type).toBeTruthy()
        expect(param.doc).toBeTruthy()
        expect(param.docZh).toBeTruthy()
        if (!param.required && param.default !== undefined) {
          expect(param.default).not.toBe('')
        }
      }
    }
  })

  it('supports direct builtin lookup for command docs', () => {
    const say = BUILTIN_METADATA.say
    const kill = BUILTIN_METADATA.kill
    const particle = BUILTIN_METADATA.particle

    expect(say.compilesTo).toBe('say <message>')
    expect(say.category).toBe('chat')
    expect(kill.params[0]).toMatchObject({
      name: 'target',
      required: false,
      default: '@s',
    })
    expect(particle.examples.some(example => example.includes('particle('))).toBe(true)
    expect(BUILTIN_METADATA.nonexistent).toBeUndefined()
  })

  it('renders declarations with optional defaults and runtime-safe type remapping', () => {
    const decl = builtinToDeclaration(BUILTIN_METADATA.effect)

    expect(decl).toContain('/// Applies a status effect to an entity.')
    expect(decl).toContain('/// @param duration Duration in seconds (optional)')
    expect(decl).not.toContain('/// @returns')
    expect(decl).toContain('declare fn effect(target: selector, effect: string, duration: int = 30, amplifier: int = 0): void;')
  })

  it('generates grouped builtins declarations output', () => {
    const dts = generateDts()

    expect(dts).toContain('// builtins.d.mcrs')
    expect(dts).toContain('// Chat & Display')
    expect(dts).toContain('// Player')
    expect(dts).toContain('declare fn say(message: string): void;')
    expect(dts).toContain('declare fn clearInterval(id: int): void;')
  })
})
