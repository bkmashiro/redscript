# RedScript VSCode Extension

> Version 1.3.80 | [RedScript 3.0](https://github.com/bkmashiro/redscript)

Full language support for [RedScript](https://github.com/bkmashiro/redscript) — a compiler targeting Minecraft Java Edition datapacks.

## Features

### Syntax Highlighting

- **RedScript** (`.mcrs`, `.rs` files)
  - Keywords, types, decorators, operators
  - Entity selectors: `@a`, `@e[type=zombie, distance=..5]`
  - Range literals: `..5`, `1..`, `1..10`
  - Format strings: `f"Hello {name}!"`
  - All 50 stdlib modules

- **mcfunction** (`.mcfunction` files)
  - Full command syntax highlighting
  - Entity selectors, NBT, coordinates

### Language Server (LSP)

- **Diagnostics** — Real-time error checking
- **Hover** — Type info and `///` doc comments
- **Go to Definition** — Jump to function/struct declarations
- **Auto-complete** — Functions, types, stdlib modules
- **Lint warnings** — 5 built-in lint rules

### Code Snippets

| Trigger | Result |
|---------|--------|
| `fn` | Function declaration |
| `tickfn` | `@tick` function |
| `struct` | Struct declaration |
| `match` | Match expression |
| `foreach` | Entity foreach loop |
| `result` | Result<T> handling |

## Install

### VS Code Marketplace

Search for "RedScript" in the Extensions panel, or:
```
ext install bkmashiro.redscript-vscode
```

### Manual (VSIX)

```bash
cd editors/vscode
npm install -g @vscode/vsce
vsce package
code --install-extension redscript-vscode-1.3.80.vsix
```

## File Extensions

- `.mcrs` — Recommended (no conflict with Rust)
- `.rs` — Supported, but may conflict with Rust extension

To force `.rs` as RedScript:
```json
// settings.json
{
  "files.associations": {
    "*.rs": "redscript"
  }
}
```

## Usage

```redscript
import math;
import player;

@tick(rate=20)
fn gravity_check() {
    foreach (p in @a[tag=flying]) {
        let y = player::get_y(p);
        if y > 100 {
            effect::give(p, "slow_falling", 5);
        }
    }
}
```

Compile:
```bash
redscript build src/ -o dist/mypack/
```

## Links

- [RedScript Documentation](https://redscript-docs.pages.dev)
- [Online Playground](https://redscript.pages.dev)
- [GitHub](https://github.com/bkmashiro/redscript)
