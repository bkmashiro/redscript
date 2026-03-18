# `inventory` — Inventory management

Import: `import inventory;`

Inventory management helpers for clearing inventories and giving pre-defined item kits to players.

## Functions

### `clear_inventory(target: selector)`

Clear all items from a player's inventory.

**Example:**
```rs
import inventory;
clear_inventory(@a);
```

---

### `give_kit_warrior(target: selector)`

Give the warrior kit: iron sword, iron chestplate, iron leggings, iron boots, shield, 16× cooked beef.

**Example:**
```rs
import inventory;
give_kit_warrior(@s);
```

---

### `give_kit_archer(target: selector)`

Give the archer kit: bow, 64× arrows, leather chestplate, leather leggings, leather boots, 16× cooked beef.

---

### `give_kit_mage(target: selector)`

Give the mage kit: wooden sword, 8× golden apple, 16× ender pearl, 8× splash harming potion, 16× cooked beef.

---

### `remove_item(target: selector, item: string)`

Remove a specific item from the player's inventory using `clear`.

**Example:**
```rs
import inventory;
remove_item(@s, "minecraft:poisonous_potato");
```
