# RedScript as a General Datapack Language

> Status: active design and maintenance roadmap
> Researched: 2026-07-30
> Stable target baseline: Minecraft Java Edition 26.2 / Data Pack version 107.1
> Preview watch target: 26.3 Snapshot 5 / Data Pack version 112.0

## Decision

**Yes: RedScript can and should grow from an `.mcfunction` compiler into a general datapack development language.**

The correct extension is not to turn every JSON field into runtime language syntax. It is to make the compiler own a **versioned datapack artifact graph** that contains executable functions, JSON registry entries, tags, structure NBT, metadata, and copied assets. RedScript source can then provide progressively typed authoring surfaces over that graph.

This is a natural continuation of existing work:

- `ResourceDecl` and `Program.resourceDeclarations` already represent non-emitting registry IDs.
- `resource<registry>` types, contextual `namespace:path` literals, declaration files, and LSP catalog hooks already exist.
- the emitter already returns path/content `DatapackFile` artifacts and rejects conflicting generated paths;
- `validateDatapackArtifact` already checks paths, pack metadata, function tags, and local function references.

The missing boundary is **resource definition + validation + emission**. Today `resource item create:glue;` declares an ID for tooling; it cannot define `data/<namespace>/<registry>/<path>.json`.

## What a modern datapack contains

Functions are only one resource kind. In the current stable game, datapacks can contain:

- executable and binary assets: `function/*.mcfunction`, `structure/*.nbt`;
- tags for functions and arbitrary registries;
- reloadable JSON resources: advancements, recipes, loot tables, item modifiers, predicates;
- data-driven gameplay registries: enchantments/providers, dialogs, damage types, instruments, jukebox songs, paintings, armor trims, trial spawners, mob/sound variants, world clocks/timelines, villager trades/trade sets, and the 26.2 sulfur cube archetype;
- world/dimension registries: dimensions, dimension types, biomes, configured/placed features, carvers, density functions, noises, processors, structures, structure sets, template pools, and world presets.

Some dynamic registries require reopening the world or restarting the server rather than `/reload`; the compiler must expose that lifecycle difference instead of treating every artifact as hot-reloadable.

### Important recent changes

#### 26.1 — Data Pack 101.1

- introduced year-based game versions, which broke RedScript's old `1.x`-only version parser;
- added data-driven world clocks and timeline clock/time-marker behavior;
- made villager and wandering-trader trades data-driven (`villager_trade`, `trade_set`);
- added data-driven sound variants for cats, pigs, cows, and chickens;
- expanded environment attributes and tags.

#### 26.2 — Data Pack 107.1 (latest stable at research time)

- added `sulfur_cube_archetype` registry;
- changed entity predicates to namespaced, component-like sub-predicates and now rejects unknown fields;
- expanded world-generation codecs (new feature types, density function and placement behavior);
- continued moving gameplay behavior from hard-coded logic into registries/components.

#### 26.3 snapshots — Data Pack 108.0–112.0 (preview, not a stable target)

The direction becomes even clearer:

- pottery patterns become data-driven;
- reusable `slot_source` resources are used by `/item` and `/execute`;
- reusable `number_provider` resources are introduced;
- material rules and material conditions become named worldgen registries;
- in Snapshot 4, advancement/item-modifier/loot-table/number-provider/predicate/recipe/slot-source fields gain uniform inline-or-reference/tag composition;
- Snapshot 5 allows mixing inline values and named references in element lists.

This is effectively a **composable data DSL inside JSON**. RedScript can add substantial value through typed references, reusable declarations, schema/version diagnostics, navigation, and generated artifacts.

## Product shape

A RedScript project should support three authoring levels.

### Level 1 — universal asset inclusion (complete coverage)

```toml
[assets]
include = ["data/**", "structures/**"]
```

- copy JSON, NBT, and pack metadata overlays into the artifact graph;
- normalize destinations under `data/<namespace>/...`;
- detect collisions with generated functions/resources;
- validate JSON syntax, namespace/path safety, target-version availability, and references where schemas are known.

This level makes RedScript usable for every datapack kind without waiting for bespoke language syntax.

### Level 2 — generic compile-time resources (recommended first language surface)

Extend the existing declaration without inventing a second concept:

```mcrs
resource recipe mypack:blue_torch from "assets/blue_torch.json";
resource structure mypack:arena from "assets/arena.nbt";
resource tags/item mypack:magic_materials from "assets/magic_materials.json";
```

Semantics:

- `resource <kind> <id>;` remains declaration-only and emits nothing;
- adding `from "..."` defines an artifact;
- JSON/NBT is compile-time input, never lowered through HIR/MIR/LIR;
- resource references become available to typecheck/LSP;
- the destination is derived from a versioned registry descriptor, not string concatenation spread across emitters.

A later inline form can be added only after the artifact graph is stable:

```mcrs
resource recipe mypack:blue_torch = json {
  "type": "minecraft:crafting_shaped",
  "pattern": [" T ", " S "],
  "key": { "T": "minecraft:soul_torch", "S": "minecraft:stick" },
  "result": { "id": "minecraft:torch", "count": 4 }
};
```

Start with strict JSON rather than a custom object grammar. Editor schema support gives most of the value without coupling runtime expressions to data codecs.

### Level 3 — typed builders and sugar (selective)

Only high-frequency resources deserve dedicated syntax/builders:

```mcrs
recipe shaped mypack:blue_torch {
  pattern [" T ", " S "]
  key T = minecraft:soul_torch
  key S = minecraft:stick
  result minecraft:torch * 4
}
```

Initial candidates: tags, recipes, advancements, predicates, loot tables, item modifiers. Worldgen should stay on Level 1/2 until schemas and cross-registry references are robust; it changes quickly and has restart/experimental boundaries.

## Architecture

```text
.mcrs functions ───────────────→ HIR → MIR → LIR → function artifacts
resource ... from ... ─────────→ resource loader ─→ JSON/NBT artifacts
project asset includes ────────→ asset loader ─────→ copied artifacts
                                                    │
all producers ──────────────────────────────────────┤
                                                    ▼
                                   DatapackArtifactGraph
                                   - path / kind / id
                                   - content / provenance
                                   - target-version range
                                   - reload lifecycle
                                   - typed references
                                                    │
                         ┌──────────────────────────┼──────────────────────┐
                         ▼                          ▼                      ▼
                  collision merge            validators             zip/directory emit
                  tag merge policy       syntax/schema/ref/version
```

### Required invariants

1. One canonical path resolver for every registry and target version.
2. Duplicate path + different content is an error; identical content may deduplicate.
3. Tags use explicit merge/replace semantics, not last-writer accidents.
4. Source provenance survives into diagnostics: declaration/file/JSON pointer.
5. Schemas are target-versioned. Unknown open registry IDs remain allowed; unknown fields in codecs that reject them are errors.
6. Stable and snapshot schemas are separate channels. Do not silently compile 26.3 syntax for a 26.2 target.
7. JSON resources bypass runtime IR. HIR/MIR/LIR remain for executable behavior.
8. Resource references and declaration-only IDs share the existing `resource<registry>` type/catalog model.

## Current gaps found in the repository

| Area | Current state | Gap |
| --- | --- | --- |
| MC target versions | enum ends at `1.21.4`; parser rejected non-`1.x` | 26.1/26.2 support and exact data pack versions needed |
| Pack format | `1.21.4` incorrectly mapped to `48` | should be `61`; 26.1=`101.1`, 26.2=`107.1` |
| Registry declarations | typed, documented, LSP-aware, non-emitting | cannot carry a definition/source artifact |
| Registry catalog | six tiny hard-coded ID lists | needs generated/versioned catalogs plus package extension loading |
| Artifact model | flat `{path, content}` files | lacks kind/id/provenance/version/lifecycle/reference metadata |
| Artifact validator | paths, `pack.mcmeta`, function refs/tags | no general JSON parse/schema/reference/collision report |
| Project config | source/compiler/output only | no asset roots/includes, schema channel, or overlay policy |
| Testing | strong function/static/live layers | needs generated resource-tree goldens and a real `/reload`/restart oracle split |

## Delivery roadmap

### P0 — current-version maintenance

- [x] accept year-based `26.1`, `26.1.2`, and `26.2` target strings;
- [x] map `1.21.4` to Data Pack 61, `26.1` to 101.1, and `26.2` to 107.1;
- [x] add CLI argument + full compile smoke proving target `26.2` emits `pack_format: 107.1`;
- [ ] audit generated commands against 26.2 command changes before making 26.2 the default;
- [ ] keep default target unchanged until static and real-server validation pass.

### P1 — artifact graph and external assets

- introduce `DatapackArtifact` metadata while preserving `DatapackFile` compatibility at the public boundary;
- centralize registry-to-path descriptors;
- add configured asset roots/includes and safe path resolution;
- merge function/tag/resource/copied outputs through one collision gate;
- golden-test JSON, NBT, tag, duplicate, traversal, and deterministic zip cases.

Acceptance: a mixed project with `.mcrs`, recipe JSON, item tag JSON, and structure NBT builds one deterministic datapack and reports source paths on collisions.

### P2 — `resource ... from ...`

- extend `ResourceDecl` with optional source/format/definition metadata;
- parse declaration-only and defining forms without changing existing syntax;
- resolve source paths relative to the declaring file/project root;
- emit through the artifact graph;
- add completion/go-to-definition between resource IDs and source files.

Acceptance: declaration-only resources emit nothing; defining resources emit exactly one correctly located artifact; package declarations remain non-emitting.

### P3 — schema and reference validation

- maintain stable schema bundles by Data Pack version, generated where possible from Mojang reports/community machine-readable schemas and pinned in-repo with provenance;
- validate JSON with file + JSON-pointer diagnostics;
- extract typed references into the artifact graph;
- report missing local refs, target-version-only fields, and restart-required registries;
- allow unknown external/modded IDs unless a closed codec field is being validated.

Acceptance: malformed recipe/predicate/loot resources fail before packaging; valid cross-resource references support rename/navigation.

### P4 — high-value typed builders

Order: tags → recipes → advancements → predicates → loot tables/item modifiers. Keep strict JSON/from-file as the escape hatch. Do not start with worldgen sugar.

### P5 — stable Minecraft oracle

- install mixed datapacks into a real 26.2 server;
- distinguish `/reload` resources from restart-only dynamic registries;
- assert load success and one deterministic recipe/tag/advancement/loot behavior each;
- keep 26.3 snapshot probes informational and isolated from release gates.

## Non-goals

- no compiler rewrite;
- no attempt to represent arbitrary JSON as runtime RedScript values;
- no closed enum of all Minecraft/modded registries;
- no bespoke syntax for every registry;
- no claim that static schema validation equals successful Minecraft load;
- no default switch to 26.2 before generated command and real-server gates exist;
- no resource-pack language in this tranche (shared artifact ideas may be reused later).

## Recommended next implementation slice

Implement **P1's minimal artifact graph + external JSON/NBT inclusion**, then P2's `resource ... from ...`. This closes a real end-to-end loop and immediately makes RedScript a general datapack project tool, while preserving the existing command language and leaving schema sophistication incremental.

## Sources

Primary release notes:

- Minecraft Java Edition 26.1: <https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1>
- Minecraft Java Edition 26.2: <https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2>
- Minecraft 26.3 Snapshot 1: <https://www.minecraft.net/en-us/article/minecraft-26-3-snapshot-1>
- Minecraft 26.3 Snapshot 4: <https://www.minecraft.net/en-us/article/minecraft-26-3-snapshot-4>
- Minecraft 26.3 Snapshot 5: <https://www.minecraft.net/en-us/article/minecraft-26-3-snapshot-5>

Structural/reference sources:

- Data pack contents and folder structure: <https://minecraft.wiki/w/Data_pack>
- Data/resource pack version table: <https://minecraft.wiki/w/Pack_format>

Repository evidence:

- `src/ast/types.ts` (`ResourceDecl`, `Program.resourceDeclarations`)
- `src/parser/decl-parser.ts` (`parseResourceDecl`)
- `src/resources/catalog.ts`
- `src/emit/index.ts` (`DatapackFile`, duplicate path check)
- `src/testing/datapack-artifact-validator.ts`
- `docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md`
