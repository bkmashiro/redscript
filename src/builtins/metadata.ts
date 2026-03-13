/**
 * RedScript Builtin Metadata
 *
 * Comprehensive metadata for all builtin functions, used by:
 * - generate-dts CLI command (produces builtins.d.mcrs)
 * - VSCode extension hover docs
 * - Type checker documentation
 */

export type BuiltinParamType =
  | 'int'
  | 'float'
  | 'string'
  | 'bool'
  | 'coord'
  | 'selector'
  | 'nbt'
  | 'block'
  | 'item'
  | 'entity'
  | 'effect'
  | 'sound'
  | 'dimension'
  | 'BlockPos'
  | 'T[]'
  | 'T'

export interface BuiltinParam {
  name: string
  type: BuiltinParamType | string
  required: boolean
  default?: string
  doc: string
  docZh: string
}

export interface BuiltinDef {
  name: string
  params: BuiltinParam[]
  returns: 'void' | 'int' | 'bool' | 'string'
  doc: string
  docZh: string
  examples: string[]
  compilesTo?: string   // MC command template
  category: string
}

export const BUILTIN_METADATA: Record<string, BuiltinDef> = {
  // -------------------------------------------------------------------------
  // Chat & Display
  // -------------------------------------------------------------------------
  say: {
    name: 'say',
    params: [
      { name: 'message', type: 'string', required: true, doc: 'Message to broadcast to all players', docZh: '向所有玩家广播的消息' },
    ],
    returns: 'void',
    doc: 'Displays a message to all players in chat as the server.',
    docZh: '以服务器名义向所有玩家发送聊天消息。',
    examples: ['say("Hello, world!");', 'say("Game has started!");'],
    compilesTo: 'say <message>',
    category: 'chat',
  },

  tell: {
    name: 'tell',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player or entity selector', docZh: '目标玩家或实体选择器' },
      { name: 'message', type: 'string', required: true, doc: 'Message to send privately', docZh: '私信内容' },
    ],
    returns: 'void',
    doc: 'Sends a private message to a player or selector using tellraw.',
    docZh: '使用 tellraw 向玩家或选择器发送私信。',
    examples: ['tell(@s, "You won!");', 'tell(@a[tag=vip], "Welcome, VIP!");'],
    compilesTo: 'tellraw <target> {"text":"<message>"}',
    category: 'chat',
  },

  tellraw: {
    name: 'tellraw',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player or entity selector', docZh: '目标玩家或实体选择器' },
      { name: 'message', type: 'string', required: true, doc: 'Message text (supports f-string interpolation)', docZh: '消息文本（支持格式化字符串插值）' },
    ],
    returns: 'void',
    doc: 'Alias for tell(). Sends a raw text message using tellraw.',
    docZh: 'tell() 的别名，使用 tellraw 发送原始文本消息。',
    examples: ['tellraw(@s, "Hello!");'],
    compilesTo: 'tellraw <target> {"text":"<message>"}',
    category: 'chat',
  },

  announce: {
    name: 'announce',
    params: [
      { name: 'message', type: 'string', required: true, doc: 'Message to broadcast', docZh: '广播消息内容' },
    ],
    returns: 'void',
    doc: 'Sends a message to all players in chat (@a).',
    docZh: '向所有玩家（@a）发送聊天消息。',
    examples: ['announce("Round 1 starts in 3 seconds!");'],
    compilesTo: 'tellraw @a {"text":"<message>"}',
    category: 'chat',
  },

  title: {
    name: 'title',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player(s)', docZh: '目标玩家' },
      { name: 'message', type: 'string', required: true, doc: 'Title text to display', docZh: '标题文字' },
    ],
    returns: 'void',
    doc: 'Shows a large title on screen for target players.',
    docZh: '为目标玩家在屏幕上显示大标题。',
    examples: ['title(@a, "Round 1");', 'title(@s, "You Win!");'],
    compilesTo: 'title <target> title {"text":"<message>"}',
    category: 'chat',
  },

  subtitle: {
    name: 'subtitle',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player(s)', docZh: '目标玩家' },
      { name: 'message', type: 'string', required: true, doc: 'Subtitle text (appears below title)', docZh: '副标题文字（显示在主标题下方）' },
    ],
    returns: 'void',
    doc: 'Shows subtitle text below the main title on screen.',
    docZh: '在屏幕主标题下方显示副标题文字。',
    examples: ['subtitle(@a, "Fight!");'],
    compilesTo: 'title <target> subtitle {"text":"<message>"}',
    category: 'chat',
  },

  actionbar: {
    name: 'actionbar',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player(s)', docZh: '目标玩家' },
      { name: 'message', type: 'string', required: true, doc: 'Action bar text (above hotbar)', docZh: '动作栏文字（快捷栏上方）' },
    ],
    returns: 'void',
    doc: 'Displays text in the action bar (above the hotbar).',
    docZh: '在动作栏（快捷栏上方）显示文字。',
    examples: ['actionbar(@a, "⏱ ${time}s remaining");'],
    compilesTo: 'title <target> actionbar {"text":"<message>"}',
    category: 'chat',
  },

  title_times: {
    name: 'title_times',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player(s)', docZh: '目标玩家' },
      { name: 'fadeIn', type: 'int', required: true, doc: 'Fade-in duration in ticks', docZh: '淡入时长（tick）' },
      { name: 'stay', type: 'int', required: true, doc: 'Stay duration in ticks', docZh: '停留时长（tick）' },
      { name: 'fadeOut', type: 'int', required: true, doc: 'Fade-out duration in ticks', docZh: '淡出时长（tick）' },
    ],
    returns: 'void',
    doc: 'Sets title display timing in ticks. 20 ticks = 1 second.',
    docZh: '设置标题显示时间（以 tick 为单位），20 tick = 1 秒。',
    examples: ['title_times(@a, 10, 40, 10);', '// Show for 2 seconds\ntitle_times(@a, 5, 40, 5);'],
    compilesTo: 'title <target> times <fadeIn> <stay> <fadeOut>',
    category: 'chat',
  },

  // -------------------------------------------------------------------------
  // Player
  // -------------------------------------------------------------------------
  give: {
    name: 'give',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player(s)', docZh: '目标玩家' },
      { name: 'item', type: 'item', required: true, doc: 'Item ID (e.g. "minecraft:diamond")', docZh: '物品 ID（如 "minecraft:diamond"）' },
      { name: 'count', type: 'int', required: false, default: '1', doc: 'Number of items to give', docZh: '给予物品数量' },
      { name: 'nbt', type: 'nbt', required: false, doc: 'Optional NBT data for the item', docZh: '可选的 NBT 数据' },
    ],
    returns: 'void',
    doc: 'Gives item(s) to a player.',
    docZh: '给予玩家物品。',
    examples: [
      'give(@s, "minecraft:diamond", 5);',
      'give(@a, "minecraft:apple");',
      'give(@s, "minecraft:diamond_sword", 1, "{Enchantments:[{id:\\"minecraft:sharpness\\",lvl:5s}]}");',
    ],
    compilesTo: 'give <target> <item>[nbt] [count]',
    category: 'player',
  },

  kill: {
    name: 'kill',
    params: [
      { name: 'target', type: 'selector', required: false, default: '@s', doc: 'Target to kill (default: @s)', docZh: '击杀目标（默认：@s）' },
    ],
    returns: 'void',
    doc: 'Kills the target entity. Defaults to the executing entity (@s).',
    docZh: '击杀目标实体，默认击杀当前执行实体（@s）。',
    examples: ['kill(@e[type=minecraft:zombie]);', 'kill(@s);', 'kill(@e[tag=enemy]);'],
    compilesTo: 'kill [target]',
    category: 'player',
  },

  effect: {
    name: 'effect',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target entity or player', docZh: '目标实体或玩家' },
      { name: 'effect', type: 'effect', required: true, doc: 'Effect ID (e.g. "minecraft:speed")', docZh: '药水效果 ID（如 "minecraft:speed"）' },
      { name: 'duration', type: 'int', required: false, default: '30', doc: 'Duration in seconds', docZh: '持续时间（秒）' },
      { name: 'amplifier', type: 'int', required: false, default: '0', doc: 'Effect level (0-255, where 0 = level 1)', docZh: '效果等级（0-255，0 代表等级 1）' },
    ],
    returns: 'void',
    doc: 'Applies a status effect to an entity.',
    docZh: '为实体应用药水状态效果。',
    examples: [
      'effect(@s, "minecraft:speed", 60, 1);',
      'effect(@a, "minecraft:regeneration", 10);',
      'effect(@e[type=minecraft:zombie], "minecraft:slowness", 20, 2);',
    ],
    compilesTo: 'effect give <target> <effect> [duration] [amplifier]',
    category: 'player',
  },

  effect_clear: {
    name: 'effect_clear',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target entity or player', docZh: '目标实体或玩家' },
      { name: 'effect', type: 'effect', required: false, doc: 'Effect to remove (omit to clear all)', docZh: '要清除的效果（省略则清除所有）' },
    ],
    returns: 'void',
    doc: 'Removes a status effect from an entity, or clears all effects.',
    docZh: '移除实体的药水效果，省略 effect 参数则清除所有效果。',
    examples: ['effect_clear(@s, "minecraft:poison");', 'effect_clear(@a);'],
    compilesTo: 'effect clear <target> [effect]',
    category: 'player',
  },

  clear: {
    name: 'clear',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player', docZh: '目标玩家' },
      { name: 'item', type: 'item', required: false, doc: 'Specific item to remove (omit to clear all)', docZh: '要清除的物品（省略则清除所有）' },
    ],
    returns: 'void',
    doc: 'Removes items from a player\'s inventory.',
    docZh: '清除玩家背包中的物品。',
    examples: ['clear(@s, "minecraft:dirt");', 'clear(@a);'],
    compilesTo: 'clear <target> [item]',
    category: 'player',
  },

  kick: {
    name: 'kick',
    params: [
      { name: 'player', type: 'selector', required: true, doc: 'Target player to kick', docZh: '要踢出的玩家' },
      { name: 'reason', type: 'string', required: false, doc: 'Kick message shown to the player', docZh: '踢出原因（显示给玩家）' },
    ],
    returns: 'void',
    doc: 'Kicks a player from the server with an optional reason.',
    docZh: '将玩家踢出服务器，可附加原因。',
    examples: ['kick(@s, "You lost!");', 'kick(@p, "AFK too long");'],
    compilesTo: 'kick <player> [reason]',
    category: 'player',
  },

  xp_add: {
    name: 'xp_add',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player', docZh: '目标玩家' },
      { name: 'amount', type: 'int', required: true, doc: 'Amount of XP to add', docZh: '增加的经验值数量' },
      { name: 'type', type: 'string', required: false, default: 'points', doc: '"points" or "levels"', docZh: '"points"（经验点）或 "levels"（等级）' },
    ],
    returns: 'void',
    doc: 'Adds experience points or levels to a player.',
    docZh: '给玩家增加经验点或等级。',
    examples: ['xp_add(@s, 100);', 'xp_add(@s, 5, "levels");'],
    compilesTo: 'xp add <target> <amount> [type]',
    category: 'player',
  },

  xp_set: {
    name: 'xp_set',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target player', docZh: '目标玩家' },
      { name: 'amount', type: 'int', required: true, doc: 'New XP value', docZh: '新的经验值' },
      { name: 'type', type: 'string', required: false, default: 'points', doc: '"points" or "levels"', docZh: '"points"（经验点）或 "levels"（等级）' },
    ],
    returns: 'void',
    doc: 'Sets a player\'s experience points or levels.',
    docZh: '设置玩家的经验点或等级。',
    examples: ['xp_set(@s, 0, "levels");', 'xp_set(@s, 500);'],
    compilesTo: 'xp set <target> <amount> [type]',
    category: 'player',
  },

  // -------------------------------------------------------------------------
  // Teleport
  // -------------------------------------------------------------------------
  tp: {
    name: 'tp',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Entity to teleport', docZh: '要传送的实体' },
      { name: 'destination', type: 'selector', required: true, doc: 'Target player or BlockPos coordinates', docZh: '目标玩家或方块坐标' },
    ],
    returns: 'void',
    doc: 'Teleports an entity to a player or position.',
    docZh: '将实体传送到指定玩家或坐标。',
    examples: ['tp(@s, (0, 64, 0));', 'tp(@a, @s);', 'tp(@s, (~0, ~10, ~0));'],
    compilesTo: 'tp <target> <destination>',
    category: 'world',
  },

  tp_to: {
    name: 'tp_to',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Entity to teleport', docZh: '要传送的实体' },
      { name: 'destination', type: 'selector', required: true, doc: 'Target player or position', docZh: '目标玩家或位置' },
    ],
    returns: 'void',
    doc: '@deprecated Use tp() instead. Teleports an entity to a position.',
    docZh: '@deprecated 请使用 tp()。将实体传送到指定位置。',
    examples: ['tp(@s, (0, 64, 0));  // use tp instead'],
    compilesTo: 'tp <target> <destination>',
    category: 'world',
  },

  // -------------------------------------------------------------------------
  // World & Block
  // -------------------------------------------------------------------------
  setblock: {
    name: 'setblock',
    params: [
      { name: 'pos', type: 'BlockPos', required: true, doc: 'Block position, e.g. (0, 64, 0) or (~1, ~0, ~0)', docZh: '方块坐标，例如 (0, 64, 0) 或 (~1, ~0, ~0)' },
      { name: 'block', type: 'block', required: true, doc: 'Block ID (e.g. "minecraft:stone")', docZh: '方块 ID（如 "minecraft:stone"）' },
    ],
    returns: 'void',
    doc: 'Places a block at the specified coordinates.',
    docZh: '在指定坐标放置方块。',
    examples: ['setblock((0, 64, 0), "minecraft:stone");', 'setblock((~1, ~0, ~0), "minecraft:air");'],
    compilesTo: 'setblock <x> <y> <z> <block>',
    category: 'world',
  },

  fill: {
    name: 'fill',
    params: [
      { name: 'from', type: 'BlockPos', required: true, doc: 'Start corner of the region', docZh: '区域起始角落' },
      { name: 'to', type: 'BlockPos', required: true, doc: 'End corner of the region', docZh: '区域结束角落' },
      { name: 'block', type: 'block', required: true, doc: 'Block to fill with', docZh: '用于填充的方块' },
    ],
    returns: 'void',
    doc: 'Fills a cuboid region with a specified block.',
    docZh: '用指定方块填充一个立方体区域。',
    examples: [
      'fill((0, 64, 0), (10, 64, 10), "minecraft:grass_block");',
      'fill((~-5, ~-1, ~-5), (~5, ~-1, ~5), "minecraft:bedrock");',
    ],
    compilesTo: 'fill <x1> <y1> <z1> <x2> <y2> <z2> <block>',
    category: 'world',
  },

  clone: {
    name: 'clone',
    params: [
      { name: 'from', type: 'BlockPos', required: true, doc: 'Source region start corner', docZh: '源区域起始角落' },
      { name: 'to', type: 'BlockPos', required: true, doc: 'Source region end corner', docZh: '源区域结束角落' },
      { name: 'dest', type: 'BlockPos', required: true, doc: 'Destination corner', docZh: '目标角落' },
    ],
    returns: 'void',
    doc: 'Clones a region of blocks to a new location.',
    docZh: '将一个区域的方块复制到新的位置。',
    examples: ['clone((0,64,0), (10,64,10), (20,64,0));'],
    compilesTo: 'clone <x1> <y1> <z1> <x2> <y2> <z2> <dx> <dy> <dz>',
    category: 'world',
  },

  summon: {
    name: 'summon',
    params: [
      { name: 'type', type: 'entity', required: true, doc: 'Entity type ID (e.g. "minecraft:zombie")', docZh: '实体类型 ID（如 "minecraft:zombie"）' },
      { name: 'x', type: 'coord', required: false, default: '~', doc: 'X coordinate (default: ~)', docZh: 'X 坐标（默认：~）' },
      { name: 'y', type: 'coord', required: false, default: '~', doc: 'Y coordinate (default: ~)', docZh: 'Y 坐标（默认：~）' },
      { name: 'z', type: 'coord', required: false, default: '~', doc: 'Z coordinate (default: ~)', docZh: 'Z 坐标（默认：~）' },
      { name: 'nbt', type: 'nbt', required: false, doc: 'Optional NBT data for the entity', docZh: '可选的实体 NBT 数据' },
    ],
    returns: 'void',
    doc: 'Summons an entity at the specified position.',
    docZh: '在指定位置生成实体。',
    examples: [
      'summon("minecraft:zombie", ~0, ~0, ~0);',
      'summon("minecraft:armor_stand", (0, 64, 0));',
      'summon("minecraft:zombie", ~0, ~0, ~0, "{CustomName:\\"Boss\\"}");',
    ],
    compilesTo: 'summon <type> <x> <y> <z> [nbt]',
    category: 'world',
  },

  particle: {
    name: 'particle',
    params: [
      { name: 'name', type: 'string', required: true, doc: 'Particle type ID (e.g. "minecraft:flame")', docZh: '粒子类型 ID（如 "minecraft:flame"）' },
      { name: 'x', type: 'coord', required: false, default: '~', doc: 'X coordinate', docZh: 'X 坐标' },
      { name: 'y', type: 'coord', required: false, default: '~', doc: 'Y coordinate', docZh: 'Y 坐标' },
      { name: 'z', type: 'coord', required: false, default: '~', doc: 'Z coordinate', docZh: 'Z 坐标' },
    ],
    returns: 'void',
    doc: 'Spawns a particle effect at the specified position.',
    docZh: '在指定位置生成粒子效果。',
    examples: ['particle("minecraft:flame", (~0, ~1, ~0));', 'particle("minecraft:explosion", (0, 100, 0));'],
    compilesTo: 'particle <name> <x> <y> <z>',
    category: 'world',
  },

  playsound: {
    name: 'playsound',
    params: [
      { name: 'sound', type: 'sound', required: true, doc: 'Sound event ID (e.g. "entity.experience_orb.pickup")', docZh: '音效事件 ID（如 "entity.experience_orb.pickup"）' },
      { name: 'source', type: 'string', required: true, doc: 'Sound category: "master", "music", "record", "weather", "block", "hostile", "neutral", "player", "ambient", "voice"', docZh: '音效分类：master/music/record/weather/block/hostile/neutral/player/ambient/voice' },
      { name: 'target', type: 'selector', required: true, doc: 'Target player to hear the sound', docZh: '接收音效的目标玩家' },
      { name: 'x', type: 'coord', required: false, doc: 'X origin position', docZh: 'X 起源坐标' },
      { name: 'y', type: 'coord', required: false, doc: 'Y origin position', docZh: 'Y 起源坐标' },
      { name: 'z', type: 'coord', required: false, doc: 'Z origin position', docZh: 'Z 起源坐标' },
      { name: 'volume', type: 'float', required: false, default: '1.0', doc: 'Volume (default: 1.0)', docZh: '音量（默认：1.0）' },
      { name: 'pitch', type: 'float', required: false, default: '1.0', doc: 'Pitch (default: 1.0)', docZh: '音调（默认：1.0）' },
      { name: 'minVolume', type: 'float', required: false, doc: 'Minimum volume for distant players', docZh: '远处玩家的最小音量' },
    ],
    returns: 'void',
    doc: 'Plays a sound effect for target players.',
    docZh: '为目标玩家播放音效。',
    examples: [
      'playsound("entity.experience_orb.pickup", "player", @s);',
      'playsound("ui.toast.challenge_complete", "master", @a);',
    ],
    compilesTo: 'playsound <sound> <source> <target> [x] [y] [z] [volume] [pitch] [minVolume]',
    category: 'world',
  },

  weather: {
    name: 'weather',
    params: [
      { name: 'type', type: 'string', required: true, doc: '"clear", "rain", or "thunder"', docZh: '"clear"（晴天）、"rain"（下雨）或 "thunder"（雷暴）' },
    ],
    returns: 'void',
    doc: 'Sets the weather condition.',
    docZh: '设置天气状态。',
    examples: ['weather("clear");', 'weather("thunder");'],
    compilesTo: 'weather <type>',
    category: 'world',
  },

  time_set: {
    name: 'time_set',
    params: [
      { name: 'value', type: 'string', required: true, doc: 'Time in ticks, or "day"/"night"/"noon"/"midnight"', docZh: '时间（tick）或 "day"/"night"/"noon"/"midnight"' },
    ],
    returns: 'void',
    doc: 'Sets the world time.',
    docZh: '设置世界时间。',
    examples: ['time_set(0);  // dawn\ntime_set("noon");', 'time_set("midnight");'],
    compilesTo: 'time set <value>',
    category: 'world',
  },

  time_add: {
    name: 'time_add',
    params: [
      { name: 'ticks', type: 'int', required: true, doc: 'Number of ticks to advance', docZh: '推进的 tick 数' },
    ],
    returns: 'void',
    doc: 'Advances the world time by a number of ticks.',
    docZh: '将世界时间推进指定的 tick 数。',
    examples: ['time_add(6000);  // advance by half a day'],
    compilesTo: 'time add <ticks>',
    category: 'world',
  },

  gamerule: {
    name: 'gamerule',
    params: [
      { name: 'rule', type: 'string', required: true, doc: 'Gamerule name (e.g. "keepInventory")', docZh: '游戏规则名称（如 "keepInventory"）' },
      { name: 'value', type: 'string', required: true, doc: 'New value (true/false for boolean rules, integer for numeric)', docZh: '新值（布尔规则为 true/false，数值规则为整数）' },
    ],
    returns: 'void',
    doc: 'Sets a gamerule value.',
    docZh: '设置游戏规则的值。',
    examples: ['gamerule("keepInventory", true);', 'gamerule("randomTickSpeed", 3);'],
    compilesTo: 'gamerule <rule> <value>',
    category: 'world',
  },

  difficulty: {
    name: 'difficulty',
    params: [
      { name: 'level', type: 'string', required: true, doc: '"peaceful", "easy", "normal", or "hard"', docZh: '"peaceful"（和平）、"easy"（简单）、"normal"（普通）或 "hard"（困难）' },
    ],
    returns: 'void',
    doc: 'Sets the game difficulty.',
    docZh: '设置游戏难度。',
    examples: ['difficulty("hard");', 'difficulty("peaceful");'],
    compilesTo: 'difficulty <level>',
    category: 'world',
  },

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------
  tag_add: {
    name: 'tag_add',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target entity', docZh: '目标实体' },
      { name: 'tag', type: 'string', required: true, doc: 'Tag name to add', docZh: '要添加的标签名' },
    ],
    returns: 'void',
    doc: 'Adds a scoreboard tag to an entity.',
    docZh: '为实体添加计分板标签。',
    examples: ['tag_add(@s, "hasKey");', 'tag_add(@e[type=minecraft:zombie], "boss");'],
    compilesTo: 'tag <target> add <tag>',
    category: 'entities',
  },

  tag_remove: {
    name: 'tag_remove',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target entity', docZh: '目标实体' },
      { name: 'tag', type: 'string', required: true, doc: 'Tag name to remove', docZh: '要移除的标签名' },
    ],
    returns: 'void',
    doc: 'Removes a scoreboard tag from an entity.',
    docZh: '从实体身上移除计分板标签。',
    examples: ['tag_remove(@s, "hasKey");'],
    compilesTo: 'tag <target> remove <tag>',
    category: 'entities',
  },

  // -------------------------------------------------------------------------
  // Scoreboard
  // -------------------------------------------------------------------------
  scoreboard_get: {
    name: 'scoreboard_get',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Player, entity, or fake player name (e.g. "#counter")', docZh: '玩家、实体或虚拟玩家名（如 "#counter"）' },
      { name: 'objective', type: 'string', required: true, doc: 'Scoreboard objective name', docZh: '计分板目标名称' },
    ],
    returns: 'int',
    doc: 'Reads a value from a vanilla MC scoreboard objective.',
    docZh: '从原版 MC 计分板目标读取数值。',
    examples: ['let hp: int = scoreboard_get(@s, "health");', 'let kills: int = scoreboard_get(@s, "kills");'],
    compilesTo: 'scoreboard players get <target> <objective>',
    category: 'scoreboard',
  },

  score: {
    name: 'score',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Player, entity, or fake player name', docZh: '玩家、实体或虚拟玩家名' },
      { name: 'objective', type: 'string', required: true, doc: 'Scoreboard objective name', docZh: '计分板目标名称' },
    ],
    returns: 'int',
    doc: 'Alias for scoreboard_get(). Reads a value from a scoreboard.',
    docZh: 'scoreboard_get() 的别名，从计分板读取数值。',
    examples: ['let kills: int = score(@s, "kills");'],
    compilesTo: 'scoreboard players get <target> <objective>',
    category: 'scoreboard',
  },

  scoreboard_set: {
    name: 'scoreboard_set',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Player, entity, or fake player', docZh: '玩家、实体或虚拟玩家' },
      { name: 'objective', type: 'string', required: true, doc: 'Objective name', docZh: '计分板目标名称' },
      { name: 'value', type: 'int', required: true, doc: 'New score value', docZh: '新的分数值' },
    ],
    returns: 'void',
    doc: 'Sets a value in a vanilla MC scoreboard objective.',
    docZh: '设置原版 MC 计分板目标中的数值。',
    examples: ['scoreboard_set("#game", "timer", 300);', 'scoreboard_set(@s, "lives", 3);'],
    compilesTo: 'scoreboard players set <target> <objective> <value>',
    category: 'scoreboard',
  },

  scoreboard_display: {
    name: 'scoreboard_display',
    params: [
      { name: 'slot', type: 'string', required: true, doc: '"list", "sidebar", or "belowName"', docZh: '"list"（列表）、"sidebar"（侧边栏）或 "belowName"（名字下方）' },
      { name: 'objective', type: 'string', required: true, doc: 'Objective name to display', docZh: '要显示的计分板目标名称' },
    ],
    returns: 'void',
    doc: 'Displays a scoreboard objective in a display slot.',
    docZh: '在指定显示位置展示计分板目标。',
    examples: ['scoreboard_display("sidebar", "kills");'],
    compilesTo: 'scoreboard objectives setdisplay <slot> <objective>',
    category: 'scoreboard',
  },

  scoreboard_hide: {
    name: 'scoreboard_hide',
    params: [
      { name: 'slot', type: 'string', required: true, doc: '"list", "sidebar", or "belowName"', docZh: '"list"、"sidebar" 或 "belowName"' },
    ],
    returns: 'void',
    doc: 'Clears the display in a scoreboard slot.',
    docZh: '清除计分板显示位置的内容。',
    examples: ['scoreboard_hide("sidebar");'],
    compilesTo: 'scoreboard objectives setdisplay <slot>',
    category: 'scoreboard',
  },

  scoreboard_add_objective: {
    name: 'scoreboard_add_objective',
    params: [
      { name: 'name', type: 'string', required: true, doc: 'Objective name', docZh: '目标名称' },
      { name: 'criteria', type: 'string', required: true, doc: 'Criteria (e.g. "dummy", "playerKillCount")', docZh: '标准类型（如 "dummy"、"playerKillCount"）' },
      { name: 'displayName', type: 'string', required: false, doc: 'Optional display name', docZh: '可选的显示名称' },
    ],
    returns: 'void',
    doc: 'Creates a new scoreboard objective.',
    docZh: '创建新的计分板目标。',
    examples: ['scoreboard_add_objective("kills", "playerKillCount");', 'scoreboard_add_objective("timer", "dummy", "Game Timer");'],
    compilesTo: 'scoreboard objectives add <name> <criteria> [displayName]',
    category: 'scoreboard',
  },

  scoreboard_remove_objective: {
    name: 'scoreboard_remove_objective',
    params: [
      { name: 'name', type: 'string', required: true, doc: 'Objective name to remove', docZh: '要删除的目标名称' },
    ],
    returns: 'void',
    doc: 'Removes a scoreboard objective.',
    docZh: '删除计分板目标。',
    examples: ['scoreboard_remove_objective("kills");'],
    compilesTo: 'scoreboard objectives remove <name>',
    category: 'scoreboard',
  },

  // -------------------------------------------------------------------------
  // Random
  // -------------------------------------------------------------------------
  random: {
    name: 'random',
    params: [
      { name: 'min', type: 'int', required: true, doc: 'Minimum value (inclusive)', docZh: '最小值（包含）' },
      { name: 'max', type: 'int', required: true, doc: 'Maximum value (inclusive)', docZh: '最大值（包含）' },
    ],
    returns: 'int',
    doc: 'Generates a random integer in range [min, max] using scoreboard arithmetic. Compatible with all MC versions.',
    docZh: '使用计分板运算生成 [min, max] 范围内的随机整数，兼容所有 MC 版本。',
    examples: ['let roll: int = random(1, 6);', 'let chance: int = random(0, 99);'],
    compilesTo: 'scoreboard players random <dst> rs <min> <max>',
    category: 'random',
  },

  random_native: {
    name: 'random_native',
    params: [
      { name: 'min', type: 'int', required: true, doc: 'Minimum value (inclusive)', docZh: '最小值（包含）' },
      { name: 'max', type: 'int', required: true, doc: 'Maximum value (inclusive)', docZh: '最大值（包含）' },
    ],
    returns: 'int',
    doc: 'Generates a random integer using /random command (MC 1.20.3+). Faster and more reliable than random().',
    docZh: '使用 /random 命令（MC 1.20.3+）生成随机整数，比 random() 更快更可靠。',
    examples: ['let n: int = random_native(1, 100);'],
    compilesTo: 'execute store result score <dst> rs run random value <min> <max>',
    category: 'random',
  },

  random_sequence: {
    name: 'random_sequence',
    params: [
      { name: 'sequence', type: 'string', required: true, doc: 'Sequence name (namespaced, e.g. "mypack:loot")', docZh: '序列名称（带命名空间，如 "mypack:loot"）' },
      { name: 'seed', type: 'int', required: false, default: '0', doc: 'Seed value', docZh: '种子值' },
    ],
    returns: 'void',
    doc: 'Resets a random sequence with an optional seed (MC 1.20.3+).',
    docZh: '重置随机序列，可指定种子（MC 1.20.3+）。',
    examples: ['random_sequence("mypack:loot", 42);'],
    compilesTo: 'random reset <sequence> <seed>',
    category: 'random',
  },

  // -------------------------------------------------------------------------
  // Data (NBT)
  // -------------------------------------------------------------------------
  data_get: {
    name: 'data_get',
    params: [
      { name: 'targetType', type: 'string', required: true, doc: '"entity", "block", or "storage"', docZh: '"entity"（实体）、"block"（方块）或 "storage"（存储）' },
      { name: 'target', type: 'string', required: true, doc: 'Target selector or storage path', docZh: '目标选择器或存储路径' },
      { name: 'path', type: 'string', required: true, doc: 'NBT path (e.g. "Health")', docZh: 'NBT 路径（如 "Health"）' },
      { name: 'scale', type: 'float', required: false, default: '1', doc: 'Scale factor', docZh: '缩放因子' },
    ],
    returns: 'int',
    doc: 'Reads NBT data from an entity, block, or storage into an integer variable.',
    docZh: '从实体、方块或存储读取 NBT 数据到整型变量。',
    examples: [
      'let hp: int = data_get("entity", "@s", "Health");',
      'let val: int = data_get("storage", "mypack:data", "myKey");',
    ],
    compilesTo: 'execute store result score <dst> rs run data get <targetType> <target> <path> [scale]',
    category: 'data',
  },

  data_merge: {
    name: 'data_merge',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Target entity selector or block position', docZh: '目标实体选择器或方块坐标' },
      { name: 'nbt', type: 'nbt', required: true, doc: 'NBT data to merge (struct literal or string)', docZh: '要合并的 NBT 数据（结构体字面量或字符串）' },
    ],
    returns: 'void',
    doc: 'Merges NBT data into an entity, block, or storage.',
    docZh: '将 NBT 数据合并到实体、方块或存储中。',
    examples: ['data_merge(@s, { Invisible: 1b, Silent: 1b });'],
    compilesTo: 'data merge entity/block/storage <target> <nbt>',
    category: 'data',
  },

  // -------------------------------------------------------------------------
  // Bossbar
  // -------------------------------------------------------------------------
  bossbar_add: {
    name: 'bossbar_add',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID (namespaced, e.g. "minecraft:health")', docZh: '血条 ID（带命名空间，如 "minecraft:health"）' },
      { name: 'name', type: 'string', required: true, doc: 'Display name', docZh: '显示名称' },
    ],
    returns: 'void',
    doc: 'Creates a new boss bar.',
    docZh: '创建新的 Boss 血条。',
    examples: ['bossbar_add("mymod:timer", "Time Left");'],
    compilesTo: 'bossbar add <id> {"text":"<name>"}',
    category: 'bossbar',
  },

  bossbar_set_value: {
    name: 'bossbar_set_value',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID', docZh: '血条 ID' },
      { name: 'value', type: 'int', required: true, doc: 'Current value', docZh: '当前值' },
    ],
    returns: 'void',
    doc: 'Sets the current value of a boss bar.',
    docZh: '设置 Boss 血条的当前值。',
    examples: ['bossbar_set_value("mymod:timer", 60);'],
    compilesTo: 'bossbar set <id> value <value>',
    category: 'bossbar',
  },

  bossbar_set_max: {
    name: 'bossbar_set_max',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID', docZh: '血条 ID' },
      { name: 'max', type: 'int', required: true, doc: 'Maximum value', docZh: '最大值' },
    ],
    returns: 'void',
    doc: 'Sets the maximum value of a boss bar.',
    docZh: '设置 Boss 血条的最大值。',
    examples: ['bossbar_set_max("mymod:timer", 300);'],
    compilesTo: 'bossbar set <id> max <max>',
    category: 'bossbar',
  },

  bossbar_set_color: {
    name: 'bossbar_set_color',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID', docZh: '血条 ID' },
      { name: 'color', type: 'string', required: true, doc: '"blue", "green", "pink", "purple", "red", "white", or "yellow"', docZh: '"blue"/"green"/"pink"/"purple"/"red"/"white"/"yellow"' },
    ],
    returns: 'void',
    doc: 'Sets the color of a boss bar.',
    docZh: '设置 Boss 血条的颜色。',
    examples: ['bossbar_set_color("mymod:timer", "red");'],
    compilesTo: 'bossbar set <id> color <color>',
    category: 'bossbar',
  },

  bossbar_set_style: {
    name: 'bossbar_set_style',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar segmentation style', docZh: '血条分段样式' },
      { name: 'style', type: 'string', required: true, doc: '"notched_6", "notched_10", "notched_12", "notched_20", or "progress"', docZh: '"notched_6"/"notched_10"/"notched_12"/"notched_20"/"progress"' },
    ],
    returns: 'void',
    doc: 'Sets the style (segmentation) of a boss bar.',
    docZh: '设置 Boss 血条的样式（分段方式）。',
    examples: ['bossbar_set_style("mymod:timer", "notched_10");'],
    compilesTo: 'bossbar set <id> style <style>',
    category: 'bossbar',
  },

  bossbar_set_visible: {
    name: 'bossbar_set_visible',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID', docZh: '血条 ID' },
      { name: 'visible', type: 'bool', required: true, doc: 'Visibility state (true = show, false = hide)', docZh: '可见状态（true = 显示，false = 隐藏）' },
    ],
    returns: 'void',
    doc: 'Shows or hides a boss bar.',
    docZh: '显示或隐藏 Boss 血条。',
    examples: ['bossbar_set_visible("mymod:timer", true);'],
    compilesTo: 'bossbar set <id> visible <visible>',
    category: 'bossbar',
  },

  bossbar_set_players: {
    name: 'bossbar_set_players',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID', docZh: '血条 ID' },
      { name: 'target', type: 'selector', required: true, doc: 'Players who should see the boss bar', docZh: '能看到血条的玩家' },
    ],
    returns: 'void',
    doc: 'Sets which players can see the boss bar.',
    docZh: '设置哪些玩家能看到 Boss 血条。',
    examples: ['bossbar_set_players("mymod:timer", @a);'],
    compilesTo: 'bossbar set <id> players <target>',
    category: 'bossbar',
  },

  bossbar_remove: {
    name: 'bossbar_remove',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID to remove', docZh: '要移除的血条 ID' },
    ],
    returns: 'void',
    doc: 'Removes a boss bar.',
    docZh: '移除 Boss 血条。',
    examples: ['bossbar_remove("mymod:timer");'],
    compilesTo: 'bossbar remove <id>',
    category: 'bossbar',
  },

  bossbar_get_value: {
    name: 'bossbar_get_value',
    params: [
      { name: 'id', type: 'string', required: true, doc: 'Boss bar ID', docZh: '血条 ID' },
    ],
    returns: 'int',
    doc: 'Gets the current value of a boss bar.',
    docZh: '获取 Boss 血条的当前值。',
    examples: ['let v: int = bossbar_get_value("mymod:timer");'],
    compilesTo: 'execute store result score <dst> rs run bossbar get <id> value',
    category: 'bossbar',
  },

  // -------------------------------------------------------------------------
  // Teams
  // -------------------------------------------------------------------------
  team_add: {
    name: 'team_add',
    params: [
      { name: 'name', type: 'string', required: true, doc: 'Team name', docZh: '队伍名称' },
      { name: 'displayName', type: 'string', required: false, doc: 'Optional display name', docZh: '可选的显示名称' },
    ],
    returns: 'void',
    doc: 'Creates a new team.',
    docZh: '创建新的队伍。',
    examples: ['team_add("red");', 'team_add("blue", "Blue Team");'],
    compilesTo: 'team add <name> [displayName]',
    category: 'teams',
  },

  team_remove: {
    name: 'team_remove',
    params: [
      { name: 'name', type: 'string', required: true, doc: 'Team name to remove', docZh: '要移除的队伍名称' },
    ],
    returns: 'void',
    doc: 'Removes a team.',
    docZh: '移除队伍。',
    examples: ['team_remove("red");'],
    compilesTo: 'team remove <name>',
    category: 'teams',
  },

  team_join: {
    name: 'team_join',
    params: [
      { name: 'name', type: 'string', required: true, doc: 'Team name to join', docZh: '要加入的队伍名称' },
      { name: 'target', type: 'selector', required: true, doc: 'Entities to add to the team', docZh: '要加入队伍的实体' },
    ],
    returns: 'void',
    doc: 'Adds entities to a team.',
    docZh: '将实体加入队伍。',
    examples: ['team_join("red", @s);', 'team_join("blue", @a[tag=blue_team]);'],
    compilesTo: 'team join <name> <target>',
    category: 'teams',
  },

  team_leave: {
    name: 'team_leave',
    params: [
      { name: 'target', type: 'selector', required: true, doc: 'Entities to remove from their team', docZh: '要离开队伍的实体' },
    ],
    returns: 'void',
    doc: 'Removes entities from their current team.',
    docZh: '将实体从当前队伍中移除。',
    examples: ['team_leave(@s);'],
    compilesTo: 'team leave <target>',
    category: 'teams',
  },

  team_option: {
    name: 'team_option',
    params: [
      { name: 'name', type: 'string', required: true, doc: 'Team name', docZh: '队伍名称' },
      { name: 'option', type: 'string', required: true, doc: 'Option name (e.g. "color", "friendlyFire", "prefix")', docZh: '选项名（如 "color"、"friendlyFire"、"prefix"）' },
      { name: 'value', type: 'string', required: true, doc: 'Option value', docZh: '选项值' },
    ],
    returns: 'void',
    doc: 'Sets a team option/property.',
    docZh: '设置队伍选项/属性。',
    examples: ['team_option("red", "color", "red");', 'team_option("blue", "friendlyFire", "false");'],
    compilesTo: 'team modify <name> <option> <value>',
    category: 'teams',
  },

  // -------------------------------------------------------------------------
  // Sets (NBT-backed unique collections)
  // -------------------------------------------------------------------------
  set_new: {
    name: 'set_new',
    params: [],
    returns: 'string',
    doc: 'Creates a new unique set backed by NBT storage. Returns the set ID.',
    docZh: '创建新的基于 NBT 存储的唯一集合，返回集合 ID。',
    examples: ['let enemies: string = set_new();', 'set_add(enemies, "@s");'],
    compilesTo: 'data modify storage rs:sets <setId> set value []',
    category: 'collections',
  },

  set_add: {
    name: 'set_add',
    params: [
      { name: 'setId', type: 'string', required: true, doc: 'Set ID returned by set_new()', docZh: 'set_new() 返回的集合 ID' },
      { name: 'value', type: 'string', required: true, doc: 'Value to add', docZh: '要添加的值' },
    ],
    returns: 'void',
    doc: 'Adds a value to a set (no-op if already present).',
    docZh: '向集合添加值（若已存在则不操作）。',
    examples: ['set_add(enemies, "@s");'],
    compilesTo: 'execute unless data storage rs:sets <setId>[{value:<v>}] run data modify ...',
    category: 'collections',
  },

  set_contains: {
    name: 'set_contains',
    params: [
      { name: 'setId', type: 'string', required: true, doc: 'Set ID', docZh: '集合 ID' },
      { name: 'value', type: 'string', required: true, doc: 'Value to check', docZh: '要检查的值' },
    ],
    returns: 'int',
    doc: 'Returns 1 if the set contains the value, 0 otherwise.',
    docZh: '若集合包含该值返回 1，否则返回 0。',
    examples: ['if set_contains(enemies, "@s") { kill(@s); }'],
    compilesTo: 'execute store result score <dst> rs if data storage rs:sets <setId>[{value:<v>}]',
    category: 'collections',
  },

  set_remove: {
    name: 'set_remove',
    params: [
      { name: 'setId', type: 'string', required: true, doc: 'Set ID', docZh: '集合 ID' },
      { name: 'value', type: 'string', required: true, doc: 'Value to remove', docZh: '要移除的值' },
    ],
    returns: 'void',
    doc: 'Removes a value from a set.',
    docZh: '从集合中移除一个值。',
    examples: ['set_remove(enemies, "@s");'],
    compilesTo: 'data remove storage rs:sets <setId>[{value:<v>}]',
    category: 'collections',
  },

  set_clear: {
    name: 'set_clear',
    params: [
      { name: 'setId', type: 'string', required: true, doc: 'Set ID to clear', docZh: '要清空的集合 ID' },
    ],
    returns: 'void',
    doc: 'Removes all values from a set.',
    docZh: '清空集合中的所有值。',
    examples: ['set_clear(enemies);'],
    compilesTo: 'data modify storage rs:sets <setId> set value []',
    category: 'collections',
  },

  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------
  setTimeout: {
    name: 'setTimeout',
    params: [
      { name: 'delay', type: 'int', required: true, doc: 'Delay in ticks before executing the callback', docZh: '执行回调前的延迟（tick）' },
      { name: 'callback', type: 'string', required: true, doc: 'Lambda function to execute after delay', docZh: '延迟后执行的 lambda 函数' },
    ],
    returns: 'void',
    doc: 'Executes a callback function after a delay (in ticks).',
    docZh: '在指定延迟（tick）后执行回调函数。',
    examples: ['setTimeout(100, () => { say("5 seconds passed!"); });'],
    compilesTo: 'schedule function <ns>:<callback> <delay>t',
    category: 'timers',
  },

  setInterval: {
    name: 'setInterval',
    params: [
      { name: 'interval', type: 'int', required: true, doc: 'Interval in ticks between executions', docZh: '每次执行之间的间隔（tick）' },
      { name: 'callback', type: 'string', required: true, doc: 'Lambda function to execute repeatedly', docZh: '重复执行的 lambda 函数' },
    ],
    returns: 'int',
    doc: 'Executes a callback function repeatedly at a fixed interval. Returns an interval ID.',
    docZh: '以固定间隔重复执行回调函数，返回间隔 ID。',
    examples: ['let timer: int = setInterval(20, () => { say("Every second!"); });'],
    compilesTo: 'schedule function <ns>:<callback> <interval>t',
    category: 'timers',
  },

  clearInterval: {
    name: 'clearInterval',
    params: [
      { name: 'id', type: 'int', required: true, doc: 'Interval ID returned by setInterval()', docZh: 'setInterval() 返回的间隔 ID' },
    ],
    returns: 'void',
    doc: 'Cancels a repeating interval created by setInterval().',
    docZh: '取消由 setInterval() 创建的重复间隔。',
    examples: ['clearInterval(timer);'],
    compilesTo: 'schedule clear <ns>:<intervalFn>',
    category: 'timers',
  },
}

/**
 * Returns the .d.mcrs declaration file signature for a builtin function.
 */
export function builtinToDeclaration(def: BuiltinDef): string {
  const lines: string[] = []

  // Doc comments (English only)
  lines.push(`/// ${def.doc}`)

  // Param docs
  for (const p of def.params) {
    const optTag = p.required ? '' : ' (optional)'
    lines.push(`/// @param ${p.name} ${p.doc}${optTag}`)
  }

  // Returns
  if (def.returns !== 'void') {
    lines.push(`/// @returns ${def.returns}`)
  }

  // Examples
  for (const ex of def.examples) {
    lines.push(`/// @example ${ex.split('\n')[0]}`)
  }

  // Signature - use default value syntax instead of ? for optional params
  const paramStrs = def.params.map(p => {
    let type = p.type
    if (type === 'effect') type = 'string'
    if (type === 'sound') type = 'string'
    if (type === 'block') type = 'string'
    if (type === 'item') type = 'string'
    if (type === 'entity') type = 'string'
    if (type === 'dimension') type = 'string'
    if (type === 'nbt') type = 'string'
    if (!p.required && p.default !== undefined) {
      return `${p.name}: ${type} = ${p.default}`
    }
    return `${p.name}: ${type}`
  })

  const retType = def.returns
  lines.push(`declare fn ${def.name}(${paramStrs.join(', ')}): ${retType};`)

  return lines.join('\n')
}

/**
 * Generates the full builtins.d.mcrs content.
 */
export function generateDts(): string {
  const sections: Record<string, string[]> = {}

  for (const def of Object.values(BUILTIN_METADATA)) {
    if (!sections[def.category]) {
      sections[def.category] = []
    }
    sections[def.category].push(builtinToDeclaration(def))
  }

  const categoryTitles: Record<string, string> = {
    chat: 'Chat & Display',
    player: 'Player',
    world: 'World & Block',
    entities: 'Entities & Tags',
    scoreboard: 'Scoreboard',
    random: 'Random',
    data: 'Data (NBT)',
    bossbar: 'Boss Bar',
    teams: 'Teams',
    collections: 'Collections (Set)',
    timers: 'Timers',
  }

  const output: string[] = [
    '// builtins.d.mcrs',
    '// RedScript builtin function declarations',
    '// Auto-generated by: redscript generate-dts',
    '// DO NOT EDIT — regenerate with: redscript generate-dts',
    '',
  ]

  for (const [cat, decls] of Object.entries(sections)) {
    const title = categoryTitles[cat] ?? cat
    output.push(`// ${'─'.repeat(70)}`)
    output.push(`// ${title}`)
    output.push(`// ${'─'.repeat(70)}`)
    output.push('')
    output.push(...decls.map(d => d + '\n'))
  }

  return output.join('\n')
}
