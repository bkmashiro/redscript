# RedScript In-Game Test Datapacks

These datapacks validate RedScript features directly inside a running Minecraft world. They complement the Jest unit tests and MC integration test suite with real in-game verification.

## Prerequisites

- Minecraft Java Edition 1.20.4+ (1.20.3+ for `random_native` / `random_sequence`)
- RedScript compiler installed (`npm install -g redscript-mc` or built from source)
- A Minecraft world in **survival mode** (required for death-event tests)

## Compiling from Source

The compiled datapacks are already included in this directory. To recompile from the `.mcrs` source files:

```bash
# from the repository root
npm run build          # compile TypeScript → dist/

# compile each test datapack
npx rsc compile test-datapacks/test_control_flow.mcrs \
    --out test-datapacks/test_control_flow \
    --namespace test_control_flow

npx rsc compile test-datapacks/test_decorators.mcrs \
    --out test-datapacks/test_decorators \
    --namespace test_decorators

npx rsc compile test-datapacks/test_events.mcrs \
    --out test-datapacks/test_events \
    --namespace test_events

npx rsc compile test-datapacks/test_fstrings.mcrs \
    --out test-datapacks/test_fstrings \
    --namespace test_fstrings

npx rsc compile test-datapacks/test_timers.mcrs \
    --out test-datapacks/test_timers \
    --namespace test_timers
```

Or compile all at once with the helper script:

```bash
node scripts/compile-test-datapacks.js
```

## Installation

Copy the compiled test folders to your Minecraft world's `datapacks` directory:

```
.minecraft/saves/<world>/datapacks/
├── test_control_flow/
├── test_decorators/
├── test_events/
├── test_fstrings/
└── test_timers/
```

Then run `/reload` in-game (or restart the world). The `@load` decorator in each datapack runs one-time initialization automatically.

## Running the Tests

### Control Flow Tests

```mcfunction
/function test_control_flow:run_control_flow_tests
```

Covers: `if`/`else`, `for i in 0..N`, `while`, `foreach` entity iteration, `break`, `continue`, `do { } while`, `repeat N { }`, and `match` pattern matching (v3.0+).

### Decorator Tests

```mcfunction
/function test_decorators:run_decorator_tests
/function test_decorators:start_tick_test
/function test_decorators:start_slow_tick_test
/function test_decorators:setup_trigger_test
```

Covers: `@load`, `@tick`, `@tick(rate=N)`, `@on_trigger`, `@deprecated` (v3.0+).

### Event Tests

```mcfunction
/function test_events:run_event_tests
```

Covers: `@on(PlayerDeath)`, `@on(PlayerJoin)`, `@on(EntityKill)` (v3.0+).

> **Note:** Die in survival mode to trigger the `PlayerDeath` handler. Join/leave or use `/reload` to trigger `PlayerJoin`.

### F-String & Output Tests

```mcfunction
/function test_fstrings:run_fstring_tests
```

Covers: `say`, `tell`, `title`, `actionbar`, f-string interpolation (`f"hello {name}"`), and MC JSON text component generation.

> **Note:** As of v3.0.1, f-strings use `{expr}` syntax (not `${expr}`).

### Timer Tests

```mcfunction
/function test_timers:run_timer_tests
/function test_timers:test_set_timeout
/function test_timers:test_set_interval
```

Covers: `setTimeout`, `setInterval`. Timer tests produce output after one or more ticks — wait a moment before checking the chat log.

## Reading the Output

Each test prints its result to the in-game chat:

| Prefix | Meaning |
|:--|:--|
| `[PASS]` | Test passed |
| `[FAIL]` | Test failed — check the message for details |
| `[INFO]` | Informational step (not a pass/fail assertion) |

## Resetting State

Run `/reload` between test runs to reset all scoreboard values and datapack state. For timer and tick tests you may also need to wait for any in-flight intervals to expire before re-running.

## Notes

- Run in **survival mode** for death-event tests (`@on(PlayerDeath)`)
- Timer and tick tests are time-dependent — wait a few seconds for results to appear
- The `rs` scoreboard objective is used internally; do not modify it manually during testing
- MC 1.20.3+ required for `random_native` / `random_sequence` builtins used in some tests
