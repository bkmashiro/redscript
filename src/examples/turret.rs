// Automated turret using a spawned armor stand object and a struct value.

struct TurretState { health: int }

@on_trigger("deploy_turret")
fn deploy_turret() {
    let turret = spawn_object(0, 64, 0);
    turret.health = 40;
    turret.tag("turret");

    let state: TurretState = { health: 40 };
    let hp = state.health;
    scoreboard_set("turret", "health", hp);

    say("Turret deployed.");
}

@tick(rate=20)
fn turret_tick() {
    foreach (turret in @e[type=armor_stand, tag=turret]) {
        at @s {
            foreach (z in @e[type=zombie, distance=..8]) {
                kill(z);
            }
        }
    }
}
