export const VIR_UNSUPPORTED_REASON_TAGS = [
  'unsupported-mir-op-kind',
  'unsupported-operand-shape',
  'unsupported-control-flow-shape',
  'unsupported-call-boundary',
  'allocation-check-failure',
  'planned-lowering-unsupported',
  'direct-lowering-unsupported',
  'direct-higher-cost',
  'unsupported-both-modes',
  'unsupported-unknown',
] as const

export type VirUnsupportedReasonTag = (typeof VIR_UNSUPPORTED_REASON_TAGS)[number]
