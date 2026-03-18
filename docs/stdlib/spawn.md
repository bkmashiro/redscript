# `spawn` — Entity spawning and teleportation

Import: `import spawn;`

Teleportation and spawn point helpers for players and entities.

## Functions

### `teleport_to(target: selector, x: int, y: int, z: int)`

Teleport `target` to absolute coordinates.

**Example:**
```rs
import spawn;
teleport_to(@s, 100, 64, 100);
```

---

### `teleport_to_entity(target: selector, dest: selector)`

Teleport `target` to another entity's location.

**Example:**
```rs
import spawn;
teleport_to_entity(@a, @e[type=armor_stand, tag=spawn_point, limit=1]);
```

---

### `spread_players(x: int, z: int, radius: int)`

Spread players randomly within `radius` of `(x, z)`. Currently emits a placeholder message; implement with `raw("spreadplayers ...")` for full functionality.

---

### `gather_all(x: int, y: int, z: int)`

Teleport all players to one location.

**Example:**
```rs
import spawn;
gather_all(0, 64, 0);
```

---

### `launch_up(target: selector, height: int)`

Teleport target upward by `height` blocks using relative coordinates.

---

### `goto_lobby(target: selector)`

Teleport target to the lobby (default: 0, 64, 0) and show "Welcome to Lobby!" title.

---

### `goto_arena(target: selector)`

Teleport target to the arena (default: 100, 64, 100) and show "Fight!" title.
