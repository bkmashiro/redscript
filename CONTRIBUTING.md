# Contributing to RedScript

Thanks for your interest in contributing to RedScript! 🎮

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
git clone https://github.com/bkmashiro/redscript.git
cd redscript
npm install
npm run build
npm test
```

### Project Structure

```
redscript/
├── src/
│   ├── parser/         # Lexer & Parser (grammar → AST)
│   ├── lowering/       # AST → mcfunction code generation
│   ├── cli.ts          # CLI entry point
│   ├── stdlib/         # Standard library (.mcrs files)
│   ├── examples/       # Example datapacks
│   └── __tests__/      # Jest tests
├── redscript-vscode/   # VSCode extension
└── docs/               # Documentation
```

## Development Workflow

### Building

```bash
npm run build    # Compile TypeScript
npm run watch    # Watch mode
```

### Testing

```bash
npm test         # Run all tests
npm test -- --watch  # Watch mode
npm test -- -t "foreach"  # Run specific test
```

### Code Style

- TypeScript with strict mode
- No semicolons (handled by prettier)
- 2-space indentation

## Making Changes

### Adding a New Builtin Function

1. Add to `BUILTINS` map in `src/lowering/index.ts`:

```typescript
my_builtin: ([arg1, arg2]) => `my command ${arg1} ${arg2}`,
```

2. For complex builtins (returning values), add special handling in `lowerCall()`.

3. Add tests in `src/__tests__/`:

```typescript
it('compiles my_builtin', () => {
  const source = `fn test() { my_builtin("a", "b"); }`
  const files = compile(source)
  expect(getFunction(files, 'test')).toContain('my command a b')
})
```

4. Add documentation in docs.

### Adding Language Features

1. Update grammar in `src/parser/` (lexer + parser)
2. Add AST types if needed
3. Update lowering in `src/lowering/`
4. Add comprehensive tests
5. Update VSCode extension syntax highlighting

### Stdlib Contributions

Add utility functions to `src/stdlib/`:

```mcrs
// src/stdlib/my_utils.mcrs

/// Useful helper function
fn my_helper(target: selector) {
    // implementation
}
```

## Pull Request Process

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes with tests
4. Run `npm run build && npm test`
5. Commit with clear message: `feat: add X` / `fix: resolve Y`
6. Push and open PR

### Commit Convention

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring
- `chore:` Maintenance

## Testing on Real Server

For integration testing with a real Minecraft server:

1. Set up Paper 1.21.4 server with [testharness plugin](https://github.com/bkmashiro/redscript-testharness)
2. Run: `npm run test:mc`

See [Testing Guide](https://redscript-docs.pages.dev/en/guide/testing) for details.

## Need Help?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Join discussions in GitHub Discussions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
