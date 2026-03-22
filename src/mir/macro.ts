/**
 * Macro function detection — pre-scans HIR to find parameters used in
 * builtin call positions (coordinates, entity types, etc.)
 *
 * A function becomes a "macro function" when one of its params appears
 * in a position that requires literal substitution in the MC command
 * (e.g. summon coords, particle coords, setblock coords, local/relative
 * coords like ^px or ~height).
 */

import type { HIRModule, HIRExpr, HIRStmt, HIRBlock } from '../hir/types'

// ---------------------------------------------------------------------------
// Known builtins that emit MC commands with inline arguments
// ---------------------------------------------------------------------------

/** Builtins whose arguments appear literally in MC commands */
export const BUILTIN_SET = new Set([
  'say', 'tell', 'tellraw', 'title', 'actionbar', 'subtitle', 'title_times',
  'announce', 'give', 'kill', 'effect', 'effect_clear',
  'summon', 'particle', 'playsound', 'clear', 'weather',
  'time_set', 'time_add', 'gamerule', 'tag_add', 'tag_remove',
  'kick', 'setblock', 'fill', 'clone', 'difficulty', 'xp_add', 'xp_set',
  // Entity movement / teleport
  'tp', 'tp_to',
  // Scoreboard management
  'scoreboard_add_objective', 'scoreboard_remove_objective',
  'scoreboard_display', 'scoreboard_hide',
  // Team management
  'team_add', 'team_remove', 'team_join', 'team_leave', 'team_option',
  // Bossbar management
  'bossbar_add', 'bossbar_remove', 'bossbar_set_value', 'bossbar_get_value',
  'bossbar_set_max', 'bossbar_set_color', 'bossbar_set_style',
  'bossbar_set_visible', 'bossbar_set_players',
  // Data / NBT
  'data_get', 'data_merge',
])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MacroFunctionInfo {
  macroParams: Set<string>
  /** param name → param type name (for NBT scale inference) */
  paramTypes: Map<string, string>
}

/**
 * Pre-scan HIR functions to detect which params need macro treatment.
 * Returns a map: function name → MacroFunctionInfo.
 */
export function detectMacroFunctions(hir: HIRModule): Map<string, MacroFunctionInfo> {
  const result = new Map<string, MacroFunctionInfo>()

  for (const fn of hir.functions) {
    const paramNames = new Set(fn.params.map(p => p.name))
    const macroParams = new Set<string>()
    scanBlock(fn.body, paramNames, macroParams)
    if (macroParams.size > 0) {
      const paramTypes = new Map<string, string>()
      for (const p of fn.params) {
        let typeName: string
        if (p.type?.kind === 'named') {
          typeName = (p.type as any).name
        } else if (p.type?.kind === 'selector' || p.type?.kind === 'entity') {
          typeName = 'selector'
        } else {
          typeName = 'int'
        }
        paramTypes.set(p.name, typeName)
      }
      result.set(fn.name, { macroParams, paramTypes })
    }
  }

  for (const ib of hir.implBlocks) {
    for (const m of ib.methods) {
      const paramNames = new Set(m.params.map(p => p.name))
      const macroParams = new Set<string>()
      scanBlock(m.body, paramNames, macroParams)
      if (macroParams.size > 0) {
        const paramTypes = new Map<string, string>()
        for (const p of m.params) {
          let typeName: string
          if (p.type?.kind === 'named') {
            typeName = (p.type as any).name
          } else if (p.type?.kind === 'selector' || p.type?.kind === 'entity') {
            typeName = 'selector'
          } else {
            typeName = 'int'
          }
          paramTypes.set(p.name, typeName)
        }
        result.set(`${ib.typeName}::${m.name}`, { macroParams, paramTypes })
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// HIR scanning
// ---------------------------------------------------------------------------

function scanBlock(stmts: HIRBlock, paramNames: Set<string>, macroParams: Set<string>): void {
  for (const stmt of stmts) scanStmt(stmt, paramNames, macroParams)
}

function scanStmt(stmt: HIRStmt, paramNames: Set<string>, macroParams: Set<string>): void {
  switch (stmt.kind) {
    case 'expr': scanExpr(stmt.expr, paramNames, macroParams); break
    case 'let': scanExpr(stmt.init, paramNames, macroParams); break
    case 'return': if (stmt.value) scanExpr(stmt.value, paramNames, macroParams); break
    case 'if':
      scanExpr(stmt.cond, paramNames, macroParams)
      scanBlock(stmt.then, paramNames, macroParams)
      if (stmt.else_) scanBlock(stmt.else_, paramNames, macroParams)
      break
    case 'while':
      scanExpr(stmt.cond, paramNames, macroParams)
      scanBlock(stmt.body, paramNames, macroParams)
      if (stmt.step) scanBlock(stmt.step, paramNames, macroParams)
      break
    case 'foreach': scanBlock(stmt.body, paramNames, macroParams); break
    case 'match':
      scanExpr(stmt.expr, paramNames, macroParams)
      for (const arm of stmt.arms) scanBlock(arm.body, paramNames, macroParams)
      break
    case 'execute': scanBlock(stmt.body, paramNames, macroParams); break
    case 'labeled_loop': scanStmt(stmt.body, paramNames, macroParams); break
    case 'raw': break
  }
}

function scanExpr(expr: HIRExpr, paramNames: Set<string>, macroParams: Set<string>): void {
  if (expr.kind === 'call' && BUILTIN_SET.has(expr.fn)) {
    // Check if any argument is a param identifier or a coord with a param variable
    for (const arg of expr.args) {
      checkMacroArg(arg, paramNames, macroParams)
    }
    // Recurse into args for nested expressions
    for (const arg of expr.args) scanExpr(arg, paramNames, macroParams)
    return
  }

  // Recurse into sub-expressions
  switch (expr.kind) {
    case 'call':
      for (const arg of expr.args) scanExpr(arg, paramNames, macroParams)
      break
    case 'invoke':
      scanExpr(expr.callee, paramNames, macroParams)
      for (const arg of expr.args) scanExpr(arg, paramNames, macroParams)
      break
    case 'binary':
      scanExpr(expr.left, paramNames, macroParams)
      scanExpr(expr.right, paramNames, macroParams)
      break
    case 'unary':
      scanExpr(expr.operand, paramNames, macroParams)
      break
    case 'assign':
      scanExpr(expr.value, paramNames, macroParams)
      break
    case 'member_assign':
      scanExpr(expr.obj, paramNames, macroParams)
      scanExpr(expr.value, paramNames, macroParams)
      break
    case 'index_assign':
      scanExpr(expr.obj, paramNames, macroParams)
      scanExpr(expr.index, paramNames, macroParams)
      scanExpr(expr.value, paramNames, macroParams)
      break
    case 'member':
      scanExpr(expr.obj, paramNames, macroParams)
      break
    case 'index':
      scanExpr(expr.obj, paramNames, macroParams)
      scanExpr(expr.index, paramNames, macroParams)
      break
    case 'static_call':
      for (const arg of expr.args) scanExpr(arg, paramNames, macroParams)
      break
  }
}

/** Check if a single argument expression references a function parameter in a macro position */
function checkMacroArg(expr: HIRExpr, paramNames: Set<string>, macroParams: Set<string>): void {
  if (expr.kind === 'ident' && paramNames.has(expr.name)) {
    macroParams.add(expr.name)
  } else if (expr.kind === 'local_coord' || expr.kind === 'rel_coord') {
    // ^varname or ~varname — extract the variable part
    const rest = expr.value.slice(1)
    if (rest && /^[a-zA-Z_]\w*$/.test(rest) && paramNames.has(rest)) {
      macroParams.add(rest)
    }
  }
}
