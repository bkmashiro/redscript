# 4.0 numeric and cooldown migration

This guide covers 4.0 changes relative to npm 3.0.4. Fresh build and installed
consumer checks passed. See ROADMAP.md for publication state.

## Integer division and remainder follow Minecraft

Scoreboard integers use signed i32 wrapping and native floor division/remainder:

- `-7 / 3 == -3`, `-7 % 3 == 2`.
- `7 / -3 == -3`, `7 % -3 == -2`.
- Constants and dynamic expressions follow the same rules.

The remainder has the divisor's sign, or is zero. Divisors must be nonzero.
Constant folding leaves division by zero to the runtime, while bounded test
interpreters decline unsupported zero-divisor proofs.

For code that specifically needs toward-zero arithmetic, opt in explicitly:

```rs
import math;
fn old_rounding(): int {
    return div_trunc(-7, 3); // -2; mod_trunc(-7, 3) is -1
}
```

The helpers cost extra commands. Do not replace every native division unless
the algorithm needs that rounding contract. Old compiler folds could disagree
with native execution. Check algorithms that compensated for truncation manually.

## `@throttle` is retired

The old decorator registered a tick dispatcher but did not limit direct calls as
documented. 4.0 rejects it with migration guidance, including in lenient compile
mode. The parser still recognizes old syntax so diagnostics/editors can explain
it. Explicit low-level emitter metadata remains a deprecated 3.x compatibility
surface, not a supported source-language decorator.

Use `@tick(rate=N)` for periodic registration. N is a positive integer literal
up to 2147483647 (the i32 counter maximum). The first callback is after N
simulation ticks from load, and reload resets phase. Bare tick and rate 1 use
the direct hook. Ordinary calls to the function are not limited:

```rs
@tick(rate=20)
fn once_per_second() { say("tick"); }
```

Use caller-owned deadlines for call suppression. These are separate behaviors.

## Cooldown state belongs to the caller

The old `cooldown_start("name", ticks)` ignored `name` and used one global slot.
The new API has real state ownership and does not schedule work:

```rs
import cooldown;
fn start_dash(now: int): int {
    return cooldown_start(now, 40);
}
fn can_dash(ready_at: int, now: int): bool {
    return cooldown_ready(ready_at, now);
}
```

Persist the returned integer in a variable, storage field or per-player score.
Different abilities/entities use different caller-owned values. A zero deadline
is ready. `cooldown_remaining(ready_at, now)` clamps at zero. Non-positive durations
are immediately ready, and deadline addition saturates at the signed-i32 maximum.
Use one non-negative monotonic clock epoch and reset deadlines if it resets/wraps.
See [the cooldown reference](stdlib/cooldown.md).

Remove `cooldown_tick` calls. Legacy single-source compilation permits undeclared
external function calls, so successful compilation alone does not establish that
an old stdlib symbol still exists. The shipped cooldown API no longer defines it.

## Removed legacy contracts

`@on(ItemUse)` and `@on(BlockBreak)` are no longer accepted as general native
events. Use item/block-specific scoreboard or advancement assets and explicit
`@function_tag` handlers. `PlayerJoin`, `PlayerDeath` and `EntityKill` remain the
registered static events; registration does not imply a universal vanilla event
bus.

The unsupported `strings` module and `str_len`, `str_concat`, `str_contains`,
`str_slice` helpers were removed. Use supported f-strings/text components for
rendering. There is no advertised drop-in general runtime string API replacing
those helpers.

Project builds now have explicit package identities, targets, dependency locks
and declaration surfaces. Watch, test and LSP project-awareness have not all
migrated to that resolver. Cross-package public struct/enum exports remain planned.
Do not infer those capabilities from a working project compile.

## Verification performed

The managed Paper 1.21.4 gate passes 58 checks with no skips: 11 native arithmetic
checks, 23 source scenarios under both conservative/effect-aware output, and a
controlled periodic-callback test for 3/5/7 ticks, direct calls, reload and namespace isolation.
Scenarios include literal/dynamic floor agreement, explicit trunc helpers,
negative divisors, overflow, repeated-call suppression, expiry, independent
cooldowns, duration saturation and negative-coordinate grid boundaries. The old
`tile_of` correction was removed because native division already floors. This is
not full Paper 26.2 or full-corpus
qualification. No performance benchmark was run.
