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
        announce("Arena update: leader check complete.");
        title_times(@a, 10, 40, 10);
        actionbar(@a, "Top kills updated");

        foreach (player in @a) {
            let kills: int = scoreboard_get(player, "kills");
            if (kills == top_kills) {
                tell(player, "You are leading the arena right now.");
                title(player, "Arena Leader");
                subtitle(player, "Hold the top score");
                actionbar(player, "Stay alive to keep the lead");
            }
        }
    } else {
        announce("Arena update: no PvP kills yet.");
        actionbar(@a, "No arena leader yet");
    }
}
