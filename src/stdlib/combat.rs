// Combat helpers for simple RPG-style datapacks.

fn weapon_damage(base: int, bonus: int) -> int {
    return base + bonus;
}

fn enemy_health(name: string) -> int {
    return scoreboard_get(name, "health");
}

fn apply_damage(name: string, amount: int) {
    let health: int = enemy_health(name);
    let next: int = health - amount;

    if (next < 0) {
        scoreboard_set(name, "health", 0);
    } else {
        scoreboard_set(name, "health", next);
    }
}
