struct FighterState {
    health: int,
    eliminations: int,
    alive: int
}

fn snapshot_fighter() -> FighterState {
    let health: int = scoreboard_get(@s, "arena_health");
    let eliminations: int = scoreboard_get(@s, "arena_elims");
    let alive: int = scoreboard_get(@s, "arena_alive");
    let state: FighterState = { health: health, eliminations: eliminations, alive: alive };
    return state;
}

fn save_fighter(state: FighterState) {
    scoreboard_set(@s, "arena_health", state.health);
    scoreboard_set(@s, "arena_elims", state.eliminations);
    scoreboard_set(@s, "arena_alive", state.alive);
}

fn count_team(tagName: string) -> int {
    let total: int = 0;

    if (tagName == "red") {
        foreach (player in @a[tag=arena_red, tag=arena_alive]) {
            total += 1;
        }
    } else {
        foreach (player in @a[tag=arena_blue, tag=arena_alive]) {
            total += 1;
        }
    }

    return total;
}

fn check_winner() {
    let red_alive: int = count_team("red");
    let blue_alive: int = count_team("blue");

    if (red_alive == 0) {
        title(@a, "Blue Team Wins");
        subtitle(@a, "Red squad has been eliminated");
    } else {
        if (blue_alive == 0) {
            title(@a, "Red Team Wins");
            subtitle(@a, "Blue squad has been eliminated");
        }
    }
}

fn knock_out_current_player() {
    let state: FighterState = snapshot_fighter();
    state.health = 0;
    state.alive = 0;
    save_fighter(state);
    @s.tag("arena_out");
    @s.untag("arena_alive");
    title(@s, "Eliminated");
    actionbar(@s, "Wait for the next arena reset");
}

fn award_elimination() {
    let killer: FighterState = snapshot_fighter();
    killer.eliminations = killer.eliminations + 1;
    save_fighter(killer);
    title(@s, "Elimination");
    actionbar(@s, "Your elimination total is now ${killer.eliminations}");
}

fn check_milestones() {
    let milestones: int[] = [1, 3, 5];
    let kills: int = scoreboard_get(@s, "arena_elims");

    foreach (milestone in milestones) {
        if (kills == milestone) {
            actionbar(@s, "Milestone reached: ${milestone} eliminations");
        }
    }
}

@tick
fn arena_status_tick() {
    let red_alive: int = count_team("red");
    let blue_alive: int = count_team("blue");
    actionbar(@a, "Arena status: Red ${red_alive} alive | Blue ${blue_alive} alive");
    check_winner();
}

@on_trigger("arena_assign_red")
fn arena_assign_red() {
    @s.tag("arena_red");
    @s.tag("arena_alive");
    @s.untag("arena_blue");
    @s.untag("arena_out");
    scoreboard_set(@s, "arena_health", 20);
    scoreboard_set(@s, "arena_elims", 0);
    scoreboard_set(@s, "arena_alive", 1);
    title(@s, "Red Team");
}

@on_trigger("arena_assign_blue")
fn arena_assign_blue() {
    @s.tag("arena_blue");
    @s.tag("arena_alive");
    @s.untag("arena_red");
    @s.untag("arena_out");
    scoreboard_set(@s, "arena_health", 20);
    scoreboard_set(@s, "arena_elims", 0);
    scoreboard_set(@s, "arena_alive", 1);
    title(@s, "Blue Team");
}

@on_trigger("arena_hit")
fn arena_hit() {
    let state: FighterState = snapshot_fighter();
    state.health = state.health - 5;
    save_fighter(state);

    if (state.health <= 0) {
        knock_out_current_player();
    } else {
        subtitle(@s, "Health now ${state.health}");
    }
}

@on_trigger("arena_elim")
fn arena_elim() {
    award_elimination();
    check_milestones();
}
