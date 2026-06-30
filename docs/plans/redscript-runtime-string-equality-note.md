# RedScript Runtime String Equality Boundary

Date: 2026-06-30
Status: release-readiness decision; future language ADR may supersede this note.

## Question

Should RedScript implement ordinary runtime string equality now, so examples such as these compile as normal expressions?

```redscript
if (winner == "red") { ... }
if (tagName == "blue") { ... }
if (item == "minecraft:diamond") { ... }
```

## Minecraft capability boundary

Minecraft commands can match string data in specific NBT/SNBT contexts, but they do not provide a cheap/native scoreboard-style string comparison primitive.

Supported or workable forms:

- Literal NBT/SNBT matching, such as testing an entity/storage compound that partially matches `{id:"minecraft:diamond"}` or a list containing a known tag string.
- Item/entity predicates and selector/NBT predicates for fixed command shapes.
- Indirect dynamic comparisons using storage/data-command protocols, for example copying one NBT value to a temporary location and observing whether setting it from another value changes the data.

Unsupported as a simple lowering target:

- Scoreboard values cannot store arbitrary strings.
- `execute if score` cannot compare strings.
- A RedScript scalar expression like `runtimeString == "literal"` cannot be lowered into the existing int/bool scoreboard expression path without introducing a new NBT/string runtime contract.

## Decision for current release-readiness work

Do not implement general runtime string equality in the current release-readiness track.

Instead, fix shipped examples/tutorials that only need finite choices by using integer/enum state:

- `capture_the_flag.mcrs`: represent winner/team as an int/enum code.
- `pvp_arena.mcrs`: represent arena team/state as an int/enum code or static branch selection.
- `tutorial_07_random.mcrs`: represent random item choice as an int/enum code, then branch to literal item commands.

## Rationale

This keeps the current track bounded and product-focused:

- It reduces compile-all skips without adding a broad string object model.
- It aligns with Minecraft's scoreboard-native execution model.
- It avoids committing to storage layout, mutation semantics, equality-vs-copy-success behavior, and MC-version compatibility for dynamic NBT string comparison.

## Future ADR trigger

Open a separate language ADR if RedScript needs first-class runtime strings beyond finite-choice examples. That ADR should specify:

- string storage representation;
- literal-vs-runtime string distinction;
- equality lowering strategy;
- mutation/temp storage policy;
- command count and side-effect constraints;
- Paper/TestHarness behavior oracle cases;
- compatibility with macros, raw commands, and storage/NBT helpers.
