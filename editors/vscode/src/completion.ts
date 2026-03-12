import * as vscode from 'vscode'

const BUILTIN_FUNCTIONS = [
  { name: 'say', detail: 'say(message: string)', doc: 'Broadcast message to all players' },
  { name: 'tell', detail: 'tell(target: selector, message: string)', doc: 'Send private message' },
  { name: 'title', detail: 'title(target: selector, text: string)', doc: 'Show title on screen' },
  { name: 'actionbar', detail: 'actionbar(target: selector, text: string)', doc: 'Show actionbar text' },
  { name: 'tp', detail: 'tp(target: selector, pos: BlockPos)', doc: 'Teleport entity' },
  { name: 'give', detail: 'give(target: selector, item: string, count: int)', doc: 'Give item to player' },
  { name: 'kill', detail: 'kill(target: selector)', doc: 'Kill entities' },
  { name: 'summon', detail: 'summon(entity: string, pos: BlockPos)', doc: 'Summon entity' },
  { name: 'setblock', detail: 'setblock(pos: BlockPos, block: string)', doc: 'Set block' },
  { name: 'fill', detail: 'fill(from: BlockPos, to: BlockPos, block: string)', doc: 'Fill region' },
  { name: 'effect', detail: 'effect(target: selector, effect: string, duration: int)', doc: 'Apply effect' },
  { name: 'scoreboard_get', detail: 'scoreboard_get(target, objective) -> int', doc: 'Get score' },
  { name: 'scoreboard_set', detail: 'scoreboard_set(target, objective, value: int)', doc: 'Set score' },
  { name: 'scoreboard_add', detail: 'scoreboard_add(target, objective, value: int)', doc: 'Add to score' },
  { name: 'tag_add', detail: 'tag_add(target: selector, tag)', doc: 'Add tag' },
  { name: 'tag_remove', detail: 'tag_remove(target: selector, tag)', doc: 'Remove tag' },
  { name: 'weather', detail: 'weather(type: string)', doc: 'Set weather' },
  { name: 'time_set', detail: 'time_set(time: int)', doc: 'Set world time' },
  { name: 'gamerule', detail: 'gamerule(rule, value)', doc: 'Set gamerule' },
  { name: 'execute', detail: 'execute ...', doc: 'Execute subcommand' },
  { name: 'data_get', detail: 'data_get(type, target, path) -> int', doc: 'Get NBT data' },
  { name: 'data_set', detail: 'data_set(type, target, path, value)', doc: 'Set NBT data' },
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

export function registerCompletionProvider(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: 'redscript', scheme: 'file' },
    {
      provideCompletionItems() {
        const items: vscode.CompletionItem[] = []

        for (const fn of BUILTIN_FUNCTIONS) {
          const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function)
          item.detail = fn.detail
          item.documentation = fn.doc
          items.push(item)
        }

        for (const kw of KEYWORDS) {
          items.push(new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword))
        }

        for (const type of TYPES) {
          items.push(new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter))
        }

        return items
      },
    },
  )

  context.subscriptions.push(provider)
}
