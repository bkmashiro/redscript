# `strings` — String utilities

Import: `import strings;`

String helper utilities. Runtime string manipulation is currently limited in RedScript; `str_len` is compiler-assisted and lowers to `data get storage rs:strings ...` for literal-backed strings.

## Functions

### `str_len(s: string): int`

Return the length of a string. Currently returns 0 as a stub; full implementation is compiler-assisted for literal-backed strings.

**Example:**
```rs
import strings;
let len: int = str_len("hello");  // 5 (compiler-assisted)
```
