// Trigger-driven shop.
// Players set shop_choice, then run /trigger shop_buy.

fn complete_purchase() {
    let choice: int = scoreboard_get(@s, "shop_choice");

    if (choice == 1) {
        give(@s, "minecraft:bread", 1);
        tell(@s, "You bought bread.");
    } else {
        if (choice == 2) {
            give(@s, "minecraft:steak", 1);
            tell(@s, "You bought steak.");
        } else {
            if (choice == 3) {
                give(@s, "minecraft:diamond", 1);
                tell(@s, "You bought a diamond.");
            } else {
                tell(@s, "Invalid shop_choice. Use 1, 2, or 3.");
            }
        }
    }

    scoreboard_set(@s, "shop_choice", 0);
}

@on_trigger("shop_buy")
fn handle_shop_trigger() {
    complete_purchase();
}
