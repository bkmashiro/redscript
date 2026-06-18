# Event Runtime Boundary Plan

> **For Hermes:** Use this as the design boundary before changing RedScript event decorators. Keep compiler changes generic and stdlib/runtime changes explicit.

**Goal:** Move Minecraft game-behavior event semantics out of compiler hardcoding and toward stdlib/runtime-owned dispatch.

**Architecture:** The compiler should expose artifact-level primitives such as registering a function in a datapack function tag. Stdlib/runtime code should own detection of gameplay events such as player death, item use, entity kill, advancement triggers, and per-tick cleanup.

**Tech Stack:** TypeScript compiler pipeline, RedScript decorators, vanilla datapack function tags, stdlib `.mcrs` runtime assets.

---

## Current problem

`@on(EventType)` currently crosses the compiler/runtime boundary:

- `src/events/types.ts` hardcodes gameplay events such as `PlayerDeath`, `PlayerJoin`, `BlockBreak`, `EntityKill`, and `ItemUse`.
- `src/typechecker/index.ts` knows event names and handler parameter signatures.
- `src/emit/index.ts` knows event-to-tag mappings such as `PlayerDeath -> data/rs/tags/function/on_player_death.json`.
- `src/emit/compile.ts` collects `@on(...)` handlers as compiler metadata.

These event names are Minecraft runtime/game-behavior policy, not core language semantics. The current parameter shape is also misleading: Minecraft function tags cannot pass event parameters. Handler functions run through an execution context such as `execute as @a[...] run function ...`, so `@s` is the honest boundary unless RedScript later grows an explicit runtime event-context object.

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

3. Treat `@tick` and `@load` as eventual aliases of function-tag registration:

```rs
@tick  // equivalent to @function_tag("minecraft:tick")
@load  // equivalent to @function_tag("minecraft:load")
```

4. Later, introduce stdlib/runtime event manifests if needed:

```json
{
  "events:player_death": {
    "handlerTag": "rs:on_player_death",
    "context": "execute_as_player",
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

That legacy form can remain for compatibility, but new runtime docs should teach `@s` context or a future explicit context object instead.

## Immediate implementation slice

- Add `@function_tag("namespace:path")` decorator parsing.
- Emit generic function tag JSON files from compiler metadata.
- Keep existing `@on(EventType)` behavior untouched for compatibility.
- Add tests proving `@function_tag("rs:on_player_death")` can produce the same handler tag file without compiler knowing a gameplay event name.
