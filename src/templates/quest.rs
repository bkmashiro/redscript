// Quest helpers for simple scoreboard-driven mission tracking.

struct Quest { id: int, progress: int, target: int, completed: int }

fn quest_target(questId: int) -> int {
    if (questId == 1) {
        return 10;
    } else {
        if (questId == 2) {
            return 25;
        }
    }

    return 5;
}

fn load_quest(player: string, questId: int) -> Quest {
    let progress: int = scoreboard_get(player, "quest_progress");
    let completed: int = scoreboard_get(player, "quest_completed");
    let target: int = quest_target(questId);
    let quest: Quest = { id: questId, progress: progress, target: target, completed: completed };
    return quest;
}

fn quest_start(player: string, questId: int) {
    let quest: Quest = { id: questId, progress: 0, target: quest_target(questId), completed: 0 };
    scoreboard_set(player, "quest_id", quest.id);
    scoreboard_set(player, "quest_progress", quest.progress);
    scoreboard_set(player, "quest_target", quest.target);
    scoreboard_set(player, "quest_completed", quest.completed);
    title(player, "Quest Started");
    actionbar(player, "Objective accepted");
}

fn quest_progress(player: string, questId: int, amount: int) {
    let activeQuest: int = scoreboard_get(player, "quest_id");
    let quest: Quest = load_quest(player, questId);

    if (activeQuest != questId) {
        return;
    }

    if (quest.completed == 1) {
        return;
    }

    quest.progress = quest.progress + amount;
    if (quest.progress > quest.target) {
        quest.progress = quest.target;
    }

    scoreboard_set(player, "quest_progress", quest.progress);
    actionbar(player, "Quest progress updated");

    if (quest.progress >= quest.target) {
        quest_complete(player, questId);
    }
}

fn quest_complete(player: string, questId: int) {
    let activeQuest: int = scoreboard_get(player, "quest_id");

    if (activeQuest == questId) {
        scoreboard_set(player, "quest_completed", 1);
        title(player, "Quest Complete");
        subtitle(player, "Reward ready");
        actionbar(player, "Mission finished");
    }
}

@on_trigger("kill_zombie")
fn kill_zombie_quest() {
    let activeQuest: int = scoreboard_get("@s", "quest_id");

    if (activeQuest == 1) {
        quest_progress("@s", 1, 1);
    }
}
