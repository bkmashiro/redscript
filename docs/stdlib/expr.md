# `expr` — RPN expression evaluator

Import: `import expr;`

A stack-based Reverse Polish Notation (RPN) expression evaluator for dynamic formula evaluation at runtime. All values use ×10000 fixed-point scale. The evaluator supports a variable `x`, arithmetic operators, and common math functions. Useful for configurable easing, game formulas, and computed attributes. Requires `math` for `sin_fixed`, `cos_fixed`, `sqrt_fx`, `abs`.

## Token encoding

| Token value | Meaning |
|:--|:--|
| Positive integer | Literal value (×10000) |
| `-10000` | Variable `x` |
| `-1` | ADD: pop b, a; push a + b |
| `-2` | SUB: pop b, a; push a - b |
| `-3` | MUL: pop b, a; push a × b / 10000 (fixed-point) |
| `-4` | DIV: pop b, a; push a × 10000 / b (fixed-point) |
| `-5` | SIN: pop a (degrees ×10000); push sin ×10000 |
| `-6` | COS: pop a (degrees ×10000); push cos ×10000 |
| `-7` | SQRT: pop a; push sqrt_fx(a) |
| `-8` | ABS: pop a; push \|a\| |

The internal stack is 16 elements.

## Functions

### `expr_eval(tokens: int[], n: int, x: int): int`

> **Cost:** O(n) — one pass over n tokens, constant per token

Evaluate `n` RPN tokens, substituting `x` for any `-10000` token. Returns the top-of-stack value (×10000 scale). Behaviour is undefined for malformed token streams (stack underflow/overflow).

**Example:**
```rs
import expr;
// Encode: 2*x + 1  →  [20000, -10000, -3, 10000, -1]
let tokens: int[] = [20000, -10000, -3, 10000, -1];
let result: int = expr_eval(tokens, 5, 15000);  // x=1.5 → 40000 (4.0)
```
