# External Scoreboard Objective ABI Decision

## Problem

RedScript lowers many `$`-prefixed players/slots as compiler-owned scoreboard temps (`$ret`, `$ret_*`, `$pN`, `$__const_*`, and current-function temporaries). Before the verifier ownership-policy fix, external/vanilla objective usage could look like unsupported compiler-owned usage, so the compiler rejected templates/examples that intentionally used user fake players and `$(player)` macro slots.

## Decision

- Support explicit external scoreboard objective interop for non-compiler-owned slots while keeping a conservative ownership policy.
- Treat the following as compiler-owned and therefore invalid on external objectives:
  - `$ret`, `$ret_*`
  - `$pN` (function params/results lowered through temp slots)
  - `$__const_*`
  - current-function temporary slots such as `$<fn>_*` created by lowering
- Allow `$`-prefixed fake players that are not compiler-owned on external objectives, including:
  - macro substitution `$(player)` slots
  - user display fake players such as `$wave`, `$zombies`, etc.
- Do not broaden this into a full raw-scoreboard ABI type system; keep it as a minimal ownership-policy boundary in `src/lir/verify.ts`.

## Examples

Allowed external scoreboard interop:

```mcfunction
scoreboard players add $(player) combat 1
scoreboard players set $wave zs_display 2
```

Rejected on external objectives:

```mcfunction
scoreboard players set $ret combat 5
scoreboard players add $ret_hp combat 1
scoreboard players operation $p0 combat += $p1 combat
```

## Non-goals

- Broad external-scoreboard ABI redesign or global raw parser work.
- Language-surface expansions for scoreboard interop beyond the current objective-slot ownership line.
- Default optimizer policy changes.

## Evidence and references

- Verifier behavior and ownership checks:
  - `src/__tests__/lir/verify.test.ts`
- Manifest/coverage discipline after the fixes:
  - `src/__tests__/compile-all-skip-manifest.test.ts`
  - `src/__tests__/coverage-matrix.test.ts`
- Direct CLI compile probes that must stay green:
  - `src/templates/combat.mcrs`
  - `src/templates/economy.mcrs`
  - `src/templates/quest.mcrs`
  - `src/examples/parkour_race.mcrs`
  - `src/examples/zombie_survival.mcrs`
