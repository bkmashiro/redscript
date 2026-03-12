// Cooldown helpers.
//
// Like timer.rs, the `name` parameter is reserved for a future compiler/runtime
// that can route string literals through user-defined calls. Today this file
// manages one cooldown slot on the `rs` objective.

fn cooldown_start(name: string, ticks: int) {
    scoreboard_set("cooldown_ticks", "rs", ticks);
    scoreboard_set("cooldown_active", "rs", 1);
}

fn cooldown_ready(name: string) -> int {
    let active: int = scoreboard_get("cooldown_active", "rs");
    let ticks_left: int = scoreboard_get("cooldown_ticks", "rs");

    if (active == 0) {
        return 1;
    }

    if (ticks_left <= 0) {
        return 1;
    }

    return 0;
}

fn cooldown_tick(name: string) {
    let active: int = scoreboard_get("cooldown_active", "rs");
    let ticks_left: int = scoreboard_get("cooldown_ticks", "rs");

    if (active == 0) {
        return;
    }

    if (ticks_left > 0) {
        let next: int = ticks_left - 1;
        scoreboard_set("cooldown_ticks", "rs", next);

        if (next == 0) {
            scoreboard_set("cooldown_active", "rs", 0);
        }
    } else {
        scoreboard_set("cooldown_active", "rs", 0);
    }
}
