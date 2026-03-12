// World management helpers for a lobby or event setup.
// Demonstrates block editing, global rules, and weather/time control.

fn reset_lobby_platform() {
    fill((0, 64, 0), (8, 64, 8), "minecraft:smooth_stone");
    fill((1, 65, 1), (7, 68, 7), "minecraft:air");
    setblock((4, 65, 4), "minecraft:gold_block");
}

fn configure_world() {
    weather("clear");
    time_set("day");
    gamerule("doWeatherCycle", "false");
    gamerule("doDaylightCycle", "false");
    announce("World manager refreshed the lobby.");
}

@on_trigger("world_reset")
fn handle_world_reset() {
    reset_lobby_platform();
    configure_world();
    actionbar(@a, "Lobby reset complete");
}
