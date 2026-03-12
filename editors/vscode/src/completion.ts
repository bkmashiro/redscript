import * as vscode from 'vscode'

interface BuiltinFunction {
  name: string
  detail: string
  doc: string
  insertText?: string
  kind?: vscode.CompletionItemKind
}

const BUILTIN_FUNCTIONS: BuiltinFunction[] = [
  { name: 'say', detail: 'say(msg: string)', doc: 'Broadcast a message to all players as the server.' },
  { name: 'tell', detail: 'tell(target: selector, msg: string)', doc: 'Send a private message to a player or selector.' },
  { name: 'announce', detail: 'announce(msg: string)', doc: 'Send a message to all players in chat.' },
  { name: 'title', detail: 'title(target: selector, msg: string)', doc: 'Show a large title on screen for target players.' },
  { name: 'subtitle', detail: 'subtitle(target: selector, msg: string)', doc: 'Show subtitle text below the title.' },
  { name: 'actionbar', detail: 'actionbar(target: selector, msg: string)', doc: 'Show text in the action bar (above hotbar).' },
  { name: 'title_times', detail: 'title_times(target: selector, fadeIn: int, stay: int, fadeOut: int)', doc: 'Set title display timing (in ticks).' },
  { name: 'give', detail: 'give(target: selector, item: string, count?: int)', doc: 'Give item(s) to a player.' },
  { name: 'kill', detail: 'kill(target?: selector)', doc: 'Kill entity/entities. Defaults to @s.' },
  { name: 'effect', detail: 'effect(target: selector, effect: string, duration?: int, amplifier?: int)', doc: 'Apply a status effect.' },
  { name: 'clear', detail: 'clear(target: selector, item?: string)', doc: 'Remove items from inventory.' },
  { name: 'kick', detail: 'kick(player: selector, reason?: string)', doc: 'Kick a player from the server.' },
  { name: 'xp_add', detail: 'xp_add(target: selector, amount: int, type?: string)', doc: 'Add experience to a player.' },
  { name: 'xp_set', detail: 'xp_set(target: selector, amount: int, type?: string)', doc: "Set a player's experience." },
  { name: 'tp', detail: 'tp(target: selector, destination: selector | BlockPos)', doc: 'Teleport entity to a player or coordinates.' },
  { name: 'setblock', detail: 'setblock(pos: BlockPos, block: string)', doc: 'Place a block at coordinates.' },
  { name: 'fill', detail: 'fill(from: BlockPos, to: BlockPos, block: string)', doc: 'Fill a region with blocks.' },
  { name: 'clone', detail: 'clone(from: BlockPos, to: BlockPos, dest: BlockPos)', doc: 'Clone a region of blocks to a new location.' },
  { name: 'summon', detail: 'summon(type: string, pos: BlockPos)', doc: 'Spawn an entity at a location.' },
  { name: 'weather', detail: 'weather(type: string)', doc: 'Set the weather.' },
  { name: 'time_set', detail: 'time_set(value: int | string)', doc: 'Set the world time.' },
  { name: 'time_add', detail: 'time_add(ticks: int)', doc: 'Advance world time by ticks.' },
  { name: 'gamerule', detail: 'gamerule(rule: string, value: bool | int)', doc: 'Set a gamerule value.' },
  { name: 'difficulty', detail: 'difficulty(level: string)', doc: 'Set the game difficulty.' },
  { name: 'particle', detail: 'particle(name: string, pos: BlockPos)', doc: 'Spawn a particle effect.' },
  { name: 'playsound', detail: 'playsound(sound: string, source: string, target: selector, pos?: BlockPos, volume?: float, pitch?: float)', doc: 'Play a sound for a player.' },
  { name: 'tag_add', detail: 'tag_add(target: selector, tag: string)', doc: 'Add an entity tag.' },
  { name: 'tag_remove', detail: 'tag_remove(target: selector, tag: string)', doc: 'Remove an entity tag.' },
  { name: 'scoreboard_get', detail: 'scoreboard_get(target: selector | string, objective: string) -> int', doc: 'Read a scoreboard value.' },
  { name: 'score', detail: 'score(target: selector | string, objective: string) -> int', doc: 'Alias for scoreboard_get. Read a scoreboard value.' },
  { name: 'scoreboard_set', detail: 'scoreboard_set(target: selector | string, objective: string, value: int)', doc: 'Set a scoreboard value.' },
  { name: 'scoreboard_add', detail: 'scoreboard_add(target: selector | string, objective: string, amount: int)', doc: 'Add to a scoreboard value.' },
  { name: 'scoreboard_display', detail: 'scoreboard_display(slot: string, objective: string)', doc: 'Display a scoreboard objective in a slot.' },
  { name: 'scoreboard_add_objective', detail: 'scoreboard_add_objective(name: string, criteria: string)', doc: 'Create a new scoreboard objective.' },
  { name: 'scoreboard_remove_objective', detail: 'scoreboard_remove_objective(name: string)', doc: 'Remove a scoreboard objective.' },
  { name: 'scoreboard_hide', detail: 'scoreboard_hide(slot: string)', doc: 'Clear the display in a scoreboard slot.' },
  { name: 'random', detail: 'random(min: int, max: int) -> int', doc: 'Generate a random integer in range [min, max] using scoreboard arithmetic.' },
  { name: 'random_native', detail: 'random_native(min: int, max: int) -> int', doc: 'Generate a random integer using /random command (MC 1.20.3+). Faster than random().' },
  { name: 'str_len', detail: 'str_len(s: string) -> int', doc: 'Get the length of a string (stored in NBT storage).' },
  { name: 'push', detail: 'push(arr: T[], value: T)', doc: 'Append a value to the end of an array.' },
  { name: 'pop', detail: 'pop(arr: T[]) -> T', doc: 'Remove and return the last element of an array.' },
  { name: 'len', detail: 'arr.len', doc: 'Get the number of elements in an array (property access, not a function call).', kind: vscode.CompletionItemKind.Property },
  { name: 'data_get', detail: 'data_get(target: string, path: string) -> int', doc: 'Read NBT data from entity/block/storage.' },
  { name: 'bossbar_add', detail: 'bossbar_add(id: string, name: string)', doc: 'Create a new boss bar.' },
  { name: 'bossbar_set_value', detail: 'bossbar_set_value(id: string, value: int)', doc: 'Set boss bar current value.' },
  { name: 'bossbar_set_max', detail: 'bossbar_set_max(id: string, max: int)', doc: 'Set boss bar maximum value.' },
  { name: 'bossbar_remove', detail: 'bossbar_remove(id: string)', doc: 'Remove a boss bar.' },
  { name: 'bossbar_set_players', detail: 'bossbar_set_players(id: string, target: selector)', doc: 'Set which players see the boss bar.' },
  { name: 'bossbar_set_color', detail: 'bossbar_set_color(id: string, color: string)', doc: 'Set boss bar color.' },
  { name: 'bossbar_set_style', detail: 'bossbar_set_style(id: string, style: string)', doc: 'Set boss bar segmentation style.' },
  { name: 'bossbar_set_visible', detail: 'bossbar_set_visible(id: string, visible: bool)', doc: 'Show or hide a boss bar.' },
  { name: 'bossbar_get_value', detail: 'bossbar_get_value(id: string) -> int', doc: 'Get the current value of a boss bar.' },
  { name: 'team_add', detail: 'team_add(name: string)', doc: 'Create a new team.' },
  { name: 'team_remove', detail: 'team_remove(name: string)', doc: 'Remove a team.' },
  { name: 'team_join', detail: 'team_join(name: string, target: selector)', doc: 'Add entities to a team.' },
  { name: 'team_leave', detail: 'team_leave(target: selector)', doc: 'Remove entities from their team.' },
  { name: 'team_option', detail: 'team_option(name: string, option: string, value: string)', doc: 'Set a team option.' },
  { name: 'tick', detail: '@tick  |  @tick(rate: int)', doc: 'Run this function every tick (rate=1) or every N ticks.', insertText: '@tick', kind: vscode.CompletionItemKind.Event },
  { name: 'on_advancement', detail: '@on_advancement(id: string)', doc: 'Trigger when a player earns an advancement.', insertText: '@on_advancement', kind: vscode.CompletionItemKind.Event },
  { name: 'on_death', detail: '@on_death', doc: 'Trigger when the executing entity dies.', insertText: '@on_death', kind: vscode.CompletionItemKind.Event },
  { name: 'on_craft', detail: '@on_craft(item: string)', doc: 'Trigger when a player crafts an item.', insertText: '@on_craft', kind: vscode.CompletionItemKind.Event },
]

const KEYWORDS = [
  'fn',
  'let',
  'const',
  'if',
  'else',
  'match',
  'foreach',
  'in',
  'return',
  'struct',
  'enum',
  'execute',
  'as',
  'at',
  'true',
  'false',
]

const TYPES = ['int', 'float', 'string', 'bool', 'void', 'BlockPos', 'selector']
const TRIGGER_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_@'.split('')

export function registerCompletionProvider(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: 'redscript', scheme: 'file' },
    {
      provideCompletionItems() {
        const items: vscode.CompletionItem[] = []

        for (const builtin of BUILTIN_FUNCTIONS) {
          const item = new vscode.CompletionItem(
            builtin.name,
            builtin.kind ?? vscode.CompletionItemKind.Function,
          )
          item.detail = builtin.detail
          item.documentation = builtin.doc
          item.insertText = builtin.insertText ?? builtin.name
          items.push(item)
        }

        for (const keyword of KEYWORDS) {
          items.push(new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword))
        }

        for (const type of TYPES) {
          items.push(new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter))
        }

        return items
      },
    },
    ...TRIGGER_CHARACTERS,
  )

  context.subscriptions.push(provider)
}
