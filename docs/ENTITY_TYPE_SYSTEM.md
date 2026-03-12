# Entity Type System

## Overview

RedScript v1.2 introduces a hierarchical entity type system that provides:
- Compile-time type checking for entity operations
- IDE autocompletion for entity-specific methods
- Type narrowing via `is` assertions
- Context-aware `@s` typing

## Type Hierarchy

```
entity (base type)
├── Player         ← @a, @p, @r
├── Mob
│   ├── HostileMob
│   │   ├── Zombie
│   │   ├── Skeleton
│   │   ├── Creeper
│   │   └── ...
│   └── PassiveMob
│       ├── Pig
│       ├── Cow
│       ├── Sheep
│       └── ...
├── Item
├── ArmorStand
├── Projectile
│   ├── Arrow
│   ├── Fireball
│   └── ...
└── ... (extensible)
```

## Selector Return Types

| Selector | Return Type |
|----------|-------------|
| `@a` | `Player` |
| `@p` | `Player` |
| `@r` | `Player` |
| `@e` | `entity` |
| `@e[type=zombie]` | `Zombie` |
| `@e[type=pig]` | `Pig` |
| `@s` | Context-dependent |

## Basic Usage

### Foreach with Type Inference

```mcrs
// @a returns Player - player-specific methods available
foreach (p in @a) {
    p.give("diamond", 1);      // ✅ Player method
    p.gamemode("creative");    // ✅ Player method
    p.kill();                  // ✅ entity method (inherited)
}

// @e returns entity - only base methods
foreach (e in @e) {
    e.kill();                  // ✅ entity method
    e.give("diamond", 1);      // ❌ Compile error: give() requires Player
}

// @e[type=X] infers specific type
foreach (z in @e[type=zombie]) {
    z.kill();                  // ✅ entity method
    z.setNoAI(true);           // ✅ Mob method
}
```

### @s Context Typing

`@s` type depends on the current execution context:

```mcrs
// Top-level: @s is entity (conservative)
@tick fn tick() {
    @s.kill();  // ✅ entity method only
}

// Inside foreach @a: @s is Player
foreach (p in @a) {
    @s.give("diamond", 1);  // ✅ @s is Player
    p.give("diamond", 1);   // ✅ Same as @s
}

// Inside as block: @s changes
foreach (p in @a) {
    // @s: Player
    as @e[type=zombie] {
        // @s: Zombie (context changed)
        @s.setNoAI(true);  // ✅ Mob method
    }
    // @s: Player (restored)
}
```

### Type Narrowing with `is`

```mcrs
foreach (e in @e) {
    // e: entity
    
    if (e is Player) {
        // e: Player (narrowed)
        e.give("diamond", 1);  // ✅
        e.gamemode("survival");  // ✅
    }
    
    if (e is Zombie) {
        // e: Zombie (narrowed)
        e.setNoAI(true);  // ✅
    }
}
```

### Explicit Type Assertions

```mcrs
// Assert type (unsafe - runtime behavior unchanged)
let boss = @e[tag=boss,limit=1] as Zombie;
boss.setNoAI(true);  // Treated as Zombie

// Safe pattern: combine with type filter
foreach (z in @e[type=zombie,tag=boss] as Zombie) {
    z.setNoAI(true);
}
```

## Entity Methods

### Base `entity` Methods

All entities have:
- `kill()` - Remove entity
- `tp(x, y, z)` - Teleport
- `tag_add(tag)` / `tag_remove(tag)` - Tags
- `data_merge(nbt)` - NBT manipulation
- `effect(effect, duration, level)` - Effects

### `Player` Methods

Players additionally have:
- `give(item, count)` - Give items
- `clear(item?)` - Clear inventory
- `gamemode(mode)` - Set gamemode
- `xp(amount, type)` - XP manipulation
- `title(text)` / `subtitle(text)` / `actionbar(text)` - Display
- `playsound(sound)` - Audio

### `Mob` Methods

Mobs additionally have:
- `setNoAI(bool)` - Disable AI
- `setHealth(amount)` - Set health
- `setInvisible(bool)` - Visibility

## Implementation Details

### Self Type Stack

The type checker maintains a stack of self types:

```typescript
class TypeChecker {
    private selfTypeStack: EntityType[] = [{ kind: 'entity' }];
    
    enterContext(selector: Selector) {
        this.selfTypeStack.push(this.inferEntityType(selector));
    }
    
    exitContext() {
        this.selfTypeStack.pop();
    }
    
    getSelfType(): EntityType {
        return this.selfTypeStack[this.selfTypeStack.length - 1];
    }
}
```

### Type Inference from Selector

```typescript
function inferEntityType(selector: Selector): EntityType {
    switch (selector.kind) {
        case '@a':
        case '@p':
        case '@r':
            return { kind: 'Player' };
        case '@e':
        case '@s':
            if (selector.filters?.type) {
                return entityTypeFromMinecraftType(selector.filters.type);
            }
            return { kind: 'entity' };
        default:
            return { kind: 'entity' };
    }
}
```

### Method Resolution

Methods are resolved based on the entity type hierarchy:

1. Check if method exists on the specific type
2. Walk up the hierarchy checking parent types
3. Error if not found on any ancestor

## Future Extensions

### Custom Entity Types (v1.3+)

```mcrs
// Define custom entity type with tag
entity Boss extends Zombie {
    tag: "boss";
    
    fn enrage() {
        effect(@s, "strength", 100, 2);
        effect(@s, "speed", 100, 1);
    }
}

// Auto-narrowed when tag matches
foreach (b in @e[tag=boss] as Boss) {
    b.enrage();
}
```

### Generic Selectors (v1.3+)

```mcrs
fn buff<T: Player>(targets: T[]) {
    foreach (t in targets) {
        t.effect("strength", 30, 1);
    }
}
```
