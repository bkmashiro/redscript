import { format } from '../../formatter'

describe('formatter edge cases', () => {
  test('preserves indentation inside multi-line strings', () => {
    const input = 'fn main() {\n  let message = "first line\n    second line\n      third line";\n}'
    expect(format(input)).toBe(
      'fn main() {\n' +
      '  let message = "first line\n' +
      '    second line\n' +
      '      third line";\n' +
      '}\n'
    )
  })

  test('ignores braces inside multi-line strings when computing indentation', () => {
    const input = 'fn main() {\n  let message = "open {\nclose }\n  // still string";\n  run();\n}'
    expect(format(input)).toBe(
      'fn main() {\n' +
      '  let message = "open {\n' +
      'close }\n' +
      '  // still string";\n' +
      '  run();\n' +
      '}\n'
    )
  })

  test('keeps empty function bodies on one line', () => {
    expect(format('fn foo(){}')).toBe('fn foo() {}\n')
  })

  test('indents multiline struct fields without forcing alignment columns', () => {
    const input = 'struct Point {\nx: int,\ny: int,\n}'
    expect(format(input)).toBe('struct Point {\n  x: int,\n  y: int,\n}\n')
  })

  test('aligns match arms with the enclosing block indentation', () => {
    const input = 'fn main() {\nmatch value {\n1 => {\nfoo();\n}\n_ => {\nbar();\n}\n}\n}'
    expect(format(input)).toBe(
      'fn main() {\n' +
      '  match value {\n' +
      '    1 => {\n' +
      '      foo();\n' +
      '    }\n' +
      '    _ => {\n' +
      '      bar();\n' +
      '    }\n' +
      '  }\n' +
      '}\n'
    )
  })

  test('ignores braces that appear inside line comments', () => {
    const input = 'fn main() {\n// } comment\nif true {\nrun();\n}\n}'
    expect(format(input)).toBe(
      'fn main() {\n' +
      '  // } comment\n' +
      '  if true {\n' +
      '    run();\n' +
      '  }\n' +
      '}\n'
    )
  })

  test('ignores braces that appear inside doc comments', () => {
    const input = 'fn main() {\nif true {\n/// } doc comment\nrun();\n}\n}'
    expect(format(input)).toBe(
      'fn main() {\n' +
      '  if true {\n' +
      '    /// } doc comment\n' +
      '    run();\n' +
      '  }\n' +
      '}\n'
    )
  })

  test('compresses excessive blank lines around comments', () => {
    const input = '/// docs\n\n\n\nfn main() {}\n'
    expect(format(input)).toBe('/// docs\n\n\nfn main() {}\n')
  })

  test('formats nested if/else blocks with stable indentation', () => {
    const input = 'fn main() {\nif a {\nif b {\nrun();\n} else {\nstop();\n}\n} else {\nwait();\n}\n}'
    expect(format(input)).toBe(
      'fn main() {\n' +
      '  if a {\n' +
      '    if b {\n' +
      '      run();\n' +
      '    } else {\n' +
      '      stop();\n' +
      '    }\n' +
      '  } else {\n' +
      '    wait();\n' +
      '  }\n' +
      '}\n'
    )
  })

  test('wraps long argument lists across multiple lines', () => {
    const input = 'fn main() {\n  really_long_call(alpha, beta, gamma, delta, epsilon, zeta, eta, theta, iota, kappa, lambda, mu);\n}'
    expect(format(input)).toBe(
      'fn main() {\n' +
      '  really_long_call(\n' +
      '    alpha,\n' +
      '    beta,\n' +
      '    gamma,\n' +
      '    delta,\n' +
      '    epsilon,\n' +
      '    zeta,\n' +
      '    eta,\n' +
      '    theta,\n' +
      '    iota,\n' +
      '    kappa,\n' +
      '    lambda,\n' +
      '    mu\n' +
      '  );\n' +
      '}\n'
    )
  })

  test('wraps long function signatures across multiple lines', () => {
    const input = 'fn really_long_name(alpha: int, beta: int, gamma: int, delta: int, epsilon: int, zeta: int): int {\nreturn 1;\n}'
    expect(format(input)).toBe(
      'fn really_long_name(\n' +
      '  alpha: int,\n' +
      '  beta: int,\n' +
      '  gamma: int,\n' +
      '  delta: int,\n' +
      '  epsilon: int,\n' +
      '  zeta: int\n' +
      '): int {\n' +
      '  return 1;\n' +
      '}\n'
    )
  })
})
