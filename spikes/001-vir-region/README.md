# 001: Isolated VIR regions

## Question

Can the existing VIR experiment improve a real arithmetic helper without
replacing RedScript's compiler or miscounting its calling-convention boundary?

This uses the current source cooldown/scoring fixture, the production frontend
and MIR optimizer, and the existing MIR→VIR→LIR APIs. Both results receive the
same production LIR cleanup and emitter. No performance benchmark runs.

```sh
node -r ts-node/register/transpile-only spikes/001-vir-region/main.ts
```

## Observations (2026-11-01)

- The whole optimized fixture is rejected on `cooldown_cost_chain`'s ordinary
  `call`. Calls and game-state operations are not a supported general VIR path.
- An isolated `scale_cost(value, factor, offset)` helper is supported. The current
  production helper emits 8 commands. Planned VIR lowering emits 4 internally,
  but needs 3 `$pN`→`$vN` parameter copies: **8 → 7**, not 8 → 4.
- The already-specialized identity helper emits 2 production commands. VIR emits
  1 internally and needs 1 parameter copy: **2 → 2**.
- Before adding the adapter, comparison produced a counterexample (return value
  13 versus 0). That was an ABI mismatch, not evidence that the allocation
  algorithm miscompiled the arithmetic. The runnable spike now includes those
  copies and counts them.
- Both adapted regions match `$ret` on three initialized, small, non-overflow
  arithmetic inputs, including negative values. The allocation checker also runs.
  The existing bounded interpreter is not a complete scoreboard model. This is
  not a proof for division, overflow, missing scores, side effects or recursion.

## Verdict: PARTIAL

There is a small local allocation opportunity, but no evidence for a new default
pipeline. Once boundary costs are included, these examples save one command or
none. The whole real module still requires the current Minecraft-aware path.

Keep VIR experimental. First investigate whether the useful slot-reuse rule can
be brought into existing LIR under its current proof/ABI boundaries. A future
region integration needs explicit inputs/outputs, preserved ABI slots, effect
barriers, source mapping, conservative fallback and real Paper qualification.
Do not maintain a second frontend or claim these two examples establish a
whole-game benefit.
