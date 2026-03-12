// Countdown timer helpers.
//
// The current compiler does not propagate string literals through user-defined
// function calls yet, so the `name` parameter is a forward-compatible placeholder.
// This module manages one timer slot backed by fake players on the `rs` objective.

struct Timer {
    ticks: int,
    active: int
}

fn timer_start(name: string, duration: int) {
    scoreboard_set("timer_ticks", "rs", duration);
    scoreboard_set("timer_active", "rs", 1);
}

fn timer_tick(name: string) -> int {
    let active: int = scoreboard_get("timer_active", "rs");
    let ticks: int = scoreboard_get("timer_ticks", "rs");

    if (active == 0) {
        return 0;
    }

    if (ticks > 0) {
        let next: int = ticks - 1;
        scoreboard_set("timer_ticks", "rs", next);

        if (next == 0) {
            scoreboard_set("timer_active", "rs", 0);
        }

        return next;
    }

    scoreboard_set("timer_active", "rs", 0);
    return 0;
}

fn timer_done(name: string) -> int {
    let active: int = scoreboard_get("timer_active", "rs");
    let ticks: int = scoreboard_get("timer_ticks", "rs");

    if (active == 0) {
        if (ticks <= 0) {
            return 1;
        }
    }

    return 0;
}
