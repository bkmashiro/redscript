# RedScript Compiler

RedScript compiles to Minecraft Java Edition datapacks (`.mcfunction`).
**npm:** `redscript-mc` | **VSCode:** `redscript-vscode`

## Build & Test

```bash
npm run build && npm test   # always run together; tests must be green before commit
```

Current baseline: **877/877 tests**.

## Rules

- `trash` not `rm`
- `git commit` (GPG is passwordless)
- `git pull --rebase` before push
- No `Co-Authored-By` in commits
- Small commits — one logical unit each
- Lowercase MC function names; file ext `.mcrs`

## Architecture

7-stage pipeline: `AST → HIR → MIR (3-addr CFG) → MIR opt → LIR → LIR opt → .mcfunction`

```
src/
  lexer/ parser/ ast/       Stage 1
  hir/                      Stage 2 (HIR types + AST→HIR)
  mir/                      Stage 3 (MIR types + HIR→MIR)
  optimizer/                Stage 4 (MIR passes incl. coroutineTransform)
  lir/                      Stage 5 (LIR types + MIR→LIR)
  emit/                     Stage 6+7 (LIR opt + codegen)
  runtime/                  MCRuntime simulator (tests)
  stdlib/                   math.mcrs, vec.mcrs, etc.
  __tests__/                877 Jest tests
```

Key: scoreboard obj = `` `__${namespace}` ``; macro sentinel = `\x01`; IR vars = `$fnname_varname`

## Docs (read before implementing)

- `docs/ROADMAP.md` — what to build next and in what order
- `docs/compiler-pipeline-redesign.md` — full pipeline spec + coroutine transform
- `docs/optimization-ideas.md` — optimization pass catalogue

## Test Server

```bash
cd ~/mc-test-server && /opt/homebrew/opt/openjdk@21/bin/java -jar paper.jar --nogui
node dist/cli.js compile examples/readme-demo.mcrs -o ~/mc-test-server/world/datapacks/rsdemo --namespace rsdemo
# in-game: /reload && /function rsdemo:start
```
