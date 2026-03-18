# `teams` — Team management

Import: `import teams;`

Team management helpers for common multi-team game setups. Provides named team creation with colour and friendly-fire settings, player assignment/removal, and full 2- and 4-team game setup/cleanup helpers.

## Functions

### `create_team(name: string, color: string)`

Create a team with the given name and color using `team_add` and `team_option`.

**Example:**
```rs
import teams;
create_team("purple", "dark_purple");
```

---

### `create_red_team()`

Create the `red` team with red colour and friendly fire disabled.

---

### `create_blue_team()`

Create the `blue` team with blue colour and friendly fire disabled.

---

### `create_green_team()`

Create the `green` team with green colour and friendly fire disabled.

---

### `create_yellow_team()`

Create the `yellow` team with yellow colour and friendly fire disabled.

---

### `add_to_team(target: selector, team_name: string)`

Add entities to a team.

**Example:**
```rs
import teams;
add_to_team(@s, "red");
```

---

### `remove_from_teams(target: selector)`

Remove entities from all teams.

---

### `setup_two_teams()`

Create red and blue teams. Convenience wrapper for 1v1 or 2-team games.

**Example:**
```rs
import teams;

@load
fn init() {
    setup_two_teams();
}
```

---

### `setup_four_teams()`

Create red, blue, green, and yellow teams.

---

### `cleanup_teams()`

Remove red, blue, green, and yellow teams.
