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

/** Selector argument documentation (MC built-in selector arguments). */
const SELECTOR_ARG_DOCS: Record<string, { name: string; desc: string; example?: string }> = {
  'type':       { name: 'type',       desc: 'Filter by entity type.',                                       example: 'type=minecraft:zombie' },
  'tag':        { name: 'tag',        desc: 'Filter by scoreboard tag. Use `tag=!name` to exclude.',        example: 'tag=my_tag, tag=!excluded' },
  'name':       { name: 'name',       desc: 'Filter by entity custom name.',                                example: 'name="Steve"' },
  'team':       { name: 'team',       desc: 'Filter by team membership. Empty string = no team.',           example: 'team=red, team=' },
  'scores':     { name: 'scores',     desc: 'Filter by scoreboard scores. Uses `{obj=range}` syntax.',      example: 'scores={kills=1..}' },
  'nbt':        { name: 'nbt',        desc: 'Filter by NBT data match.',                                    example: 'nbt={OnGround:1b}' },
  'predicate':  { name: 'predicate',  desc: 'Filter by datapack predicate.',                                example: 'predicate=my_pack:is_valid' },
  'gamemode':   { name: 'gamemode',   desc: 'Filter players by gamemode.',                                  example: 'gamemode=survival, gamemode=!creative' },
  'distance':   { name: 'distance',   desc: 'Filter by distance from command origin. Supports ranges.',     example: 'distance=..10, distance=5..20' },
  'level':      { name: 'level',      desc: 'Filter players by XP level.',                                  example: 'level=10.., level=1..5' },
  'x_rotation': { name: 'x_rotation', desc: 'Filter by vertical head rotation (pitch). -90=up, 90=down.',   example: 'x_rotation=-90..0' },
  'y_rotation': { name: 'y_rotation', desc: 'Filter by horizontal head rotation (yaw). South=0.',           example: 'y_rotation=0..90' },
  'x':          { name: 'x',          desc: 'Override X coordinate for distance/volume calculations.',      example: 'x=100' },
  'y':          { name: 'y',          desc: 'Override Y coordinate for distance/volume calculations.',      example: 'y=64' },
  'z':          { name: 'z',          desc: 'Override Z coordinate for distance/volume calculations.',      example: 'z=-200' },
  'dx':         { name: 'dx',         desc: 'X-size of selection box from x,y,z.',                          example: 'dx=10' },
  'dy':         { name: 'dy',         desc: 'Y-size of selection box from x,y,z.',                          example: 'dy=5' },
  'dz':         { name: 'dz',         desc: 'Z-size of selection box from x,y,z.',                          example: 'dz=10' },
  'limit':      { name: 'limit',      desc: 'Maximum number of entities to select.',                        example: 'limit=1, limit=5' },
  'sort':       { name: 'sort',       desc: 'Sort order: nearest, furthest, random, arbitrary.',            example: 'sort=random' },
  'advancements':{ name: 'advancements', desc: 'Filter by advancement completion.',                         example: 'advancements={story/mine_diamond=true}' },
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

function formatSelectorArgHover(arg: string): vscode.MarkdownString | null {
  const info = SELECTOR_ARG_DOCS[arg]
  if (!info) return null
  const md = new vscode.MarkdownString('', true)
  md.appendMarkdown(`**${info.name}** (selector argument)\n\n`)
  md.appendMarkdown(info.desc)
  if (info.example) {
    md.appendText('\n\n')
    md.appendCodeblock(info.example, 'redscript')
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
  const re = new RegExp(`\\bfn\\s+${escapeRe(name)}\\s*\\(`, 'm')
  const text = document.getText()
  const match = re.exec(text)
  if (!match) return null
  return document.positionAt(match.index).line
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Variable / let / const hover
// ---------------------------------------------------------------------------

interface VarDecl { name: string; type: string; kind: 'let' | 'const' | 'param' }

function findVarDecls(document: vscode.TextDocument): VarDecl[] {
  const text = document.getText()
  const decls: VarDecl[] = []

  // Find let/const declarations
  const letRe = /\b(let|const)\s+(\w+)\s*:\s*([A-Za-z_][A-Za-z0-9_\[\]]*)/g
  let m: RegExpExecArray | null
  while ((m = letRe.exec(text)) !== null) {
    decls.push({ kind: m[1] as 'let' | 'const', name: m[2], type: m[3] })
  }

  return decls
}

interface FnParam { name: string; type: string; fnName: string; fnStartLine: number; fnEndLine: number }

/** Find all function parameters with their scope (function body range). */
function findFnParams(document: vscode.TextDocument): FnParam[] {
  const text = document.getText()
  const params: FnParam[] = []

  // Match: fn name(param1: Type1, param2: Type2) { ... }
  // Need to find the function body range to scope parameters correctly
  const fnRe = /\bfn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*\w+)?\s*\{/g
  let fnMatch: RegExpExecArray | null

  while ((fnMatch = fnRe.exec(text)) !== null) {
    const fnName = fnMatch[1]
    const paramsStr = fnMatch[2]
    const fnStartOffset = fnMatch.index
    const fnStartLine = document.positionAt(fnStartOffset).line

    // Find matching closing brace for function body
    const bodyStart = fnMatch.index + fnMatch[0].length - 1 // position of '{'
    let braceCount = 1
    let pos = bodyStart + 1
    while (pos < text.length && braceCount > 0) {
      if (text[pos] === '{') braceCount++
      else if (text[pos] === '}') braceCount--
      pos++
    }
    const fnEndLine = document.positionAt(pos).line

    // Parse parameters: name: Type, name: Type = default
    const paramRe = /(\w+)\s*:\s*([A-Za-z_][A-Za-z0-9_\[\]]*)/g
    let paramMatch: RegExpExecArray | null
    while ((paramMatch = paramRe.exec(paramsStr)) !== null) {
      params.push({
        name: paramMatch[1],
        type: paramMatch[2],
        fnName,
        fnStartLine,
        fnEndLine
      })
    }
  }

  return params
}

// ---------------------------------------------------------------------------
// Struct hover
// ---------------------------------------------------------------------------

interface StructField { name: string; type: string; line: number; doc?: string }
interface StructDecl  { name: string; fields: StructField[]; line: number; doc?: string }

function findStructDecls(document: vscode.TextDocument): StructDecl[] {
  const text = document.getText()
  // Match: struct Name { field: Type, ... }
  const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}/gs
  const decls: StructDecl[] = []
  let m: RegExpExecArray | null

  while ((m = structRe.exec(text)) !== null) {
    const name = m[1]
    const body = m[2]
    const structLine = document.positionAt(m.index).line
    const bodyStartOffset = m.index + m[0].indexOf('{') + 1

    // Find JSDoc above struct
    const structDoc = findJsDocAbove(document, structLine)

    // Parse fields with their line numbers
    const fieldRe = /\b(\w+)\s*:\s*([A-Za-z_][A-Za-z0-9_\[\]]*)/g
    const fields: StructField[] = []
    let fm: RegExpExecArray | null
    while ((fm = fieldRe.exec(body)) !== null) {
      const fieldOffset = bodyStartOffset + fm.index
      const fieldLine = document.positionAt(fieldOffset).line
      // Check for inline comment: field: Type, // comment
      const lineText = document.lineAt(fieldLine).text
      const inlineMatch = lineText.match(/\/\/\s*(.+)$/)
      // Check for JSDoc/comment above field
      const docAbove = findFieldDocAbove(document, fieldLine)
      const fieldDoc = inlineMatch?.[1] || docAbove || undefined
      fields.push({ name: fm[1], type: fm[2], line: fieldLine, doc: fieldDoc })
    }

    decls.push({ name, fields, line: structLine, doc: structDoc ?? undefined })
  }
  return decls
}

/** Find comment above a struct field (single // comment or /** block). */
function findFieldDocAbove(document: vscode.TextDocument, fieldLine: number): string | null {
  if (fieldLine === 0) return null
  const prevLine = document.lineAt(fieldLine - 1).text.trim()
  // Check for // comment
  if (prevLine.startsWith('//')) {
    return prevLine.replace(/^\/\/\s*/, '')
  }
  // Check for /** */ on single line
  const blockMatch = prevLine.match(/\/\*\*?\s*(.*?)\s*\*\//)
  if (blockMatch) return blockMatch[1]
  // Multi-line block comment
  if (prevLine.endsWith('*/')) {
    return findJsDocAbove(document, fieldLine)
  }
  return null
}

function formatStructHover(decl: StructDecl): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true)
  const lines = [`struct ${decl.name} {`]
  for (const f of decl.fields) {
    const comment = f.doc ? `  // ${f.doc}` : ''
    lines.push(`    ${f.name}: ${f.type},${comment}`)
  }
  lines.push('}')
  md.appendCodeblock(lines.join('\n'), 'redscript')
  if (decl.doc) {
    md.appendText('\n')
    md.appendMarkdown(decl.doc)
  }
  return md
}

function formatFieldHover(structName: string, field: StructField): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true)
  md.appendCodeblock(`(field) ${structName}.${field.name}: ${field.type}`, 'redscript')
  if (field.doc) {
    md.appendText('\n')
    md.appendMarkdown(field.doc)
  }
  return md
}

// ---------------------------------------------------------------------------
// #mc_name hover
// ---------------------------------------------------------------------------

function formatMcNameHover(name: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true)
  md.appendCodeblock(`#${name}`, 'redscript')
  md.appendMarkdown(`MC identifier \`${name}\`\n\nUsed as an objective, tag, team, or gamerule name. Compiles to the bare name \`${name}\` without quotes.`)
  return md
}

// ---------------------------------------------------------------------------
// Hover provider
// ---------------------------------------------------------------------------

export function registerHoverProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('redscript', {
      provideHover(document, position) {
        const line = document.lineAt(position.line).text

        // ── #mc_name hover ──────────────────────────────────────
        const mcRange = document.getWordRangeAtPosition(position, /#[a-zA-Z_][a-zA-Z0-9_]*/)
        if (mcRange) {
          const raw = document.getText(mcRange)
          return new vscode.Hover(formatMcNameHover(raw.slice(1)), mcRange)
        }

        // ── Selector base hover (@a, @e, @s, etc.) ─────────────
        // Match just the @x part (2 chars)
        const baseSelectorRange = document.getWordRangeAtPosition(position, /@[aesprnAESPRN]/)
        if (baseSelectorRange) {
          const base = document.getText(baseSelectorRange)
          return new vscode.Hover(formatSelectorHover(base), baseSelectorRange)
        }

        // ── Selector argument hover (inside [...]) ──────────────
        // First get the word at cursor
        const wordAtCursor = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/)
        if (wordAtCursor) {
          const wordText = document.getText(wordAtCursor)
          // Check if this word is a known selector argument AND is followed by '='
          if (SELECTOR_ARG_DOCS[wordText]) {
            const afterWord = line.slice(wordAtCursor.end.character).trimStart()
            if (afterWord.startsWith('=')) {
              // Verify we're actually inside selector brackets by looking backwards for @x[
              const beforeWord = line.slice(0, wordAtCursor.start.character)
              // Check if there's an unclosed @x[ before this word
              const openBracket = beforeWord.lastIndexOf('[')
              const closeBracket = beforeWord.lastIndexOf(']')
              if (openBracket > closeBracket) {
                // We're inside brackets, check if preceded by @x
                const beforeBracket = beforeWord.slice(0, openBracket)
                if (/@[aesprnAESPRN]\s*$/.test(beforeBracket)) {
                  const argDoc = formatSelectorArgHover(wordText)
                  if (argDoc) {
                    return new vscode.Hover(argDoc, wordAtCursor)
                  }
                }
              }
            }
          }
        }

        const range = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/)
        if (!range) return undefined

        const word = document.getText(range)

        // ── Function parameter hover ────────────────────────────
        // Check if this word is a function parameter (must be inside that function's scope)
        const fnParams = findFnParams(document)
        const currentLine = position.line
        const param = fnParams.find(p =>
          p.name === word &&
          currentLine >= p.fnStartLine &&
          currentLine <= p.fnEndLine
        )
        if (param) {
          const md = new vscode.MarkdownString('', true)
          md.appendCodeblock(`(parameter) ${param.name}: ${param.type}`, 'redscript')
          return new vscode.Hover(md, range)
        }

        // ── Variable / let / const hover ────────────────────────
        // Check if this word has a let/const declaration in the document
        const varDecls = findVarDecls(document)
        const varDecl = varDecls.find(v => v.name === word)
        if (varDecl) {
          const md = new vscode.MarkdownString('', true)
          md.appendCodeblock(`${varDecl.kind} ${varDecl.name}: ${varDecl.type}`, 'redscript')
          return new vscode.Hover(md, range)
        }

        // ── Builtin function (only when used as a call, not variable name) ──
        // Only show builtin docs if the word is followed by '(' on the same line
        const afterWord = line.slice(range.end.character).trimStart()
        const isCall = afterWord.startsWith('(')
        if (isCall) {
          const builtin = BUILTINS[word]
          if (builtin) return new vscode.Hover(formatDoc(builtin), range)
        }

        // ── Struct type hover ───────────────────────────────────
        const structDecls = findStructDecls(document)
        const structDecl = structDecls.find(s => s.name === word)
        if (structDecl) {
          return new vscode.Hover(formatStructHover(structDecl), range)
        }

        // ── Member access: turret.tag ───────────────────────────
        // Check if word is preceded by '.' (member access)
        const charBefore = range.start.character > 0
          ? line.slice(range.start.character - 1, range.start.character)
          : ''
        if (charBefore === '.') {
          // Find the object name before the dot
          const beforeDot = line.slice(0, range.start.character - 1)
          const objMatch = beforeDot.match(/([A-Za-z_]\w*)$/)
          if (objMatch) {
            const objName = objMatch[1]
            // Find the type of the object from variable declarations
            const objVar = varDecls.find(v => v.name === objName)
            if (objVar) {
              const objStruct = structDecls.find(s => s.name === objVar.type)
              if (objStruct) {
                const field = objStruct.fields.find(f => f.name === word)
                if (field) {
                  return new vscode.Hover(formatFieldHover(objStruct.name, field), range)
                }
              }
            }
          }
        }

        // ── Struct literal field key: { phase: value } ──────────
        // Check if word is followed by ':' (struct literal field)
        const afterWordTrimmed = afterWord
        if (afterWordTrimmed.startsWith(':')) {
          // Find the struct type from context: let x: StructType = { ... }
          const textBefore = document.getText(new vscode.Range(new vscode.Position(0, 0), position))
          const letMatch = textBefore.match(/let\s+\w+\s*:\s*(\w+)\s*=\s*\{[^}]*$/)
          const fnMatch = textBefore.match(/->\s*(\w+)\s*\{[^}]*return\s*\{[^}]*$/)
          const structType = letMatch?.[1] || fnMatch?.[1]
          if (structType) {
            const targetStruct = structDecls.find(s => s.name === structType)
            if (targetStruct) {
              const field = targetStruct.fields.find(f => f.name === word)
              if (field) {
                return new vscode.Hover(formatFieldHover(targetStruct.name, field), range)
              }
            }
          }
        }

        // ── User-defined function + JSDoc ───────────────────────
        // Only if used as a call
        if (isCall) {
          const declLine = findFnDeclLine(document, word)
          if (declLine !== null) {
            const md = new vscode.MarkdownString('', true)
            const jsdoc = findJsDocAbove(document, declLine)
            md.appendCodeblock(`fn ${word}(...)`, 'redscript')
            if (jsdoc) { md.appendText('\n'); md.appendMarkdown(jsdoc) }
            return new vscode.Hover(md, range)
          }
        }

        return undefined
      }
    })
  )
}

