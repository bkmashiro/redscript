# `sets` — Set operations

Import: `import sets;`

Runtime set implementation using NBT storage arrays with uniqueness enforced on add. The actual implementation is handled by the compiler; this module documents the interface.

## Functions

### `set_new(): string`

Create a new empty set. Returns a unique set ID string.

**Example:**
```rs
import sets;
let my_set: string = set_new();
```

---

### `set_add(set: string, value: string)`

Add `value` to the set if not already present (enforces uniqueness).

**Example:**
```rs
import sets;
let s: string = set_new();
set_add(s, "player_alice");
set_add(s, "player_bob");
set_add(s, "player_alice");  // no-op, already in set
```

---

### `set_contains(set: string, value: string): int`

Returns 1 if `value` exists in the set, 0 otherwise.

**Example:**
```rs
import sets;
let has_alice: int = set_contains(my_set, "player_alice");  // 1
```

---

### `set_remove(set: string, value: string)`

Remove `value` from the set.

**Example:**
```rs
import sets;
set_remove(my_set, "player_bob");
```

---

### `set_clear(set: string)`

Remove all values from the set.

**Example:**
```rs
import sets;
set_clear(my_set);
```
