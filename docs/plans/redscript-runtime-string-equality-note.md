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

Do exploit safe subsets:

1. **Compile-time string literal specialization.** If a string parameter is only called with literal arguments, the compiler can clone/specialize the callee or constant-fold the string branch before MIR scalar lowering. This should handle patterns like `end_game("red")` / `end_game("blue")` and `count_team("red")` / `count_team("blue")` without any Minecraft runtime string comparison.
2. **Explicit storage/NBT literal predicates, later.** A future bounded helper or syntax may lower an explicitly storage-backed comparison to `execute if data storage ...`/SNBT matching. That should be opt-in and documented as NBT predicate semantics, not normal scalar `string == string`.
3. **Finite-choice branch expansion or int/enum state.** If a value is genuinely selected at runtime from a finite set of string literals and later used as a command argument, prefer branch expansion or int/enum state unless/until RedScript has a designed string-storage ABI.

For current shipped examples/tutorials:

- `capture_the_flag.mcrs`: first try literal specialization for `end_game("red"|"blue")`; only rewrite to int/enum if specialization is not bounded.
- `pvp_arena.mcrs`: first try literal specialization for `count_team("red"|"blue")`; only rewrite to int/enum/static branch helpers if specialization is not bounded.
- `tutorial_07_random.mcrs`: likely needs finite-choice branch expansion or int item codes, because `pick_loot_item(seed)` returns a runtime-selected string used by `give` and `item_name`.

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
