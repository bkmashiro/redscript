/**
 * Tests for the interface / trait system.
 *
 * RedScript supports:
 *   - `interface <Name> { fn <method>(<params>): <ret> }` declarations
 *   - `impl <Interface> for <Struct> { ... }` implementations
 *   - Compile-time verification that all required methods are implemented
 *   - Multiple structs implementing the same interface
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { TypeChecker } from '../../typechecker'
import type { InterfaceDecl, InterfaceMethod } from '../../ast/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function typeCheck(source: string) {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens, source).parse('test')
  const checker = new TypeChecker(source)
  return checker.check(ast)
}

// ---------------------------------------------------------------------------
// Sample sources
// ---------------------------------------------------------------------------

const DRAWABLE_INTERFACE = `
interface Drawable {
  fn draw(self, x: int, y: int)
  fn get_bounds(self): (int, int, int, int)
}
`

const SPRITE_STRUCT = `
struct Sprite {
  tile_id: int,
  width: int,
  height: int,
}
`

const SPRITE_IMPL_FULL = `
${DRAWABLE_INTERFACE}
${SPRITE_STRUCT}

impl Drawable for Sprite {
  fn draw(self: Sprite, x: int, y: int) {
    particle("dust", x, y, 0)
  }
  fn get_bounds(self: Sprite): (int, int, int, int) {
    return (0, 0, self.width, self.height)
  }
}
`

const SPRITE_IMPL_MISSING_METHOD = `
${DRAWABLE_INTERFACE}
${SPRITE_STRUCT}

impl Drawable for Sprite {
  fn draw(self: Sprite, x: int, y: int) {
    particle("dust", x, y, 0)
  }
}
`

const SPRITE_IMPL_MISSING_BOTH = `
${DRAWABLE_INTERFACE}
${SPRITE_STRUCT}

impl Drawable for Sprite {
}
`

// ---------------------------------------------------------------------------
// 1. Parser: interface declaration
// ---------------------------------------------------------------------------

describe('interface — parser', () => {
  test('parses interface declaration', () => {
    const ast = parse(DRAWABLE_INTERFACE)
    expect(ast.interfaces).toHaveLength(1)
    expect(ast.interfaces[0].name).toBe('Drawable')
  })

  test('interface has correct method count', () => {
    const ast = parse(DRAWABLE_INTERFACE)
    const iface = ast.interfaces[0]
    expect(iface.methods).toHaveLength(2)
  })

  test('interface method names are correct', () => {
    const ast = parse(DRAWABLE_INTERFACE)
    const iface = ast.interfaces[0]
    expect(iface.methods.map(m => m.name)).toEqual(['draw', 'get_bounds'])
  })

  test('interface method params are parsed', () => {
    const ast = parse(DRAWABLE_INTERFACE)
    const drawMethod = ast.interfaces[0].methods.find(m => m.name === 'draw')!
    expect(drawMethod).toBeDefined()
    // self, x, y
    expect(drawMethod.params).toHaveLength(3)
    expect(drawMethod.params[0].name).toBe('self')
    expect(drawMethod.params[1].name).toBe('x')
    expect(drawMethod.params[2].name).toBe('y')
  })

  test('interface method return type is parsed', () => {
    const ast = parse(DRAWABLE_INTERFACE)
    const getBoundsMethod = ast.interfaces[0].methods.find(m => m.name === 'get_bounds')!
    expect(getBoundsMethod).toBeDefined()
    expect(getBoundsMethod.returnType).toMatchObject({
      kind: 'tuple',
      elements: [
        { kind: 'named', name: 'int' },
        { kind: 'named', name: 'int' },
        { kind: 'named', name: 'int' },
        { kind: 'named', name: 'int' },
      ],
    })
  })

  test('interface with no methods is valid', () => {
    const ast = parse(`interface Empty {}`)
    expect(ast.interfaces).toHaveLength(1)
    expect(ast.interfaces[0].methods).toHaveLength(0)
  })

  test('impl block traitName is set for trait impls', () => {
    const ast = parse(SPRITE_IMPL_FULL)
    const implBlock = ast.implBlocks.find(b => b.traitName === 'Drawable')
    expect(implBlock).toBeDefined()
    expect(implBlock!.typeName).toBe('Sprite')
  })
})

// ---------------------------------------------------------------------------
// 2. TypeChecker: full implementation passes
// ---------------------------------------------------------------------------

describe('interface — typechecker: full implementation', () => {
  test('full implementation produces no errors', () => {
    const errors = typeCheck(SPRITE_IMPL_FULL)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors).toHaveLength(0)
  })

  test('impl without trait name is not interface-checked', () => {
    const src = `
      struct Vec2 { x: int, y: int }
      impl Vec2 { fn len(self: Vec2): int { return self.x } }
    `
    const errors = typeCheck(src)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3. TypeChecker: missing methods produce errors
// ---------------------------------------------------------------------------

describe('interface — typechecker: missing methods', () => {
  test('missing one method produces one error', () => {
    const errors = typeCheck(SPRITE_IMPL_MISSING_METHOD)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors).toHaveLength(1)
    expect(ifaceErrors[0].message).toContain("'get_bounds'")
    expect(ifaceErrors[0].message).toContain('Drawable')
  })

  test('missing both methods produces two errors', () => {
    const errors = typeCheck(SPRITE_IMPL_MISSING_BOTH)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors).toHaveLength(2)
  })

  test('error message includes struct name', () => {
    const errors = typeCheck(SPRITE_IMPL_MISSING_METHOD)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors[0].message).toContain('Sprite')
  })

  test('error message includes interface name', () => {
    const errors = typeCheck(SPRITE_IMPL_MISSING_METHOD)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors[0].message).toContain('Drawable')
  })
})

// ---------------------------------------------------------------------------
// 4. Multiple structs implementing the same interface
// ---------------------------------------------------------------------------

describe('interface — multiple structs', () => {
  const MULTI_SRC = `
${DRAWABLE_INTERFACE}

struct Sprite {
  tile_id: int,
  width: int,
  height: int,
}

struct Particle {
  size: int,
}

impl Drawable for Sprite {
  fn draw(self: Sprite, x: int, y: int) {
    particle("dust", x, y, 0)
  }
  fn get_bounds(self: Sprite): (int, int, int, int) {
    return (0, 0, self.width, self.height)
  }
}

impl Drawable for Particle {
  fn draw(self: Particle, x: int, y: int) {
    particle("flame", x, y, 0)
  }
  fn get_bounds(self: Particle): (int, int, int, int) {
    return (0, 0, self.size, self.size)
  }
}
`

  test('two full implementations produce no errors', () => {
    const errors = typeCheck(MULTI_SRC)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors).toHaveLength(0)
  })

  test('both structs found in AST impl blocks', () => {
    const ast = parse(MULTI_SRC)
    const drawableImpls = ast.implBlocks.filter(b => b.traitName === 'Drawable')
    expect(drawableImpls).toHaveLength(2)
    const typeNames = drawableImpls.map(b => b.typeName)
    expect(typeNames).toContain('Sprite')
    expect(typeNames).toContain('Particle')
  })

  test('partial second impl is detected', () => {
    const src = `
${DRAWABLE_INTERFACE}

struct Sprite {
  tile_id: int,
  width: int,
  height: int,
}

struct Particle {
  size: int,
}

impl Drawable for Sprite {
  fn draw(self: Sprite, x: int, y: int) {
    particle("dust", x, y, 0)
  }
  fn get_bounds(self: Sprite): (int, int, int, int) {
    return (0, 0, self.width, self.height)
  }
}

impl Drawable for Particle {
  fn draw(self: Particle, x: int, y: int) {
    particle("flame", x, y, 0)
  }
}
`
    const errors = typeCheck(src)
    const ifaceErrors = errors.filter(e => e.message.includes('does not implement'))
    expect(ifaceErrors).toHaveLength(1)
    expect(ifaceErrors[0].message).toContain('Particle')
  })
})
