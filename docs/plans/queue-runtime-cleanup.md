# Queue runtime cleanup notes

## Current status

`src/stdlib/queue.mcrs` is currently a stdlib-level FIFO built on the existing RedScript storage/NBT and macro-command path. It is intentionally lower priority than Timer because it is not a compiler-owned intrinsic: no MIR lowering special-case owns queue semantics today.

## Current behavior

- Backing storage: `storage rs:arrays Queue`.
- Backing shape: one global integer list, for example `Queue: [10, 20, 30]`.
- Logical head pointer: scoreboard player `rs.q_head` in the global `rs` objective.
- `queue_push(val)` appends `val` to the backing list through a `function ... with storage` macro helper.
- `queue_pop()` reads `Queue[rs.q_head]`, returns `-1` if empty, and increments `rs.q_head` without physically removing the element.
- `queue_peek()` reads `Queue[rs.q_head]` without incrementing the head pointer.
- `queue_size()` returns `raw_list_length - rs.q_head`.
- `queue_clear()` resets the backing list to `[]` and resets `rs.q_head` to `0`.

## Known constraints

- The public API is effectively one global FIFO per datapack/runtime, not independent queue instances.
- The backing list can retain popped values until `queue_clear()`; this keeps pop O(1) but means long-running queues may accumulate stale storage before clear/reset.
- The implementation relies on macro helpers and the existing `function ... with storage` path, so future queue regressions should first be triaged as macro/storage command-shape issues before introducing compiler intrinsics.

## When to revisit

Revisit queue only if one of these becomes true:

1. A live Paper oracle catches a queue behavior regression.
2. The API needs multiple independent queue instances.
3. Storage growth from logical pops becomes a real runtime concern.
4. Macro/storage hardening changes command shape around `function ... with storage`.

## Candidate future phases

1. Add a tiny golden shape test for `queue_push` / `queue_pop` macro command shape if storage/macro lowering changes again.
2. Decide whether a future API should remain global helpers or expose explicit queue handles.
3. If multiple instances are needed, design it as a storage-path/keyed stdlib API before considering compiler intrinsics.
4. Keep live coverage in `src/__tests__/mc-integration/stdlib-coverage-8.test.ts` as the behavior oracle.
