import "../stdlib/math.rs"
import "../stdlib/player.rs"
import "../stdlib/cooldown.rs"

const WIN_SCORE: int = 15
const CRYSTAL_VALUE: int = 3
const ENEMY_DAMAGE: int = 2
const MIN_PLAYERS: int = 2
const COUNTDOWN_SECONDS: int = 10
const ROUND_SECONDS: int = 90
const RESET_SECONDS: int = 8
const DASH_DISTANCE: int = 3
const DASH_COOLDOWN: int = 80

enum Phase { Waiting, Countdown, Playing, Ended }
enum Lane { North, South, East, West }

struct GameState {
    phase: int,
    countdown: int,
    timer: int,
    joined: int,
    reset_timer: int
}

struct PlayerState {
    score: int,
    crystals: int,
    streak: int,
    alive: int
}

fn snapshot_game() -> GameState {
    let phase: int = scoreboard_get("crystal", "phase");
    let countdown: int = scoreboard_get("crystal", "countdown");
    let timer: int = scoreboard_get("crystal", "timer");
    let joined: int = scoreboard_get("crystal", "joined");
    let reset_timer: int = scoreboard_get("crystal", "reset_timer");
    let state: GameState = {
        phase: phase,
        countdown: countdown,
        timer: timer,
        joined: joined,
        reset_timer: reset_timer
    };
    return state;
}

fn snapshot_player() -> PlayerState {
    let score: int = scoreboard_get(@s, "score");
    let crystals: int = scoreboard_get(@s, "crystals");
    let streak: int = scoreboard_get(@s, "streak");
    let alive: int = scoreboard_get(@s, "alive");
    let state: PlayerState = { score: score, crystals: crystals, streak: streak, alive: alive };
    return state;
}

fn save_player(state: PlayerState) {
    scoreboard_set(@s, "score", state.score);
    scoreboard_set(@s, "crystals", state.crystals);
    scoreboard_set(@s, "streak", state.streak);
    scoreboard_set(@s, "alive", state.alive);
}

fn crystal_reward(base: int, streak: int = 0) -> int {
    let bonus: int = clamp(streak, 0, 2);
    return base + bonus;
}

fn count_joined_players() -> int {
    let total: int = 0;

    foreach (player in @a[tag=cr_joined]) {
        total += 1;
    }

    scoreboard_set("crystal", "joined", total);
    return total;
}

fn set_phase(phase: int) {
    scoreboard_set("crystal", "phase", phase);
}

fn lane_live_score(lane: int) -> int {
    match (lane) {
        Lane.North => {
            return scoreboard_get("crystal", "north_live");
        }
        Lane.South => {
            return scoreboard_get("crystal", "south_live");
        }
        Lane.East => {
            return scoreboard_get("crystal", "east_live");
        }
        _ => {
            return scoreboard_get("crystal", "west_live");
        }
    }
}

fn set_lane_live(lane: int, live: int) {
    match (lane) {
        Lane.North => {
            scoreboard_set("crystal", "north_live", live);
        }
        Lane.South => {
            scoreboard_set("crystal", "south_live", live);
        }
        Lane.East => {
            scoreboard_set("crystal", "east_live", live);
        }
        _ => {
            scoreboard_set("crystal", "west_live", live);
        }
    }
}

fn lane_label(lane: int) -> string {
    match (lane) {
        Lane.North => {
            return "North";
        }
        Lane.South => {
            return "South";
        }
        Lane.East => {
            return "East";
        }
        _ => {
            return "West";
        }
    }
}

fn detect_lane() -> int {
    let px: int = data_get("entity", @s, "Pos[0]");
    let pz: int = data_get("entity", @s, "Pos[2]");
    let ax: int = abs(px);
    let az: int = abs(pz);

    if (az >= ax) {
        if (pz < 0) {
            return Lane.North;
        } else {
            return Lane.South;
        }
    }

    if (px >= 0) {
        return Lane.East;
    }

    return Lane.West;
}

fn respawn_lane(lane: int) {
    let live: int = lane_live_score(lane);

    if (live == 1) {
        return;
    }

    match (lane) {
        Lane.North => {
            let pos: BlockPos = (0, 65, -8);
            setblock(pos, "minecraft:emerald_block");
        }
        Lane.South => {
            let pos: BlockPos = (0, 65, 8);
            setblock(pos, "minecraft:emerald_block");
        }
        Lane.East => {
            let pos: BlockPos = (8, 65, 0);
            setblock(pos, "minecraft:emerald_block");
        }
        _ => {
            let pos: BlockPos = (-8, 65, 0);
            setblock(pos, "minecraft:emerald_block");
        }
    }

    set_lane_live(lane, 1);
}

fn clear_lane(lane: int) {
    match (lane) {
        Lane.North => {
            let pos: BlockPos = (0, 65, -8);
            setblock(pos, "minecraft:air");
        }
        Lane.South => {
            let pos: BlockPos = (0, 65, 8);
            setblock(pos, "minecraft:air");
        }
        Lane.East => {
            let pos: BlockPos = (8, 65, 0);
            setblock(pos, "minecraft:air");
        }
        _ => {
            let pos: BlockPos = (-8, 65, 0);
            setblock(pos, "minecraft:air");
        }
    }
}

fn build_arena() {
    let floor_a: BlockPos = (-12, 64, -12);
    let floor_b: BlockPos = (12, 64, 12);
    let air_a: BlockPos = (-12, 65, -12);
    let air_b: BlockPos = (12, 72, 12);
    let spawn: BlockPos = (0, 65, 0);
    fill(floor_a, floor_b, "minecraft:quartz_block");
    fill(air_a, air_b, "minecraft:air");
    setblock(spawn, "minecraft:beacon");
    setblock((0, 64, -8), "minecraft:sea_lantern");
    setblock((0, 64, 8), "minecraft:sea_lantern");
    setblock((8, 64, 0), "minecraft:sea_lantern");
    setblock((-8, 64, 0), "minecraft:sea_lantern");
}

fn mark_player_spawn_pads() {
    as @a[tag=cr_joined] at @s {
        setblock((~0, 64, ~0), "minecraft:light_blue_stained_glass");
    }
}

fn spawn_enemy_wave() {
    let lanes: int[] = [0, 1, 2, 3];

    foreach (lane in lanes) {
        match (lane) {
            Lane.North => {
                summon("minecraft:zombie", "0", "65", "-10");
            }
            Lane.South => {
                summon("minecraft:zombie", "0", "65", "10");
            }
            Lane.East => {
                summon("minecraft:zombie", "10", "65", "0");
            }
            _ => {
                summon("minecraft:zombie", "-10", "65", "0");
            }
        }
    }

    announce("A fresh zombie wave crashes into the arena.");
}

fn reset_player_scores() {
    scoreboard_set(@a[tag=cr_joined], "score", 0);
    scoreboard_set(@a[tag=cr_joined], "crystals", 0);
    scoreboard_set(@a[tag=cr_joined], "streak", 0);
    scoreboard_set(@a[tag=cr_joined], "alive", 1);
    scoreboard_set(@a[tag=cr_joined], "health", 20);
}

fn respawn_all_crystals() {
    let lanes: int[] = [0, 1, 2, 3];

    foreach (lane in lanes) {
        respawn_lane(lane);
    }
}

fn start_game() {
    build_arena();
    respawn_all_crystals();
    reset_player_scores();
    scoreboard_set("crystal", "timer", ROUND_SECONDS);
    scoreboard_set("crystal", "countdown", 0);
    scoreboard_set("crystal", "reset_timer", 0);
    set_phase(Phase.Playing);
    tp(@a[tag=cr_joined], (0, 65, 0));
    mark_player_spawn_pads();
    cooldown_start("dash", 0);
    title_times(@a, 10, 50, 10);
    title(@a, "Crystal Rush");
    subtitle(@a, "Collect crystals, survive zombies, race to 15");
    announce("Crystal Rush has begun.");
}

fn announce_waiting() {
    let joined: int = count_joined_players();
    actionbar(@a, "Crystal Rush lobby: ${joined}/${MIN_PLAYERS} players ready");
}

fn tick_waiting() {
    announce_waiting();
}

fn tick_countdown() {
    let state: GameState = snapshot_game();
    title(@a, "${state.countdown}");
    subtitle(@a, "Crystal Rush starts soon");
    actionbar(@a, "Use /trigger crystal_dash after the round begins");
}

fn tick_playing() {
    cooldown_tick("dash");

    foreach (player in @a[tag=cr_joined]) {
        let state: PlayerState = snapshot_player();
        actionbar(@s, "Crystals ${state.score}/${WIN_SCORE} | Streak ${state.streak}");

        execute as @s at @s if entity @e[type=zombie, distance=..2] run {
            damage(ENEMY_DAMAGE);
        }

        let health: int = scoreboard_get(@s, "health");
        if (health <= 0) {
            respawn_player_after_knockout();
        }

        if (state.score >= WIN_SCORE) {
            end_game();
        }
    }
}

fn tick_ended() {
    let state: GameState = snapshot_game();
    actionbar(@a, "Resetting arena in ${state.reset_timer}s");
}

fn tick_fast() {
    let phase: int = scoreboard_get("crystal", "phase");

    match (phase) {
        Phase.Waiting => {
            tick_waiting();
        }
        Phase.Countdown => {
            tick_countdown();
        }
        Phase.Playing => {
            tick_playing();
        }
        _ => {
            tick_ended();
        }
    }
}

fn second_waiting() {
    count_joined_players();
}

fn second_countdown() {
    let cd: int = scoreboard_get("crystal", "countdown");

    if (cd > 1) {
        scoreboard_set("crystal", "countdown", cd - 1);
    } else {
        start_game();
    }
}

fn second_playing() {
    let timer: int = scoreboard_get("crystal", "timer");
    let next: int = max(timer - 1, 0);
    scoreboard_set("crystal", "timer", next);

    if (next % 10 == 0) {
        spawn_enemy_wave();
    }

    respawn_all_crystals();

    if (next <= 0) {
        end_game();
    }
}

fn second_ended() {
    let reset_timer: int = scoreboard_get("crystal", "reset_timer");

    if (reset_timer > 1) {
        scoreboard_set("crystal", "reset_timer", reset_timer - 1);
    } else {
        reset_match();
    }
}

@tick
fn crystal_rush_tick() {
    tick_fast();
}

@tick(rate=20)
fn crystal_rush_second() {
    let phase: int = scoreboard_get("crystal", "phase");

    match (phase) {
        Phase.Waiting => {
            second_waiting();
        }
        Phase.Countdown => {
            second_countdown();
        }
        Phase.Playing => {
            second_playing();
        }
        _ => {
            second_ended();
        }
    }
}

fn award_crystal(lane: int) {
    let player: PlayerState = snapshot_player();
    let reward: int = crystal_reward(CRYSTAL_VALUE, player.streak);
    player.score = player.score + reward;
    player.crystals = player.crystals + 1;
    player.streak = player.streak + 1;
    save_player(player);
    clear_lane(lane);
    set_lane_live(lane, 0);
    title(@s, "+${reward} crystals");
    subtitle(@s, "${lane_label(lane)} crystal secured");
    xp_add(@s, reward, "points");
}

fn respawn_player_after_knockout() {
    let player: PlayerState = snapshot_player();
    player.streak = 0;
    player.alive = 1;

    if (player.score > 0) {
        player.score = player.score - 1;
    }

    save_player(player);
    scoreboard_set(@s, "health", 20);
    title(@s, "Knocked out");
    subtitle(@s, "You lost 1 crystal and returned to spawn");
    tp(@s, (0, 65, 0));
}

fn end_game() {
    set_phase(Phase.Ended);
    scoreboard_set("crystal", "reset_timer", RESET_SECONDS);
    effect(@a, "minecraft:slowness", 5, 2);

    foreach (player in @a[tag=cr_joined]) {
        let score: int = scoreboard_get(@s, "score");
        if (score >= WIN_SCORE) {
            title(@a, "Game Over");
            subtitle(@a, "${@s} wins Crystal Rush");
            announce("${@s} reached ${score} crystals and won Crystal Rush.");
        }
    }
}

fn reset_match() {
    set_phase(Phase.Waiting);
    scoreboard_set("crystal", "countdown", 0);
    scoreboard_set("crystal", "timer", 0);
    scoreboard_set("crystal", "reset_timer", 0);
    clear_lane(Lane.North);
    clear_lane(Lane.South);
    clear_lane(Lane.East);
    clear_lane(Lane.West);
    announce("Crystal Rush reset. Waiting for more players.");
}

@on_trigger("crystal_join")
fn crystal_join() {
    if (@s.has_tag("cr_joined")) {
        actionbar(@s, "You are already in the Crystal Rush lobby");
        return;
    }

    @s.tag("cr_joined");
    scoreboard_set(@s, "score", 0);
    scoreboard_set(@s, "crystals", 0);
    scoreboard_set(@s, "streak", 0);
    scoreboard_set(@s, "alive", 1);
    scoreboard_set(@s, "health", 20);
    tp(@s, (0, 65, 0));
    title(@s, "Crystal Rush");
    subtitle(@s, "Joined the lobby");

    if (is_op() == 1) {
        actionbar(@s, "Operator joined. You can start the round any time.");
    } else {
        actionbar(@s, "Use /trigger crystal_start once at least 2 players join");
    }

    count_joined_players();
}

@on_trigger("crystal_start")
fn crystal_start() {
    let joined: int = count_joined_players();
    let phase: int = scoreboard_get("crystal", "phase");

    if (phase != Phase.Waiting) {
        actionbar(@s, "Crystal Rush is already running");
        return;
    }

    if (joined < MIN_PLAYERS) {
        actionbar(@s, "Need at least ${MIN_PLAYERS} joined players");
        return;
    }

    scoreboard_set("crystal", "countdown", COUNTDOWN_SECONDS);
    set_phase(Phase.Countdown);
    announce("Crystal Rush countdown has started.");
}

@on_trigger("crystal_claim")
fn crystal_claim() {
    let phase: int = scoreboard_get("crystal", "phase");

    if (phase != Phase.Playing) {
        actionbar(@s, "You can only claim crystals during the round");
        return;
    }

    let lane: int = detect_lane();
    let live: int = lane_live_score(lane);

    if (live == 0) {
        actionbar(@s, "${lane_label(lane)} crystal is still recharging");
        return;
    }

    award_crystal(lane);
}

@on_trigger("crystal_dash")
fn crystal_dash() {
    let phase: int = scoreboard_get("crystal", "phase");

    if (phase != Phase.Playing) {
        actionbar(@s, "Dash unlocks once the match is live");
        return;
    }

    if (cooldown_ready("dash") == 1) {
        tp(@s, (^0, ^0, ^3));
        cooldown_start("dash", DASH_COOLDOWN);
        title(@s, "Crystal Dash");
        subtitle(@s, "You lunged ${DASH_DISTANCE} blocks forward");
    } else {
        let ticks_left: int = scoreboard_get("cooldown_ticks", "rs");
        actionbar(@s, "Dash cooling down: ${ticks_left} ticks");
    }
}
