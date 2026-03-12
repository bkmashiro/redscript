// A zombie survival game logic
// Kills nearby zombies and tracks score

@tick(rate=20)
fn check_zombies() {
    foreach (z in @e[type=zombie, distance=..10]) {
        kill(z);
        // in real game: add to player's kill score
    }
}

@tick(rate=100)
fn announce() {
    say("Zombie check complete");
}

fn reward_player() {
    give(@s, "minecraft:diamond", 1);
    title(@s, "Zombie Slayer!");
}

@on_trigger("claim_reward")
fn handle_claim() {
    reward_player();
}
