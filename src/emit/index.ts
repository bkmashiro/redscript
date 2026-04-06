/**
 * Stage 7 — LIR → .mcfunction Emission
 *
 * Converts a LIRModule into DatapackFile[] representing a Minecraft datapack.
 * Each LIRFunction becomes a .mcfunction file under data/<ns>/function/.
 */

import type { LIRModule, LIRFunction, LIRInstr, Slot, CmpOp, ExecuteSubcmd } from '../lir/types'
import {
  NamespaceSourceMapBuilder,
  SourceMapBuilder,
  namespaceSourceMapPath,
  serializeSourceMap,
  sourceMapPath,
} from './sourcemap'
import { McVersion, DEFAULT_MC_VERSION } from '../types/mc-version'

export interface DatapackFile {
  path: string
  content: string
}

export interface WatchFunction {
  name: string
  objective: string
}

export interface EmitOptions {
  namespace: string
  tickFunctions?: string[]
  loadFunctions?: string[]
  scheduleFunctions?: Array<{ name: string; ticks: number }>
  watchFunctions?: WatchFunction[]
  /** When true, generate a .sourcemap.json sidecar file for each .mcfunction */
  generateSourceMap?: boolean
  /** Target Minecraft version; controls which MC features are used in codegen */
  mcVersion?: McVersion
  /** Map of EventTypeName → list of fully-qualified function references for @on handlers */
  eventHandlers?: Map<string, string[]>
  /** Scoreboard objective names for @singleton struct fields — added to load.mcfunction */
  singletonObjectives?: string[]
  /** Functions decorated with @profile. */
  profiledFunctions?: string[]
  /** Functions decorated with @benchmark. */
  benchmarkFunctions?: string[]
  /** Emit debug-only profiling instrumentation and helpers. */
  enableProfiling?: boolean
  /** Functions decorated with @throttle. */
  throttleFunctions?: Array<{ name: string; ticks: number }>
  /** Functions decorated with @retry. */
  retryFunctions?: Array<{ name: string; max: number }>
  /** Functions decorated with @memoize — single-arg int result caching (LRU-1). */
  memoizeFunctions?: string[]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function emit(module: LIRModule, options: EmitOptions): DatapackFile[] {
  const { namespace } = options
  const tickFns = options.tickFunctions ?? []
  const loadFns = options.loadFunctions ?? []
  const scheduleFns = options.scheduleFunctions ?? []
  const watchFns = options.watchFunctions ?? []
  const profiledFns = options.profiledFunctions ?? []
  const benchmarkFns = options.benchmarkFunctions ?? []
  const enableProfiling = options.enableProfiling ?? false
  const throttleFns = options.throttleFunctions ?? []
  const retryFns = options.retryFunctions ?? []
  const memoizeFns = options.memoizeFunctions ?? []
  const objective = module.objective
  const genSourceMap = options.generateSourceMap ?? false
  const mcVersion = options.mcVersion ?? DEFAULT_MC_VERSION
  const files: DatapackFile[] = []
  const namespaceMapBuilder = genSourceMap ? new NamespaceSourceMapBuilder() : null

  // pack.mcmeta
  files.push({
    path: 'pack.mcmeta',
    content: JSON.stringify({
      pack: { pack_format: 26, description: `RedScript datapack: ${namespace}` },
    }, null, 2) + '\n',
  })

  const singletonObjectives = options.singletonObjectives ?? []

  // load.mcfunction — creates the scoreboard objective
  const loadCmds = [
    `scoreboard objectives add ${objective} dummy`,
    ...watchFns.map(watch => `scoreboard objectives add ${watchPrevObjective(watch.name)} dummy`),
    ...singletonObjectives.map(obj => `scoreboard objectives add ${obj} dummy`),
    ...(enableProfiling && profiledFns.length > 0
      ? [
          'scoreboard objectives add __time dummy',
          'scoreboard objectives add __profile dummy',
        ]
      : []),
    ...(benchmarkFns.length > 0 ? ['scoreboard objectives add __bench dummy'] : []),
    ...throttleFns.map(t => `scoreboard objectives add ${throttleObjective(t.name)} dummy`),
    ...retryFns.map(r => `scoreboard objectives add ${retryObjective(r.name)} dummy`),
    ...(memoizeFns.length > 0 ? [`scoreboard objectives add __memo dummy`] : []),
  ]
  files.push({
    path: `data/${namespace}/function/load.mcfunction`,
    content: loadCmds.join('\n') + '\n',
  })

  // Each LIR function → .mcfunction file
  for (const fn of module.functions) {
    const fnPath = fnNameToPath(fn.name, namespace)
    namespaceMapBuilder?.addFunctionMapping(qualifiedFunctionRef(fn.name, namespace), fn.sourceLoc, humanFunctionName(fn))
    if (genSourceMap) {
      const builder = new SourceMapBuilder(fnPath)
      const lines = emitFunction(fn, namespace, objective, mcVersion, enableProfiling && profiledFns.includes(fn.name), builder)
      files.push({ path: fnPath, content: lines.join('\n') + '\n' })
      const map = builder.build()
      if (map) {
        files.push({ path: sourceMapPath(fnPath), content: serializeSourceMap(map) })
      }
    } else {
      const lines = emitFunction(fn, namespace, objective, mcVersion, enableProfiling && profiledFns.includes(fn.name))
      files.push({ path: fnPath, content: lines.join('\n') + '\n' })
    }
  }

  const namespaceMap = namespaceMapBuilder?.build()
  if (namespaceMap) {
    files.push({
      path: namespaceSourceMapPath(namespace),
      content: serializeSourceMap(namespaceMap),
    })
  }

  if (enableProfiling && profiledFns.length > 0) {
    files.push({
      path: `data/${namespace}/function/__profiler_reset.mcfunction`,
      content: emitProfilerReset(profiledFns).join('\n') + '\n',
    })
    files.push({
      path: `data/${namespace}/function/__profiler_report.mcfunction`,
      content: emitProfilerReport(profiledFns).join('\n') + '\n',
    })
  }

  // @schedule wrapper functions: _schedule_xxx → schedule function ns:xxx Nt
  for (const { name, ticks } of scheduleFns) {
    files.push({
      path: `data/${namespace}/function/_schedule_${name}.mcfunction`,
      content: `schedule function ${namespace}:${name} ${ticks}t\n`,
    })
  }

  // @benchmark wrapper functions
  for (const name of benchmarkFns) {
    const implName = `${name}_impl`
    const deltaPlayer = benchmarkDeltaPlayer(name)
    files.push({
      path: fnNameToPath(name, namespace),
      content: `function ${namespace}:${implName}\n`,
    })
    files.push({
      path: fnNameToPath(benchmarkWrapperName(name), namespace),
      content: [
        `scoreboard players set ${benchmarkStartPlayer(name)} __bench 0`,
        `execute store result score ${benchmarkStartPlayer(name)} __bench run time query gametime`,
        `function ${namespace}:${implName}`,
        `scoreboard players set ${deltaPlayer} __bench 0`,
        `execute store result score ${deltaPlayer} __bench run time query gametime`,
        `scoreboard players operation ${deltaPlayer} __bench -= ${benchmarkStartPlayer(name)} __bench`,
        `tellraw @a [{"text":"[benchmark] ${name}: "},{"score":{"name":"${deltaPlayer}","objective":"__bench"}},{"text":" ticks"}]`,
      ].join('\n') + '\n',
    })
  }

  for (const watch of watchFns) {
    const dispatcher = watchDispatcherName(watch.name)
    const prevObjective = watchPrevObjective(watch.name)
    const changedCondition = `unless score @s ${watch.objective} = @s ${prevObjective}`
    files.push({
      path: fnNameToPath(dispatcher, namespace),
      content: [
        `execute as @a unless score @s ${prevObjective} = @s ${prevObjective} run scoreboard players operation @s ${prevObjective} = @s ${watch.objective}`,
        `execute as @a ${changedCondition} run function ${namespace}:${watch.name}`,
        `execute as @a ${changedCondition} run scoreboard players operation @s ${prevObjective} = @s ${watch.objective}`,
      ].join('\n') + '\n',
    })
  }

  // @throttle wrapper functions
  for (const { name, ticks } of throttleFns) {
    const obj = throttleObjective(name)
    const inner = `${name}_inner`
    files.push({
      path: fnNameToPath(throttleDispatcherName(name), namespace),
      content: [
        `scoreboard players add __throttle_${name} ${obj} 1`,
        `execute if score __throttle_${name} ${obj} matches ${ticks}.. run function ${namespace}:${inner}`,
        `execute if score __throttle_${name} ${obj} matches ${ticks}.. run scoreboard players set __throttle_${name} ${obj} 0`,
      ].join('\n') + '\n',
    })
    // Rename the original function to _inner by emitting a redirect wrapper:
    // The original LIR function keeps its original name; the dispatcher wraps it.
    // We just need the dispatcher to call the real function as <name>_inner.
    // Actually: the original compiled function stays as <name>. We generate
    // a wrapper at <name>_inner that simply calls <name>.
    files.push({
      path: fnNameToPath(inner, namespace),
      content: `function ${namespace}:${name}\n`,
    })
  }

  /**
   * Emits the two mcfunctions that implement the `@retry` state machine for `name`:
   *
   * - `<name>_tick` (registered as `@tick`): each tick, if the retry counter is > 0 it
   *   calls the wrapped function and inspects `$ret`. A return value of 0 signals failure
   *   (decrement counter); any non-zero value signals success (reset counter to 0).
   * - `<name>_start`: sets the retry counter to `max`, triggering a new retry sequence.
   *
   * The scoreboard objective `__retry_<name>` (via `retryObjective`) holds the remaining
   * attempt count. Callers start a sequence by invoking `<name>_start`; the tick dispatcher
   * runs automatically until the function succeeds or attempts are exhausted.
   */
  // @retry wrapper functions
  for (const { name, max } of retryFns) {
    const obj = retryObjective(name)
    const dispatcherName = retryDispatcherName(name)
    files.push({
      path: fnNameToPath(dispatcherName, namespace),
      content: [
        `execute if score __retry_${name} ${obj} matches 1.. run function ${namespace}:${name}`,
        `execute if score __retry_${name} ${obj} matches 1.. if score $ret ${obj} matches 0 run scoreboard players remove __retry_${name} ${obj} 1`,
        `execute if score __retry_${name} ${obj} matches 1.. unless score $ret ${obj} matches 0 run scoreboard players set __retry_${name} ${obj} 0`,
      ].join('\n') + '\n',
    })
    files.push({
      path: fnNameToPath(`${name}_start`, namespace),
      content: `scoreboard players set __retry_${name} ${obj} ${max}\n`,
    })
  }

  // @memoize wrapper functions (LRU-1 cache: last call arg/result)
  // The original compiled function has been renamed to <name>_impl.
  // We generate <name>.mcfunction as the public entry point with cache logic:
  //   Players in __memo objective:
  //     __memo_<name>_key  — cached argument value
  //     __memo_<name>_val  — cached return value
  //     __memo_<name>_hit  — 1 if a cached result is available
  //   On call ($p0 = argument):
  //     1. If __memo_<name>_hit == 1 AND __memo_<name>_key == $p0 → copy cached val to $ret, return
  //     2. Otherwise: call <name>_impl, store $p0 → key, $ret → val, set hit=1
  for (const name of memoizeFns) {
    const keyPlayer = `__memo_${name}_key`
    const valPlayer = `__memo_${name}_val`
    const hitPlayer = `__memo_${name}_hit`
    const implName = `${name}_impl`
    files.push({
      path: fnNameToPath(name, namespace),
      content: [
        `# @memoize wrapper for ${name} (LRU-1 cache)`,
        `# Cache hit: valid flag set AND key matches current arg`,
        `execute if score ${hitPlayer} __memo matches 1 if score ${keyPlayer} __memo = $p0 ${objective} run scoreboard players operation $ret ${objective} = ${valPlayer} __memo`,
        `execute if score ${hitPlayer} __memo matches 1 if score ${keyPlayer} __memo = $p0 ${objective} run return 0`,
        `# Cache miss: call implementation, store result`,
        `function ${namespace}:${implName}`,
        `scoreboard players operation ${keyPlayer} __memo = $p0 ${objective}`,
        `scoreboard players operation ${valPlayer} __memo = $ret ${objective}`,
        `scoreboard players set ${hitPlayer} __memo 1`,
      ].join('\n') + '\n',
    })
  }

  // Tag files for tick/load
  // load.json is always generated because load.mcfunction is always emitted
  // (it unconditionally creates the scoreboard objective). loadFns are
  // additional user-defined @load functions appended after the built-in one.
  const loadValues = [`${namespace}:load`, ...loadFns.map(fn => `${namespace}:${fn}`)]
  files.push({
    path: 'data/minecraft/tags/function/load.json',
    content: JSON.stringify({ values: loadValues }, null, 2) + '\n',
  })

  const allTickFns = [
    ...tickFns,
    ...watchFns.map(watch => watchDispatcherName(watch.name)),
    ...throttleFns.map(t => throttleDispatcherName(t.name)),
    ...retryFns.map(r => retryDispatcherName(r.name)),
  ]
  if (allTickFns.length > 0) {
    const tickValues = allTickFns.map(fn => `${namespace}:${fn}`)
    files.push({
      path: 'data/minecraft/tags/function/tick.json',
      content: JSON.stringify({ values: tickValues }, null, 2) + '\n',
    })
  }

  // Event handler tag files: data/rs/tags/function/on_<event>.json
  const EVENT_TAG_NAMES: Record<string, string> = {
    PlayerJoin: 'on_player_join',
    PlayerDeath: 'on_player_death',
    EntityKill: 'on_entity_kill',
    ItemUse: 'on_item_use',
    BlockBreak: 'on_block_break',
  }

  if (options.eventHandlers) {
    for (const [evType, handlers] of options.eventHandlers) {
      const tagName = EVENT_TAG_NAMES[evType]
      if (tagName && handlers.length > 0) {
        files.push({
          path: `data/rs/tags/function/${tagName}.json`,
          content: JSON.stringify({ values: handlers }, null, 2) + '\n',
        })
      }
    }
  }

  return files
}

// ---------------------------------------------------------------------------
// Function emission
// ---------------------------------------------------------------------------

/**
 * Emit all MC commands for a single LIR function.
 *
 * Iterates over the function's instructions, prepending de-duplicated source
 * markers (`# src: file:line`) and optional profiler instrumentation, then
 * delegates each instruction to {@link emitInstr} and passes the result through
 * {@link flattenExecute} to collapse redundant nested `execute` chains.
 *
 * @param fn - The LIR function to emit.
 * @param namespace - Datapack namespace (e.g. `"mypack"`).
 * @param objective - Scoreboard objective used for temporary score storage.
 * @param mcVersion - Target Minecraft version; controls which syntax is used.
 * @param isProfiled - When `true`, wrap the body with profiler start/end lines.
 * @param builder - Optional source-map builder; receives one entry per emitted line.
 * @returns Array of raw `.mcfunction` command strings (one per line).
 */
function emitFunction(
  fn: LIRFunction,
  namespace: string,
  objective: string,
  mcVersion: McVersion,
  isProfiled = false,
  builder?: SourceMapBuilder,
): string[] {
  const lines: string[] = []
  const pushLine = (line: string, sourceLoc?: LIRFunction['sourceLoc']): void => {
    lines.push(line)
    builder?.addLine(sourceLoc)
  }

  for (const line of emitFunctionHeader(fn)) pushLine(line)
  if (isProfiled) {
    for (const line of profilerStartLines(fn.name)) pushLine(line)
  }

  let lastSourceMarker: string | undefined
  for (const instr of fn.instructions) {
    const marker = instr.sourceLoc ? formatSourceMarker(instr.sourceLoc) : undefined
    if (marker && marker !== lastSourceMarker) {
      pushLine(`# src: ${marker}`)
      lastSourceMarker = marker
    }
    pushLine(flattenExecute(emitInstr(instr, namespace, objective, mcVersion)), instr.sourceLoc)
  }
  if (isProfiled) {
    for (const line of profilerEndLines(fn.name)) pushLine(line)
  }
  return lines
}

/**
 * Converts a LIR function name to its output `.mcfunction` file path.
 *
 * LIR method names use `::` as a namespace separator (e.g. `Player::heal`).
 * Minecraft function IDs use `/` (e.g. `player/heal`), so `::` is replaced.
 * The result is always lower-cased to match MC's case-insensitive function IDs.
 *
 * @param name - LIR function name, possibly containing `::` separators.
 * @param namespace - Datapack namespace (e.g. `"rs"`).
 * @returns Relative datapack path such as `data/rs/function/player/heal.mcfunction`.
 */
function fnNameToPath(name: string, namespace: string): string {
  // LIR function names may contain :: for methods — convert to /
  const mcName = name.replace(/::/g, '/').toLowerCase()
  return `data/${namespace}/function/${mcName}.mcfunction`
}

/**
 * Produces the fully-qualified Minecraft function reference for a LIR function.
 *
 * This is the string used in `function` commands and tag files, e.g. `rs:player/heal`.
 * `::` separators are normalised to `/` and the name is lower-cased.
 *
 * @param name - LIR function name, possibly containing `::` separators.
 * @param namespace - Datapack namespace (e.g. `"rs"`).
 * @returns Qualified reference such as `"rs:player/heal"`.
 */
function qualifiedFunctionRef(name: string, namespace: string): string {
  return `${namespace}:${name.replace(/::/g, '/').toLowerCase()}`
}

/**
 * Extracts a readable display name for a LIR function, used in source-map entries.
 *
 * Tries to pull the identifier directly after the `fn` keyword from the stored
 * source snippet. Falls back to the last component of the `::` path, then to the
 * raw LIR name when no snippet is available.
 *
 * @param fn - The LIR function whose human name is needed.
 * @returns A short display name such as `"heal"` or `"Player::heal"`.
 */
function humanFunctionName(fn: LIRFunction): string {
  const match = fn.sourceSnippet?.match(/^fn\s+([^(]+)/)
  return match?.[1] ?? fn.name.split('::').pop() ?? fn.name
}

/**
 * Emits the comment header lines written at the top of every `.mcfunction` file.
 *
 * Includes a `# Generated from:` line with the source file and line number, and
 * optionally a `# Source:` line with the original source snippet. Returns an empty
 * array when the function has no location info (e.g. compiler-generated helpers).
 *
 * @param fn - The LIR function being emitted.
 * @returns Zero or more comment lines to prepend to the function body.
 */
function emitFunctionHeader(fn: LIRFunction): string[] {
  if (!fn.sourceLoc) return []
  const lines: string[] = []
  lines.push(`# Generated from: ${fn.sourceLoc.file}:${fn.sourceLoc.line} (fn ${humanFunctionName(fn)})`)
  if (fn.sourceSnippet) {
    lines.push(`# Source: ${fn.sourceSnippet}`)
  }
  return lines
}

/**
 * Formats a source location as the `file:line` string used in inline `# src:` markers.
 *
 * These markers appear inside `.mcfunction` bodies to correlate generated commands
 * back to the original source line, aiding debugging without a full source map.
 *
 * @param sourceLoc - Non-null source location attached to a LIR instruction.
 * @returns A string such as `"src/game.rs:42"`.
 */
function formatSourceMarker(sourceLoc: NonNullable<LIRInstr['sourceLoc']>): string {
  return `${sourceLoc.file}:${sourceLoc.line}`
}

/**
 * Returns the name of the tick-registered dispatcher function for a `@watch` function.
 *
 * The dispatcher runs every game tick for all players, detects when the watched
 * scoreboard objective changed value, and calls the user function on those players.
 * It is registered in `data/minecraft/tags/function/tick.json`.
 *
 * Generated file: `data/<ns>/function/__watch_<name>.mcfunction`
 *
 * @param name - Base name of the `@watch`-decorated function.
 * @returns The internal dispatcher function name, e.g. `"__watch_onScore"`.
 */
function watchDispatcherName(name: string): string {
  return `__watch_${name}`
}

/**
 * Returns the name of the scoreboard objective that stores each player's previous
 * value of the watched score, used to detect changes between ticks.
 *
 * The objective is created in `load.mcfunction` and updated by the watch dispatcher
 * after each detected change so the next tick starts with the fresh baseline.
 *
 * Scoreboard objective name: `__watch_<name>_prev`
 *
 * @param name - Base name of the `@watch`-decorated function.
 * @returns The objective name, e.g. `"__watch_onScore_prev"`.
 */
function watchPrevObjective(name: string): string {
  return `__watch_${name}_prev`
}

/**
 * Returns the name of the tick-registered dispatcher function for a `@throttle` function.
 *
 * The dispatcher increments a per-function counter each tick and only calls the
 * underlying function once the counter reaches the configured tick interval, then
 * resets the counter to zero.
 *
 * Generated file: `data/<ns>/function/__throttle_<name>.mcfunction`
 *
 * @param name - Base name of the `@throttle`-decorated function.
 * @returns The internal dispatcher function name, e.g. `"__throttle_update"`.
 */
function throttleDispatcherName(name: string): string {
  return `__throttle_${name}`
}

/**
 * Returns the scoreboard objective used to store the tick counter for the
 * given `@throttle` function.
 *
 * Each throttled function gets its own objective `__throttle_<name>` to
 * avoid objective collisions when multiple functions are throttled.
 * The objective is created in `load.mcfunction`.
 *
 * @param name - Base name of the `@throttle`-decorated function.
 * @returns The per-function objective name, e.g. `"__throttle_update"`.
 */
function throttleObjective(name: string): string {
  return `__throttle_${name}`
}

/**
 * Returns the name of the tick-registered dispatcher function for a `@retry` function.
 *
 * The dispatcher checks the per-function retry counter each tick. While the counter
 * is positive it calls the function; the function signals success by writing a
 * non-zero value to `$ret`, which causes the dispatcher to reset the counter.
 * On failure (zero `$ret`) the counter is decremented until it reaches zero.
 *
 * Generated file: `data/<ns>/function/__retry_<name>.mcfunction`
 *
 * @param name - Base name of the `@retry`-decorated function.
 * @returns The internal dispatcher function name, e.g. `"__retry_fetchData"`.
 */
function retryDispatcherName(name: string): string {
  return `__retry_${name}`
}

/**
 * Returns the scoreboard objective used to store the remaining-attempts counter
 * for the given `@retry` function.
 *
 * Each retried function gets its own objective `__retry_<name>` to avoid
 * objective collisions when multiple functions use `@retry`.
 * The objective is created in `load.mcfunction`.
 *
 * @param name - Base name of the `@retry`-decorated function.
 * @returns The per-function objective name, e.g. `"__retry_fetchData"`.
 */
function retryObjective(name: string): string {
  return `__retry_${name}`
}

/**
 * Sanitises a function name for use in scoreboard fake-player names.
 *
 * Scoreboard player names in Minecraft may not contain characters outside
 * `[A-Za-z0-9_]`, so any other character (e.g. `/`, `.`, `-`, `::`) is
 * replaced with an underscore. This is applied to all profiler/benchmark
 * player names to avoid command syntax errors.
 *
 * @param name - Raw LIR function name, potentially containing special characters.
 * @returns A sanitised name safe for use in `scoreboard players` commands.
 */
function profilerSafeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_')
}

/**
 * Returns the fake-player name used to record the game-time at the start of a
 * profiled function call in the `__time` scoreboard objective.
 *
 * The start timestamp is captured with `time query gametime` and subtracted from
 * the end timestamp to compute the elapsed-tick delta for each invocation.
 *
 * Scoreboard slot: `#prof_start_<safeName>` in objective `__time`
 *
 * @param name - LIR function name (will be sanitised).
 * @returns Fake-player name such as `"#prof_start_Player__heal"`.
 */
function profilerStartPlayer(name: string): string {
  return `#prof_start_${profilerSafeName(name)}`
}

/**
 * Returns the fake-player name used to accumulate the per-call elapsed-tick
 * delta for a profiled function in the `__time` scoreboard objective.
 *
 * Computed as `end_time − start_time` and then added into the total accumulator
 * via `profilerTotalPlayer`.
 *
 * Scoreboard slot: `#prof_delta_<safeName>` in objective `__time`
 *
 * @param name - LIR function name (will be sanitised).
 * @returns Fake-player name such as `"#prof_delta_Player__heal"`.
 */
function profilerDeltaPlayer(name: string): string {
  return `#prof_delta_${profilerSafeName(name)}`
}

/**
 * Returns the fake-player name used to accumulate the total elapsed ticks across
 * all calls to a profiled function in the `__profile` scoreboard objective.
 *
 * Reset to zero by `__profiler_reset.mcfunction` and read by
 * `__profiler_report.mcfunction` to display aggregate timing.
 *
 * Scoreboard slot: `#prof_total_<safeName>` in objective `__profile`
 *
 * @param name - LIR function name (will be sanitised).
 * @returns Fake-player name such as `"#prof_total_Player__heal"`.
 */
function profilerTotalPlayer(name: string): string {
  return `#prof_total_${profilerSafeName(name)}`
}

/**
 * Returns the fake-player name used to count the number of times a profiled
 * function has been called, stored in the `__profile` scoreboard objective.
 *
 * Used alongside `profilerTotalPlayer` to compute average ticks-per-call when
 * the profiler report is displayed.
 *
 * Scoreboard slot: `#prof_count_<safeName>` in objective `__profile`
 *
 * @param name - LIR function name (will be sanitised).
 * @returns Fake-player name such as `"#prof_count_Player__heal"`.
 */
function profilerCountPlayer(name: string): string {
  return `#prof_count_${profilerSafeName(name)}`
}

/**
 * Returns the name of the internal wrapper function generated for a `@benchmark`
 * function.
 *
 * The wrapper measures wall-clock ticks around a single call to the implementation
 * (`<name>_impl`) and reports the result via `tellraw`. It is distinct from the
 * persistent `@profile` accumulator — benchmarks measure one call at a time.
 *
 * Generated file: `data/<ns>/function/__bench_<name>.mcfunction`
 *
 * @param name - Base name of the `@benchmark`-decorated function.
 * @returns The wrapper function name, e.g. `"__bench_heavyCalc"`.
 */
function benchmarkWrapperName(name: string): string {
  return `__bench_${name}`
}

/**
 * Returns the fake-player name used to record the game-time at the start of a
 * single benchmark run in the `__bench` scoreboard objective.
 *
 * Analogous to `profilerStartPlayer` but for one-shot benchmark measurement
 * rather than persistent profiling accumulation.
 *
 * Scoreboard slot: `#bench_start_<safeName>` in objective `__bench`
 *
 * @param name - LIR function name (will be sanitised).
 * @returns Fake-player name such as `"#bench_start_heavyCalc"`.
 */
function benchmarkStartPlayer(name: string): string {
  return `#bench_start_${profilerSafeName(name)}`
}

/**
 * Returns the fake-player name used to store the elapsed-tick delta for a single
 * benchmark run in the `__bench` scoreboard objective.
 *
 * Computed as `end_time − start_time` and immediately reported via `tellraw`
 * without accumulation (unlike the persistent `__profile` objective).
 *
 * Scoreboard slot: `#bench_delta_<safeName>` in objective `__bench`
 *
 * @param name - LIR function name (will be sanitised).
 * @returns Fake-player name such as `"#bench_delta_heavyCalc"`.
 */
function benchmarkDeltaPlayer(name: string): string {
  return `#bench_delta_${profilerSafeName(name)}`
}

/**
 * Emits the scoreboard commands that capture a start timestamp at the beginning
 * of a profiled function body.
 *
 * The sequence:
 *   1. Resets the start-player slot to zero (guards against stale data).
 *   2. Stores the current `gametime` into the start-player slot via `execute store`.
 *
 * These lines are prepended to the function body by `emitFunction` when
 * `isProfiled` is true.
 *
 * @param name - LIR function name used to derive the scoreboard player name.
 * @returns Two or three `.mcfunction` command lines.
 */
function profilerStartLines(name: string): string[] {
  return [
    `# __profiler_start_${name}`,
    `scoreboard players set ${profilerStartPlayer(name)} __time 0`,
    `execute store result score ${profilerStartPlayer(name)} __time run time query gametime`,
  ]
}

/**
 * Emits the scoreboard commands that capture an end timestamp and accumulate
 * timing data at the end of a profiled function body.
 *
 * The sequence:
 *   1. Resets the delta-player slot to zero.
 *   2. Stores the current `gametime` into the delta slot.
 *   3. Subtracts the start timestamp from the delta slot → elapsed ticks.
 *   4. Adds the delta into the total accumulator (`__profile` objective).
 *   5. Increments the call counter by 1.
 *
 * These lines are appended to the function body by `emitFunction` when
 * `isProfiled` is true.
 *
 * @param name - LIR function name used to derive all scoreboard player names.
 * @returns Five or six `.mcfunction` command lines.
 */
function profilerEndLines(name: string): string[] {
  return [
    `# __profiler_end_${name}`,
    `scoreboard players set ${profilerDeltaPlayer(name)} __time 0`,
    `execute store result score ${profilerDeltaPlayer(name)} __time run time query gametime`,
    `scoreboard players operation ${profilerDeltaPlayer(name)} __time -= ${profilerStartPlayer(name)} __time`,
    `scoreboard players operation ${profilerTotalPlayer(name)} __profile += ${profilerDeltaPlayer(name)} __time`,
    `scoreboard players add ${profilerCountPlayer(name)} __profile 1`,
  ]
}

/**
 * Emits the body of `__profiler_reset.mcfunction`, which zeroes the total and
 * count accumulators for every profiled function.
 *
 * Intended to be called manually (e.g. via a command block) to start a fresh
 * profiling session. Generates two `scoreboard players set … 0` commands per
 * function.
 *
 * @param profiledFns - Names of all `@profile`-decorated functions in the module.
 * @returns A flat list of `.mcfunction` command lines.
 */
function emitProfilerReset(profiledFns: string[]): string[] {
  return profiledFns.flatMap(name => [
    `scoreboard players set ${profilerTotalPlayer(name)} __profile 0`,
    `scoreboard players set ${profilerCountPlayer(name)} __profile 0`,
  ])
}

/**
 * Emits the body of `__profiler_report.mcfunction`, which broadcasts accumulated
 * timing data for every profiled function to all players via `tellraw`.
 *
 * Each line reports the function name, total accumulated ticks, and call count
 * using the `__profile` scoreboard objective. Divide total by count to get the
 * average ticks-per-call.
 *
 * @param profiledFns - Names of all `@profile`-decorated functions in the module.
 * @returns One `tellraw` command line per profiled function.
 */
function emitProfilerReport(profiledFns: string[]): string[] {
  return profiledFns.map(name => (
    `tellraw @a [{"text":"[profile] ${name}: total="},{"score":{"name":"${profilerTotalPlayer(name)}","objective":"__profile"}},{"text":" ticks count="},{"score":{"name":"${profilerCountPlayer(name)}","objective":"__profile"}}]`
  ))
}

// ---------------------------------------------------------------------------
// Instruction emission
// ---------------------------------------------------------------------------

/**
 * Emit a single LIR instruction as a raw MC command string.
 *
 * This is the core dispatch table for the emitter: each `LIRInstr` variant maps
 * to one (or occasionally two, for version-gated variants) MC command strings.
 * The returned string is passed to {@link flattenExecute} before being written.
 *
 * @param instr - The LIR instruction to emit.
 * @param ns - Datapack namespace used for function references.
 * @param obj - Scoreboard objective for temporary score slots.
 * @param mcVersion - Target MC version; gates macro and other version-specific syntax.
 * @returns A single raw MC command (no trailing newline).
 */
function emitInstr(instr: LIRInstr, ns: string, obj: string, mcVersion: McVersion): string {
  switch (instr.kind) {
    case 'score_set':
      return `scoreboard players set ${slot(instr.dst)} ${instr.value}`

    case 'score_copy':
      return `scoreboard players operation ${slot(instr.dst)} = ${slot(instr.src)}`

    case 'score_add':
      return `scoreboard players operation ${slot(instr.dst)} += ${slot(instr.src)}`

    case 'score_sub':
      return `scoreboard players operation ${slot(instr.dst)} -= ${slot(instr.src)}`

    case 'score_mul':
      return `scoreboard players operation ${slot(instr.dst)} *= ${slot(instr.src)}`

    case 'score_div':
      return `scoreboard players operation ${slot(instr.dst)} /= ${slot(instr.src)}`

    case 'score_mod':
      return `scoreboard players operation ${slot(instr.dst)} %= ${slot(instr.src)}`

    case 'score_min':
      return `scoreboard players operation ${slot(instr.dst)} < ${slot(instr.src)}`

    case 'score_max':
      return `scoreboard players operation ${slot(instr.dst)} > ${slot(instr.src)}`

    case 'score_swap':
      return `scoreboard players operation ${slot(instr.a)} >< ${slot(instr.b)}`

    case 'store_cmd_to_score':
      return `execute store result score ${slot(instr.dst)} run ${emitInstr(instr.cmd, ns, obj, mcVersion)}`

    case 'store_score_to_nbt':
      return `execute store result storage ${instr.ns} ${instr.path} ${instr.type} ${instr.scale} run scoreboard players get ${slot(instr.src)}`

    case 'store_nbt_to_score':
      return `execute store result score ${slot(instr.dst)} run data get storage ${instr.ns} ${instr.path} ${Number.isInteger(instr.scale) ? instr.scale.toFixed(1) : instr.scale}`

    case 'nbt_set_literal':
      return `data modify storage ${instr.ns} ${instr.path} set value ${instr.value}`

    case 'nbt_copy':
      return `data modify storage ${instr.dstNs} ${instr.dstPath} set from storage ${instr.srcNs} ${instr.srcPath}`

    case 'call':
      return `function ${instr.fn}`

    case 'call_macro':
      if (mcVersion >= McVersion.v1_20_2) {
        return `function ${instr.fn} with storage ${instr.storage}`
      }
      // Pre-1.20.2: macros not supported; call function directly (args in storage are ignored)
      return `function ${instr.fn}`

    case 'call_if_matches':
      return `execute if score ${slot(instr.slot)} matches ${instr.range} run function ${instr.fn}`

    case 'call_unless_matches':
      return `execute unless score ${slot(instr.slot)} matches ${instr.range} run function ${instr.fn}`

    case 'call_if_score':
      return `execute ${scoreCondition('if', instr.op, slot(instr.a), slot(instr.b))} run function ${instr.fn}`

    case 'call_unless_score':
      return `execute ${scoreCondition('unless', instr.op, slot(instr.a), slot(instr.b))} run function ${instr.fn}`

    case 'call_context': {
      const subcmds = instr.subcommands.map(emitSubcmd).join(' ')
      return subcmds
        ? `execute ${subcmds} run function ${instr.fn}`
        : `function ${instr.fn}`
    }

    case 'return_value':
      return `scoreboard players operation $ret ${instr.slot.obj} = ${slot(instr.slot)}`

    case 'macro_line':
      if (mcVersion >= McVersion.v1_20_2) {
        return `$${instr.template}`
      }
      // Pre-1.20.2: function macros not available. Emit as a plain command with
      // $(param) placeholders replaced by storage reads via data get (best-effort
      // compat for string/id params; numeric coords will not be dynamic).
      return macroLineCompat(instr.template)

    case 'raw':
      return instr.cmd
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render a {@link Slot} as the `<player> <objective>` pair used by scoreboard commands.
 *
 * @param s - The slot to render.
 * @returns String of the form `"<player> <objective>"`.
 */
function slot(s: Slot): string {
  return `${s.player} ${s.obj}`
}

/**
 * Map a {@link CmpOp} to its MC `scoreboard players operation` operator token.
 *
 * Note: `ne` maps to `=` because the "not-equal" sense is expressed by the
 * surrounding `unless score` subcommand, not by the operator itself.
 *
 * @param op - Abstract comparison operator from LIR.
 * @returns MC operator string (`"="`, `"<"`, `"<="`, `">"`, or `">="`).
 */
function cmpToMC(op: CmpOp): string {
  switch (op) {
    case 'eq': return '='
    case 'ne': return '='  // ne is expressed via "unless score ... =" rather than a distinct operator
    case 'lt': return '<'
    case 'le': return '<='
    case 'gt': return '>'
    case 'ge': return '>='
  }
}

/**
 * Emit a score condition fragment, e.g. "if score $a obj = $b obj".
 *
 * MC has no "!=" operator; not-equal is expressed by flipping the if/unless
 * keyword and using "=" as the operator:
 *   a != b  →  unless score a = b   (not: if score a = b)
 *   a == b  →  if score a = b
 *
 * The `sense` parameter is the caller's intended polarity ('if' or 'unless').
 * For 'ne', both the sense and operator are adjusted automatically.
 */
function scoreCondition(sense: 'if' | 'unless', op: CmpOp, a: string, b: string): string {
  if (op === 'ne') {
    const flipped = sense === 'if' ? 'unless' : 'if'
    return `${flipped} score ${a} = ${b}`
  }
  return `${sense} score ${a} ${cmpToMC(op)} ${b}`
}

/**
 * Pre-1.20.2 compat: emit a macro template as a plain command.
 * $(param) placeholders are replaced with `storage rs:macro_args <param>` data-get
 * expressions for string/id values, or left as literal "0" for coordinates.
 * This is best-effort — dynamic numeric positions cannot be truly emulated.
 */
function macroLineCompat(template: string): string {
  // Replace $(param) with data-get-style substitution marker
  return template.replace(/\$\((\w+)\)/g, (_m, p) => `{storage:rs:macro_args,path:${p}}`)
}

// ---------------------------------------------------------------------------
// Execute Chain Optimization
// ---------------------------------------------------------------------------

/**
 * Flatten nested execute-if chains into a single execute with multiple conditions.
 *
 * MC allows chaining conditions:
 *   execute if A run execute if B run X
 * can be written as:
 *   execute if A if B run X
 *
 * This reduces command-parsing overhead and improves TPS.
 *
 * Rules:
 * - Only merges when the inner `run` clause is itself `execute if ...`
 * - Does NOT merge `if ... run execute unless ...` — semantics differ
 *   (unless negates, changing behavior in chain context)
 * - Recursively flattens deeper nesting (3+ levels)
 */
export function flattenExecute(cmd: string): string {
  // Match: execute <conditions> run execute if <rest>
  // We only flatten when the inner execute starts with "if" (not "unless", "as", "at", etc.)
  // Pattern: "execute <prefix> run execute if <suffix>"
  const RUN_EXECUTE_IF = / run execute if /
  if (!RUN_EXECUTE_IF.test(cmd)) {
    return cmd
  }

  // Find the " run execute if " boundary
  const idx = cmd.indexOf(' run execute if ')
  if (idx === -1) return cmd

  const outer = cmd.slice(0, idx)           // "execute if A"
  const inner = cmd.slice(idx + ' run '.length) // "execute if B run X"

  // The outer must start with "execute"
  if (!outer.startsWith('execute ')) return cmd

  // Inner starts with "execute if ..."
  // Strip the "execute" prefix from inner to get the conditions + run tail
  // Result: outer + " " + inner_conditions_and_tail
  const innerWithoutExecute = inner.slice('execute '.length) // "if B run X"

  const merged = `${outer} ${innerWithoutExecute}`

  // Recurse to handle 3+ levels
  return flattenExecute(merged)
}

/**
 * Render a single {@link ExecuteSubcmd} as the MC subcommand fragment it represents.
 *
 * The returned string is joined with spaces and prefixed with `execute` by
 * the `call_context` branch of {@link emitInstr}.
 *
 * @param sub - The execute subcommand variant to render.
 * @returns Fragment string, e.g. `"as @e[type=zombie]"` or `"if score $x obj = $y obj"`.
 */
function emitSubcmd(sub: ExecuteSubcmd): string {
  switch (sub.kind) {
    case 'as':
      return `as ${sub.selector}`
    case 'at':
      return `at ${sub.selector}`
    case 'at_self':
      return 'at @s'
    case 'positioned':
      return `positioned ${sub.x} ${sub.y} ${sub.z}`
    case 'rotated':
      return `rotated ${sub.yaw} ${sub.pitch}`
    case 'in':
      return `in ${sub.dimension}`
    case 'anchored':
      return `anchored ${sub.anchor}`
    case 'if_score':
      return scoreCondition('if', sub.op, sub.a, sub.b)
    case 'unless_score':
      return scoreCondition('unless', sub.op, sub.a, sub.b)
    case 'if_matches':
      return `if score ${sub.score} matches ${sub.range}`
    case 'unless_matches':
      return `unless score ${sub.score} matches ${sub.range}`
  }
}
