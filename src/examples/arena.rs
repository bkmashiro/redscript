// PvP arena scoreboard tracker.
// Reads the vanilla kills objective, announces the top score every 200 ticks,
// and tells the current leader(s) directly.

@tick
fn arena_tick() {
    let ticks: int = scoreboard_get("arena", "ticks");
    ticks = ticks + 1;
    scoreboard_set("arena", "ticks", ticks);

    if (ticks % 200 == 0) {
        announce_leaders();
    }
}

fn announce_leaders() {
    let top_kills: int = 0;

    foreach (player in @a) {
        let kills: int = scoreboard_get(player, "kills");
        if (kills > top_kills) {
            top_kills = kills;
        }
    }

    if (top_kills > 0) {
        say("Arena update: current leader check complete.");

        foreach (player in @a) {
            let kills: int = scoreboard_get(player, "kills");
            if (kills == top_kills) {
                tell(player, "You are leading the arena right now.");
                title(player, "Arena Leader");
            }
        }
    } else {
        say("Arena update: no PvP kills yet.");
    }
}
