// Reusable mini-game framework for lobby, countdown, match, and reset flow.

struct GameState { phase: int, players: int, timer: int }

fn announce_phase_change(state: GameState) {
    title_times(@a, 10, 40, 10);

    if (state.phase == 0) {
        title(@a, "Mini-game Lobby");
        subtitle(@a, "Waiting for players");
        actionbar(@a, "Use /trigger game_join to enter the lobby");
    } else {
        if (state.phase == 1) {
            title(@a, "Match Starting");
            subtitle(@a, "Prepare for the round");
            actionbar(@a, "Countdown started");
        } else {
            if (state.phase == 2) {
                title(@a, "Match Live");
                subtitle(@a, "Play to win");
                actionbar(@a, "The game is now active");
            } else {
                title(@a, "Round Complete");
                subtitle(@a, "Returning to lobby");
                actionbar(@a, "Resetting the mini-game");
            }
        }
    }
}

fn snapshot_state() -> GameState {
    let phase: int = scoreboard_get("game", "phase");
    let players: int = scoreboard_get("game", "players");
    let timer: int = scoreboard_get("game", "timer");
    let state: GameState = { phase: phase, players: players, timer: timer };
    return state;
}

fn set_state(phase: int, timer: int) {
    let players: int = scoreboard_get("game", "players");
    let state: GameState = { phase: phase, players: players, timer: timer };

    scoreboard_set("game", "phase", state.phase);
    scoreboard_set("game", "timer", state.timer);
    announce_phase_change(state);
}

@on_trigger("game_join")
fn game_join() {
    let joined: int = scoreboard_get("@s", "game_joined");
    let players: int = scoreboard_get("game", "players");

    if (joined == 0) {
        players = players + 1;
        scoreboard_set("game", "players", players);
        scoreboard_set("@s", "game_joined", 1);
        title(@s, "Joined Lobby");
        actionbar(@s, "Waiting for the admin to start");
        announce("A player joined the mini-game lobby.");
    } else {
        actionbar(@s, "You are already in the lobby");
    }
}

@on_trigger("game_start")
fn game_start() {
    let state: GameState = snapshot_state();

    if (state.phase == 0) {
        if (state.players > 0) {
            set_state(1, 5);
        } else {
            actionbar(@s, "At least one player must join first");
        }
    } else {
        actionbar(@s, "A round is already in progress");
    }
}

@tick(rate=20)
fn game_tick() {
    let state: GameState = snapshot_state();

    if (state.phase == 0) {
        actionbar(@a, "Waiting lobby active");
    } else {
        if (state.phase == 1) {
            actionbar(@a, "Match starts soon");
            state.timer = state.timer - 1;
            scoreboard_set("game", "timer", state.timer);

            if (state.timer <= 0) {
                set_state(2, 180);
            }
        } else {
            if (state.phase == 2) {
                actionbar(@a, "Mini-game in progress");
                state.timer = state.timer - 1;
                scoreboard_set("game", "timer", state.timer);

                if (state.timer <= 0) {
                    set_state(3, 10);
                }
            } else {
                actionbar(@a, "Ending round");
                state.timer = state.timer - 1;
                scoreboard_set("game", "timer", state.timer);

                if (state.timer <= 0) {
                    scoreboard_set("game", "phase", 0);
                    scoreboard_set("game", "timer", 0);
                    announce_phase_change(snapshot_state());
                }
            }
        }
    }
}
