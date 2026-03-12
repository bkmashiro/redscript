import "../stdlib/math.rs"
import "../stdlib/combat.rs"

fn attack(enemy: string, base: int, bonus: int) {
    let raw_damage: int = weapon_damage(base, bonus);
    let damage: int = clamp(raw_damage, 1, 20);
    apply_damage(enemy, damage);
}

@tick
fn battle_tick() {
    attack("goblin", 4, 2);
}
