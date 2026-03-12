// Player helpers built on scoreboard/tag patterns.
// These helpers target the nearest player via @p.

fn heal(amount: int) {
    let health: int = scoreboard_get("@p", "health");
    let next: int = health + amount;
    scoreboard_set("@p", "health", next);
}

fn damage(amount: int) {
    let health: int = scoreboard_get("@p", "health");
    let next: int = health - amount;

    if (next < 0) {
        scoreboard_set("@p", "health", 0);
    } else {
        scoreboard_set("@p", "health", next);
    }
}

fn is_op() -> int {
    let result: int = 0;

    execute if entity @p[tag=op] run {
        result = 1;
    }

    return result;
}
