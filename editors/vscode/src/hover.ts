import * as vscode from 'vscode'

// ---------------------------------------------------------------------------
// Builtin documentation database
// ---------------------------------------------------------------------------

interface BuiltinDoc {
  signature: string
  description: string
  params?: { name: string; type: string; optional?: boolean; desc: string }[]
  returns?: string
  example?: string
  mc?: string  // compiled MC command
}

const BUILTINS: Record<string, BuiltinDoc> = {
  // --- Chat & Display ---
  say: {
    signature: 'say(msg: string)',
    description: 'Broadcast a message to all players as the server.',
    params: [{ name: 'msg', type: 'string', desc: 'Message to broadcast' }],
    example: 'say("Hello world!");',
    mc: 'say <msg>'
  },
  tell: {
    signature: 'tell(target: selector, msg: string)',
    description: 'Send a private message to a player or selector.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player(s)' },
      { name: 'msg', type: 'string', desc: 'Message to send' }
    ],
    example: 'tell(@s, "You scored a point!");',
    mc: 'tellraw <target> {"text":"<msg>"}'
  },
  announce: {
    signature: 'announce(msg: string)',
    description: 'Send a message to all players in chat.',
    params: [{ name: 'msg', type: 'string', desc: 'Message text' }],
    example: 'announce("Game over!");',
    mc: 'tellraw @a {"text":"<msg>"}'
  },
  title: {
    signature: 'title(target: selector, msg: string)',
    description: 'Show a large title on screen for target players.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player(s)' },
      { name: 'msg', type: 'string', desc: 'Title text' }
    ],
    example: 'title(@a, "Round 1");',
    mc: 'title <target> title {"text":"<msg>"}'
  },
  subtitle: {
    signature: 'subtitle(target: selector, msg: string)',
    description: 'Show subtitle text below the title.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player(s)' },
      { name: 'msg', type: 'string', desc: 'Subtitle text' }
    ],
    example: 'subtitle(@a, "Fight!");',
    mc: 'title <target> subtitle {"text":"<msg>"}'
  },
  actionbar: {
    signature: 'actionbar(target: selector, msg: string)',
    description: 'Show text in the action bar (above hotbar).',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player(s)' },
      { name: 'msg', type: 'string', desc: 'Action bar text' }
    ],
    example: 'actionbar(@a, "⏱ ${time}s remaining");',
    mc: 'title <target> actionbar {"text":"<msg>"}'
  },
  title_times: {
    signature: 'title_times(target: selector, fadeIn: int, stay: int, fadeOut: int)',
    description: 'Set title display timing (in ticks).',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player(s)' },
      { name: 'fadeIn', type: 'int', desc: 'Fade-in ticks' },
      { name: 'stay', type: 'int', desc: 'Stay ticks' },
      { name: 'fadeOut', type: 'int', desc: 'Fade-out ticks' }
    ],
    example: 'title_times(@a, 10, 40, 10);',
    mc: 'title <target> times <fadeIn> <stay> <fadeOut>'
  },

  // --- Player ---
  give: {
    signature: 'give(target: selector, item: string, count?: int)',
    description: 'Give item(s) to a player.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player(s)' },
      { name: 'item', type: 'string', desc: 'Item ID (e.g. "minecraft:diamond")' },
      { name: 'count', type: 'int', optional: true, desc: 'Amount (default: 1)' }
    ],
    example: 'give(@s, "minecraft:diamond", 5);',
    mc: 'give <target> <item> [count]'
  },
  kill: {
    signature: 'kill(target?: selector)',
    description: 'Kill entity/entities. Defaults to @s.',
    params: [{ name: 'target', type: 'selector', optional: true, desc: 'Target (default: @s)' }],
    example: 'kill(@e[type=minecraft:zombie]);',
    mc: 'kill [target]'
  },
  effect: {
    signature: 'effect(target: selector, effect: string, duration?: int, amplifier?: int)',
    description: 'Apply a status effect.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target entity/player' },
      { name: 'effect', type: 'string', desc: 'Effect ID (e.g. "minecraft:speed")' },
      { name: 'duration', type: 'int', optional: true, desc: 'Seconds (default: 30)' },
      { name: 'amplifier', type: 'int', optional: true, desc: 'Level 0-255 (default: 0)' }
    ],
    example: 'effect(@s, "minecraft:speed", 60, 1);',
    mc: 'effect give <target> <effect> [duration] [amplifier]'
  },
  clear: {
    signature: 'clear(target: selector, item?: string)',
    description: 'Remove items from inventory.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player' },
      { name: 'item', type: 'string', optional: true, desc: 'Specific item to remove (default: all)' }
    ],
    example: 'clear(@s, "minecraft:dirt");',
    mc: 'clear <target> [item]'
  },
  kick: {
    signature: 'kick(player: selector, reason?: string)',
    description: 'Kick a player from the server.',
    params: [
      { name: 'player', type: 'selector', desc: 'Target player' },
      { name: 'reason', type: 'string', optional: true, desc: 'Kick message' }
    ],
    example: 'kick(@s, "You lost!");',
    mc: 'kick <player> [reason]'
  },
  xp_add: {
    signature: 'xp_add(target: selector, amount: int, type?: string)',
    description: 'Add experience to a player.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player' },
      { name: 'amount', type: 'int', desc: 'Amount to add' },
      { name: 'type', type: 'string', optional: true, desc: '"points" or "levels" (default: "points")' }
    ],
    example: 'xp_add(@s, 100);',
    mc: 'xp add <target> <amount> [type]'
  },
  xp_set: {
    signature: 'xp_set(target: selector, amount: int, type?: string)',
    description: 'Set a player\'s experience.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target player' },
      { name: 'amount', type: 'int', desc: 'New value' },
      { name: 'type', type: 'string', optional: true, desc: '"points" or "levels"' }
    ],
    example: 'xp_set(@s, 0, "levels");',
    mc: 'xp set <target> <amount> [type]'
  },

  // --- Teleport ---
  tp: {
    signature: 'tp(target: selector, destination: selector | BlockPos)',
    description: 'Teleport entity to a player or coordinates.',
    params: [
      { name: 'target', type: 'selector', desc: 'Entity to teleport' },
      { name: 'destination', type: 'selector | BlockPos', desc: 'Target player or position' }
    ],
    example: 'tp(@s, (0, 64, 0));\ntp(@a, @s);',
    mc: 'tp <target> <dest>'
  },

  // --- World ---
  setblock: {
    signature: 'setblock(pos: BlockPos, block: string)',
    description: 'Place a block at coordinates.',
    params: [
      { name: 'pos', type: 'BlockPos', desc: 'Target position e.g. (0, 64, 0) or (~1, ~0, ~0)' },
      { name: 'block', type: 'string', desc: 'Block ID (e.g. "minecraft:stone")' }
    ],
    example: 'setblock((0, 64, 0), "minecraft:stone");',
    mc: 'setblock <x> <y> <z> <block>'
  },
  fill: {
    signature: 'fill(from: BlockPos, to: BlockPos, block: string)',
    description: 'Fill a region with blocks.',
    params: [
      { name: 'from', type: 'BlockPos', desc: 'Start corner' },
      { name: 'to', type: 'BlockPos', desc: 'End corner' },
      { name: 'block', type: 'string', desc: 'Block to fill with' }
    ],
    example: 'fill((0, 64, 0), (10, 64, 10), "minecraft:grass_block");',
    mc: 'fill <x1> <y1> <z1> <x2> <y2> <z2> <block>'
  },
  clone: {
    signature: 'clone(from: BlockPos, to: BlockPos, dest: BlockPos)',
    description: 'Clone a region of blocks to a new location.',
    params: [
      { name: 'from', type: 'BlockPos', desc: 'Source start corner' },
      { name: 'to', type: 'BlockPos', desc: 'Source end corner' },
      { name: 'dest', type: 'BlockPos', desc: 'Destination corner' }
    ],
    example: 'clone((0,64,0), (10,64,10), (20,64,0));',
    mc: 'clone <x1> <y1> <z1> <x2> <y2> <z2> <dx> <dy> <dz>'
  },
  summon: {
    signature: 'summon(type: string, pos: BlockPos)',
    description: 'Spawn an entity at a location.',
    params: [
      { name: 'type', type: 'string', desc: 'Entity type ID (e.g. "minecraft:zombie")' },
      { name: 'pos', type: 'BlockPos', desc: 'Spawn position' }
    ],
    example: 'summon("minecraft:zombie", (0, 64, 0));',
    mc: 'summon <type> <x> <y> <z>'
  },
  weather: {
    signature: 'weather(type: string)',
    description: 'Set the weather.',
    params: [{ name: 'type', type: 'string', desc: '"clear", "rain", or "thunder"' }],
    example: 'weather("clear");',
    mc: 'weather <type>'
  },
  time_set: {
    signature: 'time_set(value: int | string)',
    description: 'Set the world time.',
    params: [{ name: 'value', type: 'int | string', desc: 'Time in ticks, or "day"/"night"/"noon"/"midnight"' }],
    example: 'time_set(0);  // dawn\ntime_set("noon");',
    mc: 'time set <value>'
  },
  time_add: {
    signature: 'time_add(ticks: int)',
    description: 'Advance world time by ticks.',
    params: [{ name: 'ticks', type: 'int', desc: 'Ticks to add' }],
    example: 'time_add(6000);',
    mc: 'time add <ticks>'
  },
  gamerule: {
    signature: 'gamerule(rule: string, value: bool | int)',
    description: 'Set a gamerule value.',
    params: [
      { name: 'rule', type: 'string', desc: 'Gamerule name (e.g. "keepInventory")' },
      { name: 'value', type: 'bool | int', desc: 'New value' }
    ],
    example: 'gamerule("keepInventory", true);\ngamerule("randomTickSpeed", 3);',
    mc: 'gamerule <rule> <value>'
  },
  difficulty: {
    signature: 'difficulty(level: string)',
    description: 'Set the game difficulty.',
    params: [{ name: 'level', type: 'string', desc: '"peaceful", "easy", "normal", or "hard"' }],
    example: 'difficulty("hard");',
    mc: 'difficulty <level>'
  },
  particle: {
    signature: 'particle(name: string, pos: BlockPos)',
    description: 'Spawn a particle effect.',
    params: [
      { name: 'name', type: 'string', desc: 'Particle type (e.g. "minecraft:flame")' },
      { name: 'pos', type: 'BlockPos', desc: 'Position' }
    ],
    example: 'particle("minecraft:flame", (~0, ~1, ~0));',
    mc: 'particle <name> <x> <y> <z>'
  },
  playsound: {
    signature: 'playsound(sound: string, source: string, target: selector, pos?: BlockPos, volume?: float, pitch?: float)',
    description: 'Play a sound for a player.',
    params: [
      { name: 'sound', type: 'string', desc: 'Sound event ID' },
      { name: 'source', type: 'string', desc: 'Category: "master", "music", "record", "weather", "block", "hostile", "neutral", "player", "ambient", "voice"' },
      { name: 'target', type: 'selector', desc: 'Target player' },
      { name: 'pos', type: 'BlockPos', optional: true, desc: 'Origin position' },
      { name: 'volume', type: 'float', optional: true, desc: 'Volume (default: 1.0)' },
      { name: 'pitch', type: 'float', optional: true, desc: 'Pitch (default: 1.0)' }
    ],
    example: 'playsound("entity.experience_orb.pickup", "player", @s);',
    mc: 'playsound <sound> <source> <target>'
  },

  // --- Tags ---
  tag_add: {
    signature: 'tag_add(target: selector, tag: string)',
    description: 'Add an entity tag.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target entity' },
      { name: 'tag', type: 'string', desc: 'Tag name' }
    ],
    example: 'tag_add(@s, "hasKey");',
    mc: 'tag <target> add <tag>'
  },
  tag_remove: {
    signature: 'tag_remove(target: selector, tag: string)',
    description: 'Remove an entity tag.',
    params: [
      { name: 'target', type: 'selector', desc: 'Target entity' },
      { name: 'tag', type: 'string', desc: 'Tag name' }
    ],
    example: 'tag_remove(@s, "hasKey");',
    mc: 'tag <target> remove <tag>'
  },

  // --- Scoreboard ---
  scoreboard_get: {
    signature: 'scoreboard_get(target: selector | string, objective: string) -> int',
    description: 'Read a scoreboard value.',
    params: [
      { name: 'target', type: 'selector | string', desc: 'Player/entity or fake player name (e.g. "#counter")' },
      { name: 'objective', type: 'string', desc: 'Scoreboard objective name' }
    ],
    returns: 'int',
    example: 'let hp: int = scoreboard_get(@s, "health");',
    mc: 'scoreboard players get <target> <objective>'
  },
  score: {
    signature: 'score(target: selector | string, objective: string) -> int',
    description: 'Alias for scoreboard_get. Read a scoreboard value.',
    params: [
      { name: 'target', type: 'selector | string', desc: 'Player/entity or fake player name' },
      { name: 'objective', type: 'string', desc: 'Scoreboard objective name' }
    ],
    returns: 'int',
    example: 'let kills: int = score(@s, "kills");',
    mc: 'scoreboard players get <target> <objective>'
  },
  scoreboard_set: {
    signature: 'scoreboard_set(target: selector | string, objective: string, value: int)',
    description: 'Set a scoreboard value.',
    params: [
      { name: 'target', type: 'selector | string', desc: 'Player/entity or fake player' },
      { name: 'objective', type: 'string', desc: 'Objective name' },
      { name: 'value', type: 'int', desc: 'New value' }
    ],
    example: 'scoreboard_set("#game", "timer", 300);',
    mc: 'scoreboard players set <target> <objective> <value>'
  },
  scoreboard_add: {
    signature: 'scoreboard_add(target: selector | string, objective: string, amount: int)',
    description: 'Add to a scoreboard value.',
    params: [
      { name: 'target', type: 'selector | string', desc: 'Player/entity or fake player' },
      { name: 'objective', type: 'string', desc: 'Objective name' },
      { name: 'amount', type: 'int', desc: 'Amount to add (can be negative)' }
    ],
    example: 'scoreboard_add(@s, "kills", 1);',
    mc: 'scoreboard players add <target> <objective> <amount>'
  },
  scoreboard_display: {
    signature: 'scoreboard_display(slot: string, objective: string)',
    description: 'Display a scoreboard objective in a slot.',
    params: [
      { name: 'slot', type: 'string', desc: '"list", "sidebar", or "belowName"' },
      { name: 'objective', type: 'string', desc: 'Objective name' }
    ],
    example: 'scoreboard_display("sidebar", "kills");',
    mc: 'scoreboard objectives setdisplay <slot> <objective>'
  },
  scoreboard_add_objective: {
    signature: 'scoreboard_add_objective(name: string, criteria: string)',
    description: 'Create a new scoreboard objective.',
    params: [
      { name: 'name', type: 'string', desc: 'Objective name' },
      { name: 'criteria', type: 'string', desc: 'Criteria (e.g. "dummy", "playerKillCount")' }
    ],
    example: 'scoreboard_add_objective("kills", "playerKillCount");',
    mc: 'scoreboard objectives add <name> <criteria>'
  },
  scoreboard_remove_objective: {
    signature: 'scoreboard_remove_objective(name: string)',
    description: 'Remove a scoreboard objective.',
    params: [{ name: 'name', type: 'string', desc: 'Objective name' }],
    example: 'scoreboard_remove_objective("kills");',
    mc: 'scoreboard objectives remove <name>'
  },
  scoreboard_hide: {
    signature: 'scoreboard_hide(slot: string)',
    description: 'Clear the display in a scoreboard slot.',
    params: [{ name: 'slot', type: 'string', desc: '"list", "sidebar", or "belowName"' }],
    example: 'scoreboard_hide("sidebar");',
    mc: 'scoreboard objectives setdisplay <slot>'
  },

  // --- Random ---
  random: {
    signature: 'random(min: int, max: int) -> int',
    description: 'Generate a random integer in range [min, max] using scoreboard arithmetic.',
    params: [
      { name: 'min', type: 'int', desc: 'Minimum value (inclusive)' },
      { name: 'max', type: 'int', desc: 'Maximum value (inclusive)' }
    ],
    returns: 'int',
    example: 'let roll: int = random(1, 6);',
  },
  random_native: {
    signature: 'random_native(min: int, max: int) -> int',
    description: 'Generate a random integer using /random command (MC 1.20.3+). Faster than random().',
    params: [
      { name: 'min', type: 'int', desc: 'Minimum value (inclusive)' },
      { name: 'max', type: 'int', desc: 'Maximum value (inclusive)' }
    ],
    returns: 'int',
    example: 'let n: int = random_native(1, 100);',
    mc: 'random value <min> <max>'
  },

  // --- Strings ---
  str_len: {
    signature: 'str_len(s: string) -> int',
    description: 'Get the length of a string (stored in NBT storage).',
    params: [{ name: 's', type: 'string', desc: 'Input string' }],
    returns: 'int',
    example: 'let n: int = str_len("hello");  // 5',
  },

  // --- Arrays ---
  push: {
    signature: 'push(arr: T[], value: T)',
    description: 'Append a value to the end of an array.',
    params: [
      { name: 'arr', type: 'T[]', desc: 'Target array' },
      { name: 'value', type: 'T', desc: 'Value to append' }
    ],
    example: 'let scores: int[] = [];\npush(scores, 42);',
    mc: 'data modify storage rs:heap <arr> append value <value>'
  },
  pop: {
    signature: 'pop(arr: T[]) -> T',
    description: 'Remove and return the last element of an array.',
    params: [{ name: 'arr', type: 'T[]', desc: 'Target array' }],
    returns: 'T',
    example: 'let last: int = pop(scores);',
    mc: 'data remove storage rs:heap <arr>[-1]'
  },
  len: {
    signature: 'arr.len',
    description: 'Get the number of elements in an array (property access, not a function call).',
    example: 'let n: int = scores.len;',
  },

  // --- Data ---
  data_get: {
    signature: 'data_get(target: string, path: string) -> int',
    description: 'Read NBT data from entity/block/storage.',
    params: [
      { name: 'target', type: 'string', desc: 'Target selector or storage path' },
      { name: 'path', type: 'string', desc: 'NBT path (e.g. "Health")' }
    ],
    returns: 'int',
    example: 'let hp: int = data_get("@s", "Health");',
    mc: 'execute store result score $rs_tmp rs_tmp run data get entity <target> <path>'
  },

  // --- Bossbar ---
  bossbar_add: {
    signature: 'bossbar_add(id: string, name: string)',
    description: 'Create a new boss bar.',
    params: [
      { name: 'id', type: 'string', desc: 'Boss bar ID (e.g. "minecraft:health")' },
      { name: 'name', type: 'string', desc: 'Display name' }
    ],
    example: 'bossbar_add("mymod:timer", "Time Left");',
    mc: 'bossbar add <id> {"text":"<name>"}'
  },
  bossbar_set_value: {
    signature: 'bossbar_set_value(id: string, value: int)',
    description: 'Set boss bar current value.',
    params: [
      { name: 'id', type: 'string', desc: 'Boss bar ID' },
      { name: 'value', type: 'int', desc: 'Current value' }
    ],
    example: 'bossbar_set_value("mymod:timer", 60);',
    mc: 'bossbar set <id> value <value>'
  },
  bossbar_set_max: {
    signature: 'bossbar_set_max(id: string, max: int)',
    description: 'Set boss bar maximum value.',
    params: [
      { name: 'id', type: 'string', desc: 'Boss bar ID' },
      { name: 'max', type: 'int', desc: 'Maximum value' }
    ],
    example: 'bossbar_set_max("mymod:timer", 300);',
    mc: 'bossbar set <id> max <max>'
  },
  bossbar_remove: {
    signature: 'bossbar_remove(id: string)',
    description: 'Remove a boss bar.',
    params: [{ name: 'id', type: 'string', desc: 'Boss bar ID' }],
    example: 'bossbar_remove("mymod:timer");',
    mc: 'bossbar remove <id>'
  },
  bossbar_set_players: {
    signature: 'bossbar_set_players(id: string, target: selector)',
    description: 'Set which players see the boss bar.',
    params: [
      { name: 'id', type: 'string', desc: 'Boss bar ID' },
      { name: 'target', type: 'selector', desc: 'Target players' }
    ],
    example: 'bossbar_set_players("mymod:timer", @a);',
    mc: 'bossbar set <id> players <target>'
  },
  bossbar_set_color: {
    signature: 'bossbar_set_color(id: string, color: string)',
    description: 'Set boss bar color.',
    params: [
      { name: 'id', type: 'string', desc: 'Boss bar ID' },
      { name: 'color', type: 'string', desc: '"blue", "green", "pink", "purple", "red", "white", "yellow"' }
    ],
    example: 'bossbar_set_color("mymod:timer", "red");',
    mc: 'bossbar set <id> color <color>'
  },
  bossbar_set_style: {
    signature: 'bossbar_set_style(id: string, style: string)',
    description: 'Set boss bar segmentation style.',
    params: [
      { name: 'id', type: 'string', desc: 'Boss bar ID' },
      { name: 'style', type: 'string', desc: '"notched_6", "notched_10", "notched_12", "notched_20", "progress"' }
    ],
    example: 'bossbar_set_style("mymod:timer", "notched_10");',
  },
  bossbar_set_visible: {
    signature: 'bossbar_set_visible(id: string, visible: bool)',
    description: 'Show or hide a boss bar.',
    params: [
      { name: 'id', type: 'string', desc: 'Boss bar ID' },
      { name: 'visible', type: 'bool', desc: 'Visibility state' }
    ],
    example: 'bossbar_set_visible("mymod:timer", true);',
  },
  bossbar_get_value: {
    signature: 'bossbar_get_value(id: string) -> int',
    description: 'Get the current value of a boss bar.',
    params: [{ name: 'id', type: 'string', desc: 'Boss bar ID' }],
    returns: 'int',
    example: 'let v: int = bossbar_get_value("mymod:timer");',
    mc: 'execute store result score $rs_tmp rs_tmp run bossbar get <id> value'
  },

  // --- Teams ---
  team_add: {
    signature: 'team_add(name: string)',
    description: 'Create a new team.',
    params: [{ name: 'name', type: 'string', desc: 'Team name' }],
    example: 'team_add("red");',
    mc: 'team add <name>'
  },
  team_remove: {
    signature: 'team_remove(name: string)',
    description: 'Remove a team.',
    params: [{ name: 'name', type: 'string', desc: 'Team name' }],
    example: 'team_remove("red");',
    mc: 'team remove <name>'
  },
  team_join: {
    signature: 'team_join(name: string, target: selector)',
    description: 'Add entities to a team.',
    params: [
      { name: 'name', type: 'string', desc: 'Team name' },
      { name: 'target', type: 'selector', desc: 'Entities to add' }
    ],
    example: 'team_join("red", @s);',
    mc: 'team join <name> <target>'
  },
  team_leave: {
    signature: 'team_leave(target: selector)',
    description: 'Remove entities from their team.',
    params: [{ name: 'target', type: 'selector', desc: 'Entities to remove' }],
    example: 'team_leave(@s);',
    mc: 'team leave <target>'
  },
  team_option: {
    signature: 'team_option(name: string, option: string, value: string)',
    description: 'Set a team option.',
    params: [
      { name: 'name', type: 'string', desc: 'Team name' },
      { name: 'option', type: 'string', desc: 'Option name (e.g. "color", "friendlyFire")' },
      { name: 'value', type: 'string', desc: 'Option value' }
    ],
    example: 'team_option("red", "color", "red");',
    mc: 'team modify <name> <option> <value>'
  },

  // --- Decorators ---
  tick: {
    signature: '@tick  |  @tick(rate: int)',
    description: 'Run this function every tick (rate=1) or every N ticks.',
    params: [{ name: 'rate', type: 'int', optional: true, desc: 'Tick interval (default: 1). @tick(rate=20) = every second.' }],
    example: '@tick(rate=20)\nfn every_second() { ... }',
  },
  on_advancement: {
    signature: '@on_advancement(id: string)',
    description: 'Trigger when a player earns an advancement.',
    params: [{ name: 'id', type: 'string', desc: 'Advancement ID (e.g. "story/mine_diamond")' }],
    example: '@on_advancement("story/mine_diamond")\nfn got_diamond() { give(@s, "minecraft:diamond", 5); }',
  },
  on_death: {
    signature: '@on_death',
    description: 'Trigger when the executing entity dies.',
    example: '@on_death\nfn died() { scoreboard_add(@s, "deaths", 1); }',
  },
  on_craft: {
    signature: '@on_craft(item: string)',
    description: 'Trigger when a player crafts an item.',
    params: [{ name: 'item', type: 'string', desc: 'Crafted item ID' }],
    example: '@on_craft("minecraft:diamond_sword")\nfn crafted_sword() { tell(@s, "Nice sword!"); }',
  },
}

// ---------------------------------------------------------------------------
// Hover Provider
// ---------------------------------------------------------------------------

function formatDoc(doc: BuiltinDoc): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true)
  md.isTrusted = true
  md.supportHtml = false

  // Signature (code block)
  md.appendCodeblock(doc.signature, 'redscript')

  // Description
  md.appendText('\n')
  md.appendMarkdown(doc.description)
  md.appendText('\n')

  // Parameters
  if (doc.params?.length) {
    md.appendText('\n')
    md.appendMarkdown('**Parameters:**\n')
    for (const p of doc.params) {
      const opt = p.optional ? '?' : ''
      md.appendMarkdown(`- \`${p.name}${opt}: ${p.type}\` — ${p.desc}\n`)
    }
  }

  // Return type
  if (doc.returns) {
    md.appendMarkdown(`\n**Returns:** \`${doc.returns}\`\n`)
  }

  // Compiled MC command
  if (doc.mc) {
    md.appendText('\n')
    md.appendMarkdown('**Compiles to:**\n')
    md.appendCodeblock(doc.mc, 'mcfunction')
  }

  // Example
  if (doc.example) {
    md.appendMarkdown('**Example:**\n')
    md.appendCodeblock(doc.example, 'redscript')
  }

  return md
}

// ---------------------------------------------------------------------------
// Selector documentation
// ---------------------------------------------------------------------------

const SELECTOR_DOCS: Record<string, { name: string; desc: string; tip?: string }> = {
  '@s': { name: '@s — Self',          desc: 'The entity that ran the current command (the executing entity).',   tip: 'Always refers to exactly 1 entity.' },
  '@a': { name: '@a — All Players',   desc: 'All online players.',                                               tip: 'Use `@a[limit=1]` to restrict to one player.' },
  '@e': { name: '@e — All Entities',  desc: 'All loaded entities (players + mobs + items + …).',                tip: 'Usually combined with filters: `@e[type=minecraft:zombie,limit=5]`' },
  '@p': { name: '@p — Nearest Player',desc: 'The single nearest player to the command origin.',                  tip: 'Exactly 1 player; errors if none are in range.' },
  '@r': { name: '@r — Random Player', desc: 'A random online player.',                                           tip: 'Use `@e[type=minecraft:player,sort=random,limit=1]` for full control.' },
  '@n': { name: '@n — Nearest Entity',desc: 'The single nearest entity (including non-players).',                tip: 'MC 1.21+ only.' },
}

function formatSelectorHover(raw: string): vscode.MarkdownString {
  const key = raw.replace(/\[.*/, '') as keyof typeof SELECTOR_DOCS
  const info = SELECTOR_DOCS[key]
  const md = new vscode.MarkdownString('', true)
  if (info) {
    md.appendMarkdown(`**${info.name}**\n\n`)
    md.appendMarkdown(info.desc + '\n')
    if (info.tip) md.appendMarkdown(`\n> 💡 ${info.tip}`)
  } else {
    md.appendMarkdown(`**Selector** \`${raw}\`\n\nEntity target selector.`)
  }
  return md
}

// ---------------------------------------------------------------------------
// JSDoc comment parser
// ---------------------------------------------------------------------------

/**
 * Look backwards from `line` in `document` for a /** ... *\/ block.
 * Returns the cleaned comment text, or null.
 */
function findJsDocAbove(document: vscode.TextDocument, declLine: number): string | null {
  // Walk up from the declaration line, skipping blank lines
  let end = declLine - 1
  while (end >= 0 && document.lineAt(end).text.trim() === '') end--
  if (end < 0) return null

  const endText = document.lineAt(end).text.trim()
  if (!endText.endsWith('*/')) return null

  // Find the opening /**
  let start = end
  while (start >= 0 && !document.lineAt(start).text.includes('/**')) start--
  if (start < 0) return null

  // Extract and clean comment lines
  const lines: string[] = []
  for (let i = start; i <= end; i++) {
    let line = document.lineAt(i).text
      .replace(/^\s*\/\*\*?\s?/, '')  // remove leading /**
      .replace(/\s*\*\/\s*$/, '')     // remove trailing */
      .replace(/^\s*\*\s?/, '')       // remove leading * on middle lines
      .trim()
    if (line) lines.push(line)
  }
  return lines.length ? lines.join('\n') : null
}

/**
 * Find the line where `fn <name>` is declared in the document.
 */
function findFnDeclLine(document: vscode.TextDocument, name: string): number | null {
  const re = new RegExp(`^\\s*(?:@[^\\n]*\\n\\s*)*fn\\s+${name}\\s*\\(`, 'm')
  const text = document.getText()
  const match = re.exec(text)
  if (!match) return null
  return document.positionAt(match.index).line
}

// ---------------------------------------------------------------------------
// Hover provider
// ---------------------------------------------------------------------------

export function registerHoverProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('redscript', {
      provideHover(document, position) {
        // Check if the cursor is on a selector (@s, @a, @e[...])
        const selectorRange = document.getWordRangeAtPosition(
          position,
          /@[aesprnAESPRN](?:\[[^\]]*\])?/
        )
        if (selectorRange) {
          const raw = document.getText(selectorRange)
          return new vscode.Hover(formatSelectorHover(raw), selectorRange)
        }

        const range = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/)
        if (!range) return

        const word = document.getText(range)

        // Builtin function
        const builtin = BUILTINS[word]
        if (builtin) return new vscode.Hover(formatDoc(builtin), range)

        // User-defined function — look for JSDoc comment above declaration
        const declLine = findFnDeclLine(document, word)
        if (declLine !== null) {
          const jsdoc = findJsDocAbove(document, declLine)
          if (jsdoc) {
            const md = new vscode.MarkdownString('', true)
            md.appendCodeblock(`fn ${word}(...)`, 'redscript')
            md.appendText('\n')
            md.appendMarkdown(jsdoc)
            return new vscode.Hover(md, range)
          }
        }

        return undefined
      }
    })
  )
}
