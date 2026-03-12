# Minecraft Java Edition — Command Reference for RedScript

*Source: minecraft.wiki — Java Edition only*


---


## `/scoreboard`

```
scoreboard objectives add <objective> <criteria> [<displayName>]
scoreboard objectives remove <objective>
scoreboard objectives setdisplay <slot> [<objective>]
scoreboard players set <targets> <objective> <score>
scoreboard players add <targets> <objective> <score>
scoreboard players remove <targets> <objective> <score>
scoreboard players reset <targets> [<objective>]
scoreboard players get <target> <objective>
scoreboard players operation <targets> <targetObjective> <operation> <source> <sourceObjective>
  operations: = += -= *= /= %= < > ><
scoreboard players enable <targets> <objective>   [for trigger objectives]
```

---


## `/execute`

```
execute [subcommand...] run <command>

Subcommands:
  as <entity>                      change executor
  at <entity>                      change position/rotation/dimension to entity
  in <dimension>                   change dimension
  positioned <pos>                 change position
  positioned as <entity>
  rotated <rot>
  rotated as <entity>
  anchored (feet|eyes)

  if/unless entity <entity>        test entity existence
  if/unless block <pos> <block>    test block
  if/unless score <target> <obj> (matches <range> | (=|<|<=|>|>=) <source> <obj2>)
  if/unless blocks <start> <end> <dest> (all|masked)
  if/unless data (block|entity|storage) <src> <path>
  if/unless biome <pos> <biome>
  if/unless predicate <predicate>

  store (result|success) score <targets> <objective>
  store (result|success) (block|entity|storage) <target> <path> <type> <scale>
```

---


## `/function`

```
function <name>
function <name> [<arguments>]
function <name> with (block <pos> | entity <entity> | storage <source>) [<path>]

<name> = resource location e.g. mypack:path/to/function
Calls an mcfunction file. Runs synchronously in the same tick.
Return value available via /return (Java 1.20+)
```

---


## `/data`

```
data get (block <targetPos> | entity <target> | storage <target>) [<path>] [<scale>]
data merge (block <targetPos> | entity <target> | storage <target>) <nbt>
data modify (block <targetPos> | entity <target> | storage <target>) <targetPath> <operation> ...
  operations:
    append value <value>
    append from (block|entity|storage) <source> [<path>]
    insert <index> value <value>
    insert <index> from (block|entity|storage) <source> [<path>]
    prepend value <value>
    prepend from (block|entity|storage) <source> [<path>]
    set value <value>
    set from (block|entity|storage) <source> [<path>]
data remove (block <targetPos> | entity <target> | storage <target>) <path>
```

---


## `/schedule`

```
schedule function <function> <time> [append|replace]
schedule clear <function>

<time> examples: 1t (1 tick), 20t (1 second), 1s, 1d
append = add to queue even if already scheduled
replace = (default) replace existing schedule
```

---


## `/return`

```
return <value>
return run <command>
return fail

Sets the return value of the current function.
<value> = integer
Available in Java 1.20+
Propagates return value up the function call chain.
```

---


## `/tag`

```
tag <targets> add <name>
tag <targets> remove <name>
tag <targets> list

Entity tags are string labels.
Used in selectors: @e[tag=myTag], @e[tag=!excluded]
```

---


## `/trigger`

```
trigger <objective>
trigger <objective> add <value>
trigger <objective> set <value>

Criterion must be "trigger" type.
Only works if the objective is enabled for the player: scoreboard players enable <player> <obj>
After triggering, automatically disabled for that player.
Used to allow non-operator players to interact with datapacks.
```

---


## `/team`

```
team add <team> [<displayName>]
team remove <team>
team join <team> [<members>]
team leave [<members>]
team list [<team>]
team modify <team> <option> <value>
  options: color, displayName, prefix, suffix, friendlyFire, seeFriendlyInvisibles,
           nametagVisibility, deathMessageVisibility, collisionRule
```

---


## `/title`

```
title <targets> title <title>
title <targets> subtitle <title>
title <targets> actionbar <title>
title <targets> clear
title <targets> reset
title <targets> times <fadeIn> <stay> <fadeOut>

<title> = JSON text component e.g. {"text":"hello","color":"red"}
<targets> = entity selector (usually @a or @s)
Times in ticks.
```

---


## `/tellraw`

```
tellraw <targets> <message>

<message> = JSON text component:
  {"text": "hello"}
  {"text": "click me", "clickEvent": {"action": "run_command", "value": "/say hi"}}
  {"score": {"name": "@s", "objective": "kills"}}
  ["array ", "of ", {"text":"components"}]
```

---


## `/effect`

```
effect give <targets> <effect> [<seconds>] [<amplifier>] [<hideParticles>]
effect clear [<targets>] [<effect>]

<effect> = effect id e.g. minecraft:speed, minecraft:slowness
<amplifier> = 0-255 (0 = level 1)
<seconds> = duration, max 1000000
<hideParticles> = true|false
```

---


## `/give`

```
give <targets> <item> [<count>]

<item> = item id with optional NBT e.g. minecraft:diamond, minecraft:written_book{...}
<count> = 1-2147483647
```

---


## `/kill`

```
kill [<targets>]

<targets> = entity selector, default = @s
Kills the entity (sets health to 0, triggers death event).
```

---


## `/summon`

```
summon <entity> [<pos>] [<nbt>]

<entity> = entity type e.g. minecraft:zombie, minecraft:armor_stand
<pos> = x y z coordinates
<nbt> = NBT compound for initialization

Common armor stand trick:
  summon minecraft:armor_stand ~ ~ ~ {Invisible:1b,Marker:1b,NoGravity:1b,Tags:["myTag"]}
  - Invisible: no visual
  - Marker: no hitbox, no physics
  - Tags: for later @e[tag=myTag] selection
```

---

