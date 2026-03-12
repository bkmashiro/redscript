# RedScript VSCode Extension

Syntax highlighting and snippets for [RedScript](https://github.com/bkmashiro/redscript) — a compiler targeting Minecraft Java Edition datapacks.

## Features

- **RedScript syntax highlighting** (`.rs` files)
  - Keywords: `fn`, `let`, `struct`, `if`, `while`, `for`, `foreach`, `as`, `at`
  - Entity selectors: `@a`, `@e[type=zombie, distance=..5]`, etc.
  - Range literals: `..5`, `1..`, `1..10`
  - Decorators: `@tick`, `@tick(rate=20)`, `@on_trigger("name")`
  - Built-in functions: `say`, `kill`, `give`, `effect`, `raw`, `random`, `spawn_object`
  - Types: `int`, `float`, `bool`, `string`, `void`

- **mcfunction syntax highlighting** (`.mcfunction` files)
  - Full command syntax from [MinecraftCommands/syntax-mcfunction](https://github.com/MinecraftCommands/syntax-mcfunction)
  - Entity selectors, NBT, coordinates, resource locations

- **Code snippets**
  - `fn` → function declaration
  - `tickfn` → `@tick` function
  - `tickratefn` → `@tick(rate=N)` function
  - `trigfn` → `@on_trigger` handler
  - `foreach` → entity foreach loop
  - `struct` → struct declaration
  - `for` → C-style for loop
  - `spawn` → spawn_object call
  - And more...

## Install

### From VSIX (manual)

```bash
cd editors/vscode
npm install -g @vscode/vsce
vsce package
code --install-extension redscript-vscode-0.1.0.vsix
```

### Note on `.rs` extension

RedScript uses `.rs` files, same as Rust. If you have the Rust extension installed, you may need to associate `.rs` files with RedScript manually:

```json
// settings.json
{
  "files.associations": {
    "*.rs": "redscript"
  }
}
```

Or use `.mcrs` extension (we may switch to this in future).

## Usage

Write RedScript code with full syntax highlighting:

```
@tick(rate=20)
fn check_zombies() {
    foreach (z in @e[type=zombie, distance=..10]) {
        kill(z);
    }
}

@on_trigger("claim_reward")
fn handle_claim() {
    give(@s, "minecraft:diamond", 1);
}
```

Compile with the CLI:

```bash
redscript compile src/main.rs -o dist/mypack/
```
