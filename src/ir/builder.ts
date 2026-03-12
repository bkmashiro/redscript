/**
 * IRBuilder — helper for constructing IR programmatically.
 * AST → IR lowering uses this.
 */

import type { IRBlock, IRFunction, IRInstr, IRModule, Operand, Terminator } from './types'

export class IRBuilder {
  private tempCount = 0
  private labelCount = 0
  private currentBlock: IRBlock | null = null
  private blocks: IRBlock[] = []
  private locals = new Set<string>()

  // -------------------------------------------------------------------------
  // Names
  // -------------------------------------------------------------------------

  freshTemp(): string {
    const name = `$t${this.tempCount++}`
    this.locals.add(name)
    return name
  }

  freshLabel(hint = 'L'): string {
    return `${hint}_${this.labelCount++}`
  }

  // -------------------------------------------------------------------------
  // Block management
  // -------------------------------------------------------------------------

  startBlock(label: string): void {
    this.currentBlock = { label, instrs: [], term: { op: 'return' } }
  }

  private get block(): IRBlock {
    if (!this.currentBlock) throw new Error('No active block')
    return this.currentBlock
  }

  private sealBlock(term: Terminator): void {
    this.block.term = term
    this.blocks.push(this.block)
    this.currentBlock = null
  }

  // -------------------------------------------------------------------------
  // Emit instructions
  // -------------------------------------------------------------------------

  emitAssign(dst: string, src: Operand): void {
    this.locals.add(dst)
    this.block.instrs.push({ op: 'assign', dst, src })
  }

  emitBinop(dst: string, lhs: Operand, bop: IRInstr & { op: 'binop' } extends { bop: infer B } ? B : never, rhs: Operand): void
  emitBinop(dst: string, lhs: Operand, bop: '+' | '-' | '*' | '/' | '%', rhs: Operand): void {
    this.locals.add(dst)
    this.block.instrs.push({ op: 'binop', dst, lhs, bop, rhs })
  }

  emitCmp(dst: string, lhs: Operand, cop: '==' | '!=' | '<' | '<=' | '>' | '>=', rhs: Operand): void {
    this.locals.add(dst)
    this.block.instrs.push({ op: 'cmp', dst, lhs, cop, rhs })
  }

  emitCall(fn: string, args: Operand[], dst?: string): void {
    if (dst) this.locals.add(dst)
    this.block.instrs.push({ op: 'call', fn, args, dst })
  }

  emitRaw(cmd: string): void {
    this.block.instrs.push({ op: 'raw', cmd })
  }

  // -------------------------------------------------------------------------
  // Terminators
  // -------------------------------------------------------------------------

  emitJump(target: string): void {
    this.sealBlock({ op: 'jump', target })
  }

  emitJumpIf(cond: string, then: string, else_: string): void {
    this.sealBlock({ op: 'jump_if', cond, then, else_ })
  }

  emitReturn(value?: Operand): void {
    this.sealBlock({ op: 'return', value })
  }

  emitTickYield(continuation: string): void {
    this.sealBlock({ op: 'tick_yield', continuation })
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  build(name: string, params: string[], isTickLoop = false): IRFunction {
    return {
      name,
      params,
      locals: Array.from(this.locals),
      blocks: this.blocks,
      isTickLoop,
    }
  }
}

import type { GlobalVar } from './types'

export function buildModule(namespace: string, fns: IRFunction[], globals: GlobalVar[] = []): IRModule {
  return { namespace, functions: fns, globals }
}
