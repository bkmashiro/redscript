# Integer and runtime contracts for 4.0

Status: owner decisions required before release. Preserve these counterexamples
and make the chosen behavior pass on real Paper. Do not hide the mismatch by
skipping tests or redefining their expected output to the current bug.

## Integer division and remainder

Paper 1.21.4 build 232 was queried through the native scoreboard commands:

- `-7 /= 3` yields `-3`; `-7 %= 3` yields `2`.
- `7 /= -3` yields `-3`; `7 %= -3` yields `-2`.
- `-7 /= -3` yields `2`; `-7 %= -3` yields `-1`.
- Signed i32 overflow wraps, including `2147483647 * 2147483647 → 1` and
  `-2147483648 / -1 → -2147483648`.

The compiler currently emits `scoreboard players set #value numeric -2` for the
literal expression `-7 / 3`. MIR/VIR folding and some bounded evaluation tools use
toward-zero division/remainder. The archived language design and several stdlib
comments also describe toward-zero behavior. Merely changing one folder would
leave constant and dynamic paths, stdlib assumptions and test tools inconsistent.

Choices:

1. Adopt native floor division/remainder for scoreboard integers in 4.0. This
   keeps dynamic lowering small. Align folders/interpreters/docs and provide an
   explicit toward-zero helper where a program needs it.
2. Keep toward-zero language semantics. Correct native dynamic lowering with
   explicit sign/remainder adjustment, account for the extra commands, and
   retain matching constant-fold/interpreter behavior.

The current implementation does not make that choice. New partial-specialization
eligibility excludes division/remainder transitively. Full existing folds remain
subject to the known mismatch. Independent multiply/add/subtract i32 issues were
fixed and checked against exact BigInt arithmetic and native Paper operations.

## `@throttle` dispatch and state lifetime

The language reference promises that a decorated function runs at most once per
N ticks regardless of call frequency. The emitter currently creates an automatic
tick dispatcher, counts dispatcher invocations, and leaves direct source calls
pointing to the undecorated body.

`tests/mc-cases/runtime-boundary.mcrs` calls `limited_set` twice in one function.
The documented cooldown contract expects the first value (`1`). Actual Paper
output is the second value (`2`) with both conservative and effect-aware output.
This is independent of the new read-reuse optimization. The new compiler keeps
runtime-decorated bodies out of inlining/specialization so those transforms cannot
introduce another bypass, but that does not repair the pre-existing dispatcher.

Choices:

1. Implement the documented call-site cooldown: route direct calls through the
   guard, define first-call behavior, return values, parameter storage, reload,
   and global/per-entity lifetime. Do not automatically schedule arbitrary
   decorated functions unless scheduling is requested.
2. Deprecate/remove the ambiguous decorator in 4.0. Use existing `@tick(rate=N)`
   for periodic work and design an explicit stdlib cooldown/state API for call
   suppression, with visible lifetime and storage ownership.

Changing only documentation to describe the current accidental combination is
not a complete usability fix. Tick dispatch and call suppression are different
contracts. The existing live regression deliberately remains failing until the
selected contract is implemented or the source feature is explicitly retired.

## Verification boundary

`npm run test:unit:correctness` preserves project exclusions, skips benchmark/
performance files, runs serially and forces offline mode. Passing it does not
qualify live behavior. `npm run test:mc-score-effects:live` owns a disposable
Paper 1.21.4 server and currently exposes the throttle failure: 31 checks pass,
2 fail. The passing checks include 11 native arithmetic probes and the paired
compiler scenarios for effects, partial specialization and i32 multiplication.

The integer policy is a separate unresolved equivalence issue, not a failing
assertion silently accepted as proof. Do not publish 4.0 as fully qualified until
both decisions, their implementation and relevant live gates are closed.
