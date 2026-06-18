import type { FnDecl, TypeNode } from '../ast/types'
import { getEventParamSpecs, isEventTypeName } from '../events/types'

export interface FunctionDecoratorValidationContext {
  report(message: string, node?: unknown): void
  normalizeType(type: TypeNode): TypeNode
  typesMatch(expected: TypeNode, actual: TypeNode): boolean
  typeToString(type: TypeNode): string
}

function hasDecoratorArguments(decorator: FnDecl['decorators'][number]): boolean {
  return !!(decorator.rawArgs?.length || decorator.args && Object.keys(decorator.args).length > 0)
}

export function validateFunctionDecorators(
  fn: FnDecl,
  context: FunctionDecoratorValidationContext,
): void {
  const { report, normalizeType, typesMatch, typeToString } = context

  const watchDecorators = fn.decorators.filter(decorator => decorator.name === 'watch')
  if (watchDecorators.length > 1) {
    report(`Function '${fn.name}' cannot have multiple @watch decorators`, fn)
    return
  }

  if (watchDecorators.length === 1) {
    const objective = watchDecorators[0].args?.objective
    if (!objective) {
      report(`Function '${fn.name}' is missing a scoreboard objective in @watch("...")`, fn)
      return
    }

    if (fn.params.length > 0) {
      report(`@watch handler '${fn.name}' cannot declare parameters`, fn)
    }
  }

  const throttleDecorators = fn.decorators.filter(decorator => decorator.name === 'throttle')
  if (throttleDecorators.length > 1) {
    report(`Function '${fn.name}' cannot have multiple @throttle decorators`, fn)
    return
  }
  if (throttleDecorators.length === 1) {
    const ticks = throttleDecorators[0].args?.ticks
    if (ticks === undefined || ticks <= 0) {
      report(`@throttle on '${fn.name}' requires ticks=N (positive integer)`, fn)
    }
  }

  const retryDecorators = fn.decorators.filter(decorator => decorator.name === 'retry')
  if (retryDecorators.length > 1) {
    report(`Function '${fn.name}' cannot have multiple @retry decorators`, fn)
    return
  }
  if (retryDecorators.length === 1) {
    const max = retryDecorators[0].args?.max
    if (max === undefined || max <= 0) {
      report(`@retry on '${fn.name}' requires max=N (positive integer)`, fn)
    }
  }

  const profileDecorators = fn.decorators.filter(decorator => decorator.name === 'profile')
  if (profileDecorators.length > 1) {
    report(`Function '${fn.name}' cannot have multiple @profile decorators`, fn)
    return
  }

  if (profileDecorators.length === 1 && hasDecoratorArguments(profileDecorators[0])) {
    report(`@profile decorator on '${fn.name}' does not accept arguments`, fn)
    return
  }

  const benchmarkDecorators = fn.decorators.filter(decorator => decorator.name === 'benchmark')
  if (benchmarkDecorators.length > 1) {
    report(`Function '${fn.name}' cannot have multiple @benchmark decorators`, fn)
    return
  }

  if (benchmarkDecorators.length === 1 && hasDecoratorArguments(benchmarkDecorators[0])) {
    report(`@benchmark decorator on '${fn.name}' does not accept arguments`, fn)
    return
  }

  const memoizeDecorators = fn.decorators.filter(decorator => decorator.name === 'memoize')
  if (memoizeDecorators.length > 1) {
    report(`Function '${fn.name}' cannot have multiple @memoize decorators`, fn)
    return
  }
  if (memoizeDecorators.length === 1) {
    if (fn.params.length !== 1) {
      report(`@memoize on '${fn.name}' requires exactly one parameter`, fn)
    } else {
      const paramType = fn.params[0].type
      const isInt = paramType.kind === 'named' && paramType.name === 'int'
      if (!isInt) {
        report(`@memoize on '${fn.name}' only supports int parameters (got '${paramType.kind === 'named' ? paramType.name : paramType.kind}')`, fn)
      }
    }
  }

  const eventDecorators = fn.decorators.filter(decorator => decorator.name === 'on')
  if (eventDecorators.length === 0) {
    return
  }

  if (eventDecorators.length > 1) {
    report(`Function '${fn.name}' cannot have multiple @on decorators`, fn)
    return
  }

  const eventType = eventDecorators[0].args?.eventType
  if (!eventType) {
    report(`Function '${fn.name}' is missing an event type in @on(...)`, fn)
    return
  }

  if (!isEventTypeName(eventType)) {
    report(`Unknown event type '${eventType}'`, fn)
    return
  }

  const expectedParams = getEventParamSpecs(eventType)
  // Runtime-dispatched event handlers are invoked via Minecraft function tags,
  // which cannot pass real arguments. Prefer zero-parameter handlers that use
  // @s as the execution context, but keep the legacy single Player parameter
  // form for compatibility.
  if (fn.params.length !== 0 && fn.params.length !== expectedParams.length) {
    report(
      `Event handler '${fn.name}' for ${eventType} must declare either 0 parameter(s) or ${expectedParams.length} parameter(s), got ${fn.params.length}`,
      fn,
    )
    return
  }

  for (let i = 0; i < fn.params.length; i++) {
    const actual = normalizeType(fn.params[i].type)
    const expected = normalizeType(expectedParams[i].type)
    if (!typesMatch(expected, actual)) {
      report(
        `Event handler '${fn.name}' parameter ${i + 1} must be ${typeToString(expected)}, got ${typeToString(actual)}`,
        fn.params[i],
      )
    }
  }
}
