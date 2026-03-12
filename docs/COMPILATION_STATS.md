# RedScript Example Compilation Stats

Generated on 2026-03-12 with:

```bash
for example in src/examples/*.rs; do
  name=$(basename "$example" .rs)
  TS_NODE_TRANSPILE_ONLY=1 npx ts-node src/cli.ts compile "$example" --stats -o /tmp/eval/$name 2>&1
done
```

## Summary

| Example | Functions | Commands Before | Commands After | Savings |
|:--|--:|--:|--:|--:|
| `arena.rs` | 4 | 208 | 52 | 75% |
| `counter.rs` | 1 | 76 | 19 | 75% |
| `pvp_arena.rs` | 15 | 780 | 195 | 75% |
| `quiz.rs` | 7 | 564 | 141 | 75% |
| `rpg.rs` | 10 | 548 | 137 | 75% |
| `shop.rs` | 2 | 160 | 40 | 75% |
| `showcase_game.rs` | 89 | 3360 | 840 | 75% |
| `stdlib_demo.rs` | 15 | 1104 | 276 | 75% |
| `turret.rs` | 5 | 104 | 26 | 75% |
| `world_manager.rs` | 3 | 80 | 20 | 75% |

## Per-example Optimizer Stats

### `arena.rs`

- Functions: `4`
- Commands: `208 -> 52`
- Savings: `75%`
- LICM: `1`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `2`
- Constant folds: `0`

### `counter.rs`

- Functions: `1`
- Commands: `76 -> 19`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `0`
- Constant folds: `0`

### `pvp_arena.rs`

- Functions: `15`
- Commands: `780 -> 195`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `4`
- Constant folds: `0`

### `quiz.rs`

- Functions: `7`
- Commands: `564 -> 141`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `0`
- Constant folds: `0`

### `rpg.rs`

- Functions: `10`
- Commands: `548 -> 137`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `3`
- Constant folds: `1`

### `shop.rs`

- Functions: `2`
- Commands: `160 -> 40`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `0`
- Constant folds: `0`

### `showcase_game.rs`

- Functions: `89`
- Commands: `3360 -> 840`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `20`
- Constant folds: `1`

### `stdlib_demo.rs`

- Functions: `15`
- Commands: `1104 -> 276`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `11`
- Constant folds: `0`

### `turret.rs`

- Functions: `5`
- Commands: `104 -> 26`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `0`
- Constant folds: `0`

### `world_manager.rs`

- Functions: `3`
- Commands: `80 -> 20`
- Savings: `75%`
- LICM: `0`
- CSE eliminations: `0`
- setblock batching savings: `0`
- Dead code removed: `0`
- Constant folds: `0`

## Warnings Observed During Compilation

- `showcase_game.rs`: warnings inherited from imported stdlib helpers using quoted selectors in `player.rs`, plus one auto-qualification warning for unnamespaced `zombie`.
- `turret.rs`: auto-qualification warnings for unnamespaced `armor_stand` and `zombie`.
