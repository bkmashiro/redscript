# Event Runtime Boundary Plan

> **For Hermes:** Use this as the design boundary before changing RedScript event decorators. Keep compiler changes generic and stdlib/runtime changes explicit.

**Goal:** Move Minecraft game-behavior event semantics out of compiler hardcoding and toward stdlib/runtime-owned dispatch.

**Architecture:** The compiler should expose artifact-level primitives such as registering a function in a datapack function tag. Stdlib/runtime code should own detection of gameplay events such as player death, item use, entity kill, advancement triggers, and per-tick cleanup.

**Tech Stack:** TypeScript compiler pipeline, RedScript decorators, vanilla datapack function tags, stdlib `.mcrs` runtime assets.

---

## Current problem

`@on(EventType)` currently crosses the compiler/runtime boundary:

- `src/events/types.ts` hardcodes legacy gameplay events such as `PlayerDeath`, `PlayerJoin`, `EntityKill`, and `ItemUse`.
- `src/typechecker/index.ts` knows event names and handler parameter signatures.
- `src/emit/index.ts` knows event-to-tag mappings such as `PlayerDeath -> data/rs/tags/function/on_player_death.json`.
- `src/emit/compile.ts` collects `@on(...)` handlers as compiler metadata.

These event names are Minecraft runtime/game-behavior policy, not core language semantics. The current parameter shape is also misleading: Minecraft function tags cannot pass event parameters. Handler functions run through an execution context such as `execute as @a[...] run function ...`, so `@s` is the honest boundary unless RedScript later grows an explicit runtime event-context object. Legacy event registry entries now carry an explicit `executorContext` (currently `Player` for the built-in runtime events) so the typechecker can narrow `@s` inside `@on` handlers without pretending the function tag passed a parameter.

## Boundary rule

Compiler responsibility:

- Parse and validate generic artifact registration decorators.
- Register compiled functions into datapack function tags.
- Validate namespace/path legality and generated artifact references.
- Copy or emit generic datapack assets requested by stdlib/runtime metadata.

Stdlib/runtime responsibility:

- Detect gameplay events.
- Create and clean scoreboard objectives/tags/advancements/predicates.
- Decide handler execution context (`execute as`, `execute at`, selector filters, tick polling).
- Document event semantics and limitations.

## Migration path

1. Freeze `@on(EventType)` as legacy/runtime-backed sugar. Do not add new hardcoded event names in compiler core.
2. Add a compiler primitive:

```rs
@function_tag("rs:on_player_death")
fn on_death(): void {
  tell(@s, "rip");
}
```

This only means: add `namespace:function_name` to `data/rs/tags/function/on_player_death.json`.

3. Treat `@tick` and `@load` as aliases of function-tag registration:

```rs
@tick  // equivalent to @function_tag("minecraft:tick")
@load  // equivalent to @function_tag("minecraft:load")
```

`@function_tag("minecraft:tick")` and `@function_tag("minecraft:load")` now merge into the same generated tag files as the built-in decorators instead of emitting duplicate JSON artifacts.

4. Later, introduce stdlib/runtime event manifests if needed:

```json
{
  "events:player_death": {
    "handlerTag": "rs:on_player_death",
    "executorContext": { "kind": "entity", "entityType": "Player" },
    "runtimeAssets": [
      "functions/events/player_death_tick.mcfunction",
      "tags/function/tick.json"
    ]
  }
}
```

5. Optional future sugar can be manifest-driven rather than compiler-hardcoded:

```rs
@event("events:player_death")
fn on_death(): void {
  tell(@s, "rip");
}
```

## Handler parameter guidance

Prefer no fake event parameters for runtime-dispatched handlers:

```rs
@function_tag("rs:on_player_death")
fn on_death(): void {
  tell(@s, "you died");
}
```

Avoid APIs that imply true parameter passing through function tags:

```rs
@on(PlayerDeath)
fn on_death(player: Player): void {}
```

That legacy form remains for compatibility. It now lowers `player` as an alias for the runtime executor (`@s`) instead of allocating a `$p0` scoreboard parameter slot, so generated function-tag handlers still match Minecraft's no-argument dispatch model. New runtime docs should teach `@s` context or a future explicit context object instead.

## Completed implementation slices

- Added `@function_tag("namespace:path")` decorator parsing.
- Emits generic function tag JSON files from compiler metadata.
- Keeps implemented legacy `@on(EventType)` behavior for compatibility.
- Centralized legacy `@on(EventType)` handler tag ids in the shared event registry (`EVENT_TYPES.*.handlerTag`) so emit no longer carries a separate event-to-tag table.
- Removed `BlockBreak` from built-in `@on(EventType)` because the runtime dispatcher never implemented block-break detection; users can still compose block-break behavior explicitly with `@function_tag(...)` and their own datapack assets.
- Allowed legacy `@on(EventType)` handlers to declare zero parameters so users can write runtime-honest handlers around `@s`; the old single `Player` parameter form remains accepted for compatibility.
- Added explicit legacy event executor context metadata (`EVENT_TYPES.*.executorContext`) and typechecker injection so `@s` narrows to the runtime dispatcher's executor type inside `@on` handlers, while plain functions do not silently treat generic `@s` as `Player`.
- Lowered legacy single `Player` event parameters as command aliases for `@s` instead of `$p0` fake parameter slots, preserving compatibility without implying function tags pass event arguments.
- Added tests proving `@function_tag("rs:on_player_death")` can produce the same handler tag file without compiler knowing a gameplay event name.
- Added compatibility tests proving `@function_tag("minecraft:tick")` and `@function_tag("minecraft:load")` use the same generated tag files as `@tick` and `@load`.
