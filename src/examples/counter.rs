// Tick counter that announces every 100 ticks.

@tick
fn counter_tick() {
    let ticks: int = scoreboard_get("counter", "ticks");
    ticks = ticks + 1;
    scoreboard_set("counter", "ticks", ticks);

    if (ticks % 100 == 0) {
        say("Counter reached another 100 ticks");
    }
}
