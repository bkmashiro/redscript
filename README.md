# RedScript 🔴

> A compiler that targets Minecraft Java Edition — compile high-level code to `.mcfunction` datapacks or command block structures.

## Architecture

```
Source code (.rs)
      │
      ▼
   Lexer / Parser
      │
      ▼
     AST
      │
      ▼
  IR Lowering  ←── IRBuilder
      │
      ▼
  Optimizer  ←── constant folding, copy propagation, DCE
      │
      ▼
  Code Generator
      ├── mcfunction (datapack) ✅
      └── command block structure (.nbt) 🚧
```

## IR Design

Three-Address Code (TAC) with explicit basic blocks and control-flow graph.

```ts
// Variables → scoreboard fake players on objective "rs"
// e.g.  $x rs,  $t0 rs,  $ret rs

// Instructions
{ op: 'assign',  dst: '$x',  src: { kind: 'const', value: 42 } }
{ op: 'binop',   dst: '$z',  lhs: '$x', bop: '+', rhs: '$y' }
{ op: 'cmp',     dst: '$r',  lhs: '$x', cop: '>', rhs: '$y' }
{ op: 'call',    fn: 'add',  args: ['$a', '$b'], dst: '$result' }
{ op: 'raw',     cmd: 'say hello world' }     // MC escape hatch
{ op: 'tick_yield' }                          // wait 1 tick (cmd block target)
```

## MC Java Edition Primitive Mapping

| Concept | MC Command |
|:--------|:-----------|
| Integer variable | `scoreboard players set $x rs <val>` |
| Arithmetic | `scoreboard players operation $x rs += $y rs` |
| Comparison | `execute if score $x rs > $y rs run ...` |
| Function call | `function ns:fn_name` |
| Return value | fake player `$ret rs` + `return` (1.20+) |
| Delayed exec | `schedule function ns:cont 1t replace` |
| Complex data | `data modify storage ns:heap ...` |
| Tick loop | registered in `minecraft:tick` function tag |

## Optimization Passes

1. **Constant Folding** — `2 + 3` → `5` at compile time
2. **Copy Propagation** — eliminate redundant temporaries
3. **Dead Code Elimination** — remove never-read assignments

## Status

- [x] IR type system (`src/ir/types.ts`)
- [x] IR builder helper (`src/ir/builder.ts`)
- [x] Optimizer pipeline (`src/optimizer/passes.ts`)
- [x] mcfunction codegen (`src/codegen/mcfunction/`)
- [x] Tests (15 passing)
- [ ] Lexer
- [ ] Parser / AST
- [ ] AST → IR lowering
- [ ] Command block codegen

## Quick Start

```bash
npm install
npm test       # run all tests
npm run build  # compile TypeScript
```
