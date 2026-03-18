# `tags` — Minecraft tag constants

Import: `import tags;`

String constants for vanilla Minecraft Java Edition block, entity type, item, fluid, and damage type tags. Use these instead of raw string literals to avoid typos. All values are `#minecraft:...` tag identifiers.

## Block Tags

| Constant | Tag |
|:--|:--|
| `BLOCK_MINEABLE_AXE` | `#minecraft:mineable/axe` |
| `BLOCK_MINEABLE_HOE` | `#minecraft:mineable/hoe` |
| `BLOCK_MINEABLE_PICKAXE` | `#minecraft:mineable/pickaxe` |
| `BLOCK_MINEABLE_SHOVEL` | `#minecraft:mineable/shovel` |
| `BLOCK_LOGS` | `#minecraft:logs` |
| `BLOCK_LOGS_THAT_BURN` | `#minecraft:logs_that_burn` |
| `BLOCK_LEAVES` | `#minecraft:leaves` |
| `BLOCK_PLANKS` | `#minecraft:planks` |
| `BLOCK_SLABS` | `#minecraft:slabs` |
| `BLOCK_STAIRS` | `#minecraft:stairs` |
| `BLOCK_DOORS` | `#minecraft:doors` |
| `BLOCK_TRAPDOORS` | `#minecraft:trapdoors` |
| `BLOCK_FENCES` | `#minecraft:fences` |
| `BLOCK_FENCE_GATES` | `#minecraft:fence_gates` |
| `BLOCK_WALLS` | `#minecraft:walls` |
| `BLOCK_BUTTONS` | `#minecraft:buttons` |
| `BLOCK_PRESSURE_PLATES` | `#minecraft:pressure_plates` |
| `BLOCK_RAILS` | `#minecraft:rails` |
| `BLOCK_BEDS` | `#minecraft:beds` |
| `BLOCK_SIGNS` | `#minecraft:signs` |
| `BLOCK_CROPS` | `#minecraft:crops` |
| `BLOCK_SAPLINGS` | `#minecraft:saplings` |
| `BLOCK_FLOWERS` | `#minecraft:flowers` |
| `BLOCK_FIRE` | `#minecraft:fire` |
| `BLOCK_ICE` | `#minecraft:ice` |
| `BLOCK_SNOW` | `#minecraft:snow` |
| `BLOCK_SAND` | `#minecraft:sand` |
| `BLOCK_DIRT` | `#minecraft:dirt` |
| `BLOCK_WOOL` | `#minecraft:wool` |
| `BLOCK_WOOL_CARPETS` | `#minecraft:wool_carpets` |
| `BLOCK_CANDLES` | `#minecraft:candles` |
| `BLOCK_CAMPFIRES` | `#minecraft:campfires` |
| `BLOCK_CAULDRONS` | `#minecraft:cauldrons` |
| `BLOCK_SHULKER_BOXES` | `#minecraft:shulker_boxes` |
| `BLOCK_DRAGON_IMMUNE` | `#minecraft:dragon_immune` |
| `BLOCK_WITHER_IMMUNE` | `#minecraft:wither_immune` |

See source file for the full list of ~100+ block tag constants.

## Entity Type Tags

| Constant | Tag |
|:--|:--|
| `ENTITY_ARROWS` | `#minecraft:arrows` |
| `ENTITY_RAIDERS` | `#minecraft:raiders` |
| `ENTITY_SKELETONS` | `#minecraft:skeletons` |
| `ENTITY_FALL_DAMAGE_IMMUNE` | `#minecraft:fall_damage_immune` |
| `ENTITY_IMPACT_PROJECTILES` | `#minecraft:impact_projectiles` |

## Item Tags

| Constant | Tag |
|:--|:--|
| `ITEM_SWORDS` | `#minecraft:swords` |
| `ITEM_AXES` | `#minecraft:axes` |
| `ITEM_PICKAXES` | `#minecraft:pickaxes` |
| `ITEM_SHOVELS` | `#minecraft:shovels` |
| `ITEM_HOES` | `#minecraft:hoes` |
| `ITEM_TOOLS` | `#minecraft:tools` |
| `ITEM_ARROWS` | `#minecraft:arrows` |
| `ITEM_BEDS` | `#minecraft:beds` |
| `ITEM_BOATS` | `#minecraft:boats` |
| `ITEM_LOGS` | `#minecraft:logs` |
| `ITEM_PLANKS` | `#minecraft:planks` |
| `ITEM_WOOL` | `#minecraft:wool` |
| `ITEM_MUSIC_DISCS` | `#minecraft:music_discs` |
| `ITEM_COALS` | `#minecraft:coals` |
| `ITEM_COMPASSES` | `#minecraft:compasses` |
| `ITEM_PIGLIN_LOVED` | `#minecraft:piglin_loved` |
| `ITEM_TRIM_MATERIALS` | `#minecraft:trim_materials` |
| `ITEM_TRIMMABLE_ARMOR` | `#minecraft:trimmable_armor` |

See source file for the full list of 70+ item tag constants.

## Fluid Tags

| Constant | Tag |
|:--|:--|
| `FLUID_LAVA` | `#minecraft:lava` |
| `FLUID_WATER` | `#minecraft:water` |

## Damage Type Tags

| Constant | Tag |
|:--|:--|
| `DAMAGE_BYPASSES_ARMOR` | `#minecraft:bypasses_armor` |
| `DAMAGE_BYPASSES_INVULNERABILITY` | `#minecraft:bypasses_invulnerability` |
| `DAMAGE_IS_FIRE` | `#minecraft:is_fire` |
| `DAMAGE_IS_FALL` | `#minecraft:is_fall` |
| `DAMAGE_IS_EXPLOSION` | `#minecraft:is_explosion` |
| `DAMAGE_IS_PROJECTILE` | `#minecraft:is_projectile` |
| `DAMAGE_IS_DROWNING` | `#minecraft:is_drowning` |
| `DAMAGE_IS_LIGHTNING` | `#minecraft:is_lightning` |
| `DAMAGE_NO_KNOCKBACK` | `#minecraft:no_knockback` |

See source file for the full list of 25+ damage type constants.

## Example

```rs
import tags;

fn setup() {
    // Check if block is mineable with a pickaxe
    raw("execute if block ~ ~ ~ " + BLOCK_MINEABLE_PICKAXE + " run ...");
}
```
