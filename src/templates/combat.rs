// Combat helper library with scoreboard-backed health and cooldown state.

struct CombatEntity { health: int, maxHealth: int, defense: int, cooldown: int }

fn entity_state(target: string) -> CombatEntity {
    let health: int = scoreboard_get(target, "health");
    let maxHealth: int = scoreboard_get(target, "max_health");
    let defense: int = scoreboard_get(target, "defense");
    let cooldown: int = scoreboard_get(target, "cooldown");
    let entity: CombatEntity = {
        health: health,
        maxHealth: maxHealth,
        defense: defense,
        cooldown: cooldown
    };
    return entity;
}

fn deal_damage(attacker: string, target: string, damage: int) {
    let entity: CombatEntity = entity_state(target);
    let finalDamage: int = damage - entity.defense;

    if (entity.cooldown > 0) {
        actionbar(attacker, "Attack on cooldown");
        return;
    }

    if (finalDamage < 1) {
        finalDamage = 1;
    }

    if (entity.health > finalDamage) {
        entity.health = entity.health - finalDamage;
        scoreboard_set(target, "health", entity.health);
        scoreboard_set(attacker, "cooldown", 10);
        tag_add(attacker, "in_combat");
        tag_add(target, "in_combat");
        tag_add(attacker, "combat_ready");
        tag_remove(attacker, "combat_ready");
        actionbar(attacker, "Hit confirmed");
        actionbar(target, "You took damage");
    } else {
        scoreboard_set(target, "health", 0);
        scoreboard_set(attacker, "cooldown", 10);
        tag_add(attacker, "in_combat");
        tag_add(target, "in_combat");
        tag_add(target, "defeated");
        tag_remove(target, "combat_ready");
        title(target, "Defeated");
        subtitle(target, "Wait for a heal or respawn");
    }
}

fn heal_entity(target: string, amount: int) {
    let entity: CombatEntity = entity_state(target);

    if (entity.health <= 0) {
        tag_remove(target, "defeated");
    }

    entity.health = entity.health + amount;
    if (entity.health > entity.maxHealth) {
        entity.health = entity.maxHealth;
    }

    scoreboard_set(target, "health", entity.health);
    actionbar(target, "Health restored");
}

fn is_alive(target: string) -> int {
    let health: int = scoreboard_get(target, "health");
    if (health > 0) {
        return 1;
    }
    return 0;
}

@tick(rate=1)
fn combat_tick() {
    foreach (entity in @e[tag=in_combat]) {
        let cooldown: int = scoreboard_get("@s", "cooldown");

        if (cooldown > 0) {
            let next: int = cooldown - 1;
            scoreboard_set("@s", "cooldown", next);

            if (next == 0) {
                tag_add("@s", "combat_ready");
                tag_remove("@s", "in_combat");
            }
        } else {
            tag_add("@s", "combat_ready");
            tag_remove("@s", "in_combat");
        }
    }
}
