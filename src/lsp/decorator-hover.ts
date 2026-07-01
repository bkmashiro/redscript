import { isInsideStringOrLineComment } from './objective-hover'

export interface DecoratorHoverInfo {
  name: string
  markdown: string
}

const DECORATOR_HOVER_DISCLAIMER =
  'Static/editor decorator metadata: this text is a language/runtime documentation hint and is not a live Paper/server validation.'

const DECORATOR_DOCS: Record<string, string> = {
  tick: [
    '**@tick**',
    '',
    'Runtime decorator that registers the function for periodic execution in the datapack tick loop.',
    '- `@tick` — run on every game tick.',
    '- `@tick(rate=N)` — run every `N` ticks.',
    '',
    'Example:',
    '- `@tick fn every_tick() {}`',
    '- `@tick(rate=20) fn every_second() {}`',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  load: [
    '**@load**',
    '',
    'Runtime decorator that runs the function from `/reload`/datapack initialization flow.',
    'Use for one-time setup such as scoreboard/objective bootstrap or registration.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  keep: [
    '**@keep**',
    '',
    'Prevents dead-code elimination so the function is retained in emitted output even if unused in static references.',
    'Useful for runtime entry points that are invoked indirectly by generated runtime glue.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  test: [
    '**@test**',
    '',
    'Marks the function as a test case consumed by `redscript test` flow.',
    'Optional label: `@test("name")`.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  coroutine: [
    '**@coroutine**',
    '',
    'Splits long loops across ticks to avoid oversized command bursts.',
    '- `@coroutine(batch=N)` sets loop iterations per tick.',
    '- Optional `onDone="fn"` callback runs after completion.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  throttle: [
    '**@throttle**',
    '',
    'Rate-limits function execution.',
    '`@throttle(ticks=N)` limits how often this function runs.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  retry: [
    '**@retry**',
    '',
    'Executes the function with bounded retries for temporary failures.',
    '`@retry(max=N)` retries up to `N` attempts.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  memoize: [
    '**@memoize**',
    '',
    'Caches function results for pure/deterministic computations to avoid repeated work.',
    'Use with stable inputs; the cache persists according to generated runtime semantics.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  watch: [
    '**@watch**',
    '',
    'Runs when a scoreboard objective changes value. Use with a required objective name or selector context argument.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  schedule: [
    '**@schedule**',
    '',
    'Schedules the function for delayed execution in ticks.',
    '`@schedule(ticks=N)` delays invocation by N ticks.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  on: [
    '**@on**',
    '',
    'Legacy runtime event handler decorator form: `@on(EventType)`.',
    'Prefer more explicit modern event/runtime forms when available.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  on_trigger: [
    '**@on_trigger**',
    '',
    'Runs when a player uses `/trigger` for the configured objective.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  on_advancement: [
    '**@on_advancement**',
    '',
    'Runs when the configured advancement is awarded.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  on_craft: [
    '**@on_craft**',
    '',
    'Runs when the configured item is crafted.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  on_death: [
    '**@on_death**',
    '',
    'Legacy legacy decorator for player death handling. Consider modern event patterns where available.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  on_join_team: [
    '**@on_join_team**',
    '',
    'Runs when a player joins a configured team.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  on_login: [
    '**@on_login**',
    '',
    'Legacy decorator for login-like hooks. Prefer explicit modern runtime event forms when available.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  function_tag: [
    '**@function_tag**',
    '',
    'Attach the function to a named function tag.',
    'Example: `@function_tag("minecraft:tick") fn ticked() {}`',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
  require_on_load: [
    '**@require_on_load**',
    '',
    'Preserve stdlib helpers by forcing load-time dependency behavior.',
    '',
    DECORATOR_HOVER_DISCLAIMER,
  ].join('\n'),
}

export function getDecoratorHover(lineText: string, cursor: number): DecoratorHoverInfo | null {
  if (isInsideStringOrLineComment(lineText, cursor)) return null

  const decoratorRe = /@([a-zA-Z_][a-zA-Z0-9_]*)/g
  let match: RegExpExecArray | null
  while ((match = decoratorRe.exec(lineText)) !== null) {
    const start = match.index
    const end = match.index + match[0].length
    if (cursor < start || cursor > end) continue

    const decoratorName = match[1]
    const doc = DECORATOR_DOCS[decoratorName]
    if (!doc) continue

    return {
      name: decoratorName,
      markdown: doc,
    }
  }

  return null
}
