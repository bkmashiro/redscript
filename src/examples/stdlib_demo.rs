// Stdlib pattern demo: a simple survival loop.
//
// This file is standalone on purpose. Since RedScript has no import system yet,
// copy the helpers you need from src/stdlib/ into your project file.

fn abs(x: int) -> int {
    if (x < 0) {
        return -x;
    } else {
        return x;
    }
}

fn clamp(x: int, lo: int, hi: int) -> int {
    if (x < lo) {
        return lo;
    } else {
        if (x > hi) {
            return hi;
        } else {
            return x;
        }
    }
}

fn heal(amount: int) {
    let health: int = scoreboard_get(@p, "health");
    let next: int = health + amount;
    scoreboard_set(@p, "health", next);
}

fn damage(amount: int) {
    let health: int = scoreboard_get(@p, "health");
    let next: int = health - amount;

    if (next < 0) {
        scoreboard_set(@p, "health", 0);
    } else {
        scoreboard_set(@p, "health", next);
    }
}

fn is_op() -> int {
    let result: int = 0;

    execute if entity @p[tag=op] run {
        result = 1;
    }

    return result;
}

fn timer_start(name: string, duration: int) {
    scoreboard_set("demo_timer_ticks", "rs", duration);
    scoreboard_set("demo_timer_active", "rs", 1);
}

fn timer_tick(name: string) -> int {
    let active: int = scoreboard_get("demo_timer_active", "rs");
    let ticks: int = scoreboard_get("demo_timer_ticks", "rs");

    if (active == 0) {
        return 0;
    }

    if (ticks > 0) {
        let next: int = ticks - 1;
        scoreboard_set("demo_timer_ticks", "rs", next);

        if (next == 0) {
            scoreboard_set("demo_timer_active", "rs", 0);
        }

        return next;
    }

    scoreboard_set("demo_timer_active", "rs", 0);
    return 0;
}

fn timer_done(name: string) -> int {
    let active: int = scoreboard_get("demo_timer_active", "rs");
    let ticks: int = scoreboard_get("demo_timer_ticks", "rs");

    if (active == 0) {
        if (ticks <= 0) {
            return 1;
        }
    }

    return 0;
}

fn cooldown_start(name: string, ticks: int) {
    scoreboard_set("demo_dash_ticks", "rs", ticks);
    scoreboard_set("demo_dash_active", "rs", 1);
}

fn cooldown_ready(name: string) -> int {
    let active: int = scoreboard_get("demo_dash_active", "rs");
    let ticks_left: int = scoreboard_get("demo_dash_ticks", "rs");

    if (active == 0) {
        return 1;
    }

    if (ticks_left <= 0) {
        return 1;
    }

    return 0;
}

fn cooldown_tick(name: string) {
    let active: int = scoreboard_get("demo_dash_active", "rs");
    let ticks_left: int = scoreboard_get("demo_dash_ticks", "rs");

    if (active == 0) {
        return;
    }

    if (ticks_left > 0) {
        let next: int = ticks_left - 1;
        scoreboard_set("demo_dash_ticks", "rs", next);

        if (next == 0) {
            scoreboard_set("demo_dash_active", "rs", 0);
        }
    } else {
        scoreboard_set("demo_dash_active", "rs", 0);
    }
}

@on_trigger("arena_start")
fn arena_start() {
    scoreboard_set("arena_zone_center", "rs", 0);
    scoreboard_set(@p, "health", 20);
    timer_start("wave", 200);
    cooldown_start("dash", 0);
    title(@p, "Arena started");
}

@tick
fn arena_tick() {
    let remaining: int = timer_tick("wave");
    cooldown_tick("dash");

    if (timer_done("wave") == 1) {
        title(@p, "Next wave");
        timer_start("wave", 200);
    }

    let player_x: int = data_get("entity", @p, "Pos[0]");
    let delta: int = player_x - scoreboard_get("arena_zone_center", "rs");
    let distance: int = abs(delta);
    let pressure: int = clamp(distance, 0, 8);

    if (pressure > 4) {
        damage(1);
    } else {
        heal(1);
    }

    if (remaining <= 40) {
        tell(@p, "Wave nearly over.");
    }
}

@on_trigger("dash")
fn dash_trigger() {
    if (cooldown_ready("dash") == 1) {
        raw("effect give @p speed 1 3 true");
        cooldown_start("dash", 80);
    } else {
        tell(@p, "Dash is cooling down.");
    }

    if (is_op() == 1) {
        tell(@p, "Operator override available.");
    }
}
