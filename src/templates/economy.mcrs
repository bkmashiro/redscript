// Server economy helpers backed by a vanilla scoreboard objective.

fn earn(player: string, amount: int) {
    let coins: int = scoreboard_get(player, "coins");
    coins = coins + amount;
    scoreboard_set(player, "coins", coins);
    actionbar(player, "Coins added");
}

fn spend(player: string, amount: int) -> int {
    let coins: int = scoreboard_get(player, "coins");

    if (coins >= amount) {
        coins = coins - amount;
        scoreboard_set(player, "coins", coins);
        actionbar(player, "Purchase approved");
        return 1;
    }

    actionbar(player, "Not enough coins");
    return 0;
}

fn balance(player: string) -> int {
    let coins: int = scoreboard_get(player, "coins");
    return coins;
}

fn shop_buy(player: string, item: string, price: int) {
    let paid: int = spend(player, price);

    if (paid == 1) {
        give(player, item, 1);
        title(player, "Purchase Complete");
        subtitle(player, "Item delivered");
    } else {
        title(player, "Purchase Failed");
        subtitle(player, "Earn more coins first");
    }
}
