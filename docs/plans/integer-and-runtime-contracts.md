# Integer and runtime contracts for 4.0

Status: the owner approved native floor arithmetic and retirement of `@throttle`.
Both source contracts are implemented. The 4.0.0 release passed fresh SDK build,
full non-performance unit/CLI corpus and real installed-consumer qualification.
Published on npm/GitHub with aligned docs. See [ROADMAP.md](../../ROADMAP.md) for the release record.

## Integer division and remainder

Paper 1.21.4 build 232 confirmed native scoreboard behavior:

- `-7 / 3 → -3`, `-7 % 3 → 2`.
- `7 / -3 → -3`, `7 % -3 → -2`.
- `-7 / -3 → 2`, `-7 % -3 → -1`.
- Signed i32 operations wrap, including `2147483647 * 2147483647 → 1` and
  `-2147483648 / -1 → -2147483648`.

MIR/VIR folding, the LIR test interpreters and tuning division now share floor
semantics. The bounded equivalence checker declines uninitialized score reads
and observations instead of treating absence as zero. Division by zero remains
outside its supported proof subset. Explicit `div_trunc` / `mod_trunc` helpers in
`math` provide toward-zero arithmetic for algorithms that require it.

The stdlib `tile_of` helper had a manual negative-coordinate correction for a
truncating division model. With native division it produced wrong negative tile
indices and could overflow before dividing. It now uses the native division
alone. That is an API correctness fix plus simpler output, not equivalence of the
old incorrect program.

## Periodic work and call suppression

`@throttle` previously registered a tick dispatcher but left direct source calls
unrestricted. The old regression expected `1` and observed `2`. The owner chose
to retire the ambiguous decorator, rather than redefine that result as success.
Source compilation rejects it with migration guidance, even in lenient mode.
Explicit low-level emitter metadata remains deprecated 3.x compatibility only.

`@tick(rate=N)` now implements periodic registration, instead of only parsing the
attribute. It uses module-owned counters, starts after N simulation ticks from
the load epoch, and resets phase on load. Bare tick and rate 1 have no counter.
Rates are positive integer literals within the signed-i32 counter range. Direct
calls to the function remain ordinary calls. Named constants in rate attributes
are not yet supported.

The controlled live regression steps a frozen server and checks 3/5/7-tick
cadence, direct calls, reloading and two namespaces with identical function
names. Load tags resume with simulation ticks. The test seeds public observation
markers while frozen, never the private scheduler counters.

The replacement `cooldown` module returns integer deadlines owned by its caller.
It has no global ability slot or per-instance tick work. Callers supply a shared
non-negative monotonic clock epoch and persist/reset deadlines themselves.
Non-positive durations are immediately ready; deadline addition saturates at the
i32 maximum. See [4.0 migration](../MIGRATION_4.md) and
[the cooldown API](../stdlib/cooldown.md).

## Artifact and runtime boundaries

The managed oracle uses disposable worlds. `MC_HARNESS_PLUGIN` selects a current
loopback-only harness JAR without editing frozen templates. TestHarness 1.2.1
binds the HTTP command API to `127.0.0.1`; known all-interface 1.2.0 defaults are
refused by the strict optimizer gate unless an explicit artifact is selected.

Source/API tests, source-CLI smoke and live Paper checks do not establish that
the existing `dist` or an npm tarball is fresh. The two compiled-CLI corpus gates
remain required. Do not publish 4.0 before a fresh TypeScript SDK build, packed
consumer checks and the remaining release/documentation gates pass. Existing
historical coverage mappings are retained, not reclassified as new full-corpus
qualification.
