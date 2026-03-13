# RedScript In-Game Test Datapacks

These datapacks test various RedScript features in-game.

## Installation

Copy the test folders to your Minecraft world's `datapacks` folder:

```
.minecraft/saves/<world>/datapacks/
├── test_control_flow/
├── test_decorators/
├── test_events/
├── test_fstrings/
└── test_timers/
```

Run `/reload` in-game.

## Test Commands

### Control Flow Tests
```
/function test_control_flow:run_control_flow_tests
```
Tests: `if`/`else`, `for`, `while`, `foreach`, `break`

### Decorator Tests
```
/function test_decorators:run_decorator_tests
/function test_decorators:start_tick_test
/function test_decorators:start_slow_tick_test
/function test_decorators:setup_trigger_test
```
Tests: `@load`, `@tick`, `@tick(rate=N)`, `@on_trigger`

### Event Tests
```
/function test_events:run_event_tests
```
Tests: `@on_death` (need to die in survival mode)

### F-String & Output Tests
```
/function test_fstrings:run_fstring_tests
```
Tests: `say`, `title`, `actionbar`, `tell`, f-strings with variables

### Timer Tests
```
/function test_timers:run_timer_tests
/function test_timers:test_set_timeout
/function test_timers:test_set_interval
```
Tests: `setTimeout`, `setInterval`

## Expected Results

- `[PASS]` — Test passed
- `[FAIL]` — Test failed
- `[INFO]` — Informational message

## Notes

- Run in survival mode for death events
- Some tests require waiting (timers, tick tests)
- Use `/reload` between test runs to reset state
