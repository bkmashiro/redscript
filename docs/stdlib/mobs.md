# `mobs` — Mob type constants

Import: `import mobs;`

Vanilla Minecraft Java Edition entity type string constants. Import and use these instead of raw string literals to avoid typos. Covers hostile mobs, passive mobs, neutral mobs, bosses, and special/misc entities.

## Constants

### Hostile mobs

| Constant | Value |
|:--|:--|
| `ZOMBIE` | `"minecraft:zombie"` |
| `SKELETON` | `"minecraft:skeleton"` |
| `CREEPER` | `"minecraft:creeper"` |
| `SPIDER` | `"minecraft:spider"` |
| `CAVE_SPIDER` | `"minecraft:cave_spider"` |
| `ENDERMAN` | `"minecraft:enderman"` |
| `WITCH` | `"minecraft:witch"` |
| `PHANTOM` | `"minecraft:phantom"` |
| `DROWNED` | `"minecraft:drowned"` |
| `HUSK` | `"minecraft:husk"` |
| `STRAY` | `"minecraft:stray"` |
| `WARDEN` | `"minecraft:warden"` |
| `PILLAGER` | `"minecraft:pillager"` |
| `RAVAGER` | `"minecraft:ravager"` |
| `VINDICATOR` | `"minecraft:vindicator"` |
| `EVOKER` | `"minecraft:evoker"` |
| `VEXE` | `"minecraft:vex"` |
| `ZOMBIE_VILLAGER` | `"minecraft:zombie_villager"` |
| `BLAZE` | `"minecraft:blaze"` |
| `GHAST` | `"minecraft:ghast"` |
| `MAGMA_CUBE` | `"minecraft:magma_cube"` |
| `SLIME` | `"minecraft:slime"` |
| `PIGLIN_BRUTE` | `"minecraft:piglin_brute"` |
| `HOGLIN` | `"minecraft:hoglin"` |
| `ZOGLIN` | `"minecraft:zoglin"` |
| `ENDERMITE` | `"minecraft:endermite"` |
| `SILVERFISH` | `"minecraft:silverfish"` |
| `SHULKER` | `"minecraft:shulker"` |
| `GUARDIAN` | `"minecraft:guardian"` |
| `ELDER_GUARDIAN` | `"minecraft:elder_guardian"` |
| `BOGGED` | `"minecraft:bogged"` |
| `BREEZE` | `"minecraft:breeze"` |

### Passive mobs

| Constant | Value |
|:--|:--|
| `PIG` | `"minecraft:pig"` |
| `COW` | `"minecraft:cow"` |
| `SHEEP` | `"minecraft:sheep"` |
| `CHICKEN` | `"minecraft:chicken"` |
| `HORSE` | `"minecraft:horse"` |
| `DONKEY` | `"minecraft:donkey"` |
| `MULE` | `"minecraft:mule"` |
| `RABBIT` | `"minecraft:rabbit"` |
| `COD` | `"minecraft:cod"` |
| `SALMON` | `"minecraft:salmon"` |
| `TROPICAL_FISH` | `"minecraft:tropical_fish"` |
| `PUFFERFISH` | `"minecraft:pufferfish"` |
| `SQUID` | `"minecraft:squid"` |
| `GLOW_SQUID` | `"minecraft:glow_squid"` |
| `BAT` | `"minecraft:bat"` |
| `VILLAGER` | `"minecraft:villager"` |
| `WANDERING_TRADER` | `"minecraft:wandering_trader"` |
| `SNOW_GOLEM` | `"minecraft:snow_golem"` |
| `STRIDER` | `"minecraft:strider"` |
| `AXOLOTL` | `"minecraft:axolotl"` |
| `FROG` | `"minecraft:frog"` |
| `TADPOLE` | `"minecraft:tadpole"` |
| `ALLAY` | `"minecraft:allay"` |
| `SNIFFER` | `"minecraft:sniffer"` |
| `ARMADILLO` | `"minecraft:armadillo"` |
| `TURTLE` | `"minecraft:turtle"` |

### Neutral mobs

| Constant | Value |
|:--|:--|
| `WOLF` | `"minecraft:wolf"` |
| `BEE` | `"minecraft:bee"` |
| `POLAR_BEAR` | `"minecraft:polar_bear"` |
| `DOLPHIN` | `"minecraft:dolphin"` |
| `IRON_GOLEM` | `"minecraft:iron_golem"` |
| `PIGLIN` | `"minecraft:piglin"` |
| `ZOMBIFIED_PIGLIN` | `"minecraft:zombified_piglin"` |
| `PANDA` | `"minecraft:panda"` |
| `LLAMA` | `"minecraft:llama"` |
| `TRADER_LLAMA` | `"minecraft:trader_llama"` |
| `CAT` | `"minecraft:cat"` |
| `OCELOT` | `"minecraft:ocelot"` |
| `FOX` | `"minecraft:fox"` |
| `GOAT` | `"minecraft:goat"` |
| `CAMEL` | `"minecraft:camel"` |

### Bosses

| Constant | Value |
|:--|:--|
| `ENDER_DRAGON` | `"minecraft:ender_dragon"` |
| `WITHER` | `"minecraft:wither"` |

### Special / misc

| Constant | Value |
|:--|:--|
| `ARMOR_STAND` | `"minecraft:armor_stand"` |
| `ITEM_FRAME` | `"minecraft:item_frame"` |
| `GLOW_ITEM_FRAME` | `"minecraft:glow_item_frame"` |
| `PAINTING` | `"minecraft:painting"` |
| `BOAT` | `"minecraft:boat"` |
| `MINECART` | `"minecraft:minecart"` |
| `TNT` | `"minecraft:tnt"` |
| `FALLING_BLOCK` | `"minecraft:falling_block"` |
| `ITEM` | `"minecraft:item"` |
| `XP_ORB` | `"minecraft:experience_orb"` |
| `FIREBALL` | `"minecraft:fireball"` |
| `PLAYER` | `"minecraft:player"` |

## Example

```rs
import mobs;

fn spawn_wave() {
    summon(ZOMBIE, "~", "~", "~");
    summon(SKELETON, "~5", "~", "~");
    summon(CREEPER, "~-5", "~", "~");
}
```
