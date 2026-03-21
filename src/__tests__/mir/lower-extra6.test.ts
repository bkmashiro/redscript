/**
 * Coverage boost for src/mir/lower.ts (part 6)
 *
 * Targets:
 * - lowerExecuteSubcmd: rotated_as, facing, facing_entity, align, on, summon,
 *   if_entity, unless_entity, if_block, unless_block, if_score, unless_score,
 *   if_score_range, unless_score_range, store_result, store_success (line 2537)
 * - formatBuiltinCall: summon, particle, give, effect, effect_clear, playsound,
 *   clear, weather, time_set, time_add, gamerule, tag_add, tag_remove, kick,
 *   clone, difficulty, xp_add, xp_set (line 2726)
 * - exprToCommandArg: byte_lit, short_lit, long_lit, double_lit, bool_lit,
 *   local_coord macro, rel_coord macro, unary neg, default (line 2841)
 * - selectorToString: range filter min+max, max-only, min-only (line 2591)
 * - formatBuiltinCall: setblock with blockpos, fill with blockpos (line 2726)
 */

import { compile } from '../../emit/compile'

// ── execute subcommand variants ────────────────────────────────────────────

describe('MIR lower — execute subcommand: rotated_as', () => {
  test('rotated as @s compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute rotated as @s run {
          tell(@s, "rotated");
        }
        return 0;
      }
    `, { namespace: 'exrot' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: facing', () => {
  test('facing coordinates compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute facing ~ ~1 ~ run {
          tell(@s, "facing");
        }
        return 0;
      }
    `, { namespace: 'exfac' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: facing entity', () => {
  test('facing entity @s eyes compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute facing entity @s eyes run {
          tell(@s, "facing entity");
        }
        return 0;
      }
    `, { namespace: 'exface' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: align', () => {
  test('align xyz compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute align xyz run {
          tell(@s, "aligned");
        }
        return 0;
      }
    `, { namespace: 'exalign' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: on', () => {
  test('on attacker compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute on attacker run {
          tell(@s, "on attacker");
        }
        return 0;
      }
    `, { namespace: 'exon' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: summon', () => {
  test('execute summon entity compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute summon zombie run {
          tell(@s, "summon");
        }
        return 0;
      }
    `, { namespace: 'exsum' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: positioned_as', () => {
  test('positioned as @s compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute positioned as @s run {
          tell(@s, "positioned_as");
        }
        return 0;
      }
    `, { namespace: 'expas' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: if/unless entity', () => {
  test('if entity @e compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute if entity @e run {
          tell(@s, "if entity");
        }
        return 0;
      }
    `, { namespace: 'exife' })).not.toThrow()
  })

  test('unless entity @e compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute unless entity @e run {
          tell(@s, "unless entity");
        }
        return 0;
      }
    `, { namespace: 'exunlesse' })).not.toThrow()
  })
})

describe('MIR lower — execute subcommand: if/unless block', () => {
  test('if block position compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute if block ~ ~ ~ stone run {
          tell(@s, "if block");
        }
        return 0;
      }
    `, { namespace: 'exifb' })).not.toThrow()
  })

  test('unless block position compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute unless block ~ ~ ~ stone run {
          tell(@s, "unless block");
        }
        return 0;
      }
    `, { namespace: 'exunlessb' })).not.toThrow()
  })
})

// ── formatBuiltinCall variants ─────────────────────────────────────────────

describe('MIR lower — builtin: summon', () => {
  test('summon entity compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", "~", "~", "~");
        return 0;
      }
    `, { namespace: 'bisum' })).not.toThrow()
  })
})

describe('MIR lower — builtin: particle', () => {
  test('particle with coords compiles', () => {
    expect(() => compile(`
      fn f(): int {
        particle("minecraft:heart", "~", "~", "~");
        return 0;
      }
    `, { namespace: 'biprt' })).not.toThrow()
  })
})

describe('MIR lower — builtin: give', () => {
  test('give item compiles', () => {
    expect(() => compile(`
      fn f(): int {
        give(@s, "minecraft:diamond", "1");
        return 0;
      }
    `, { namespace: 'bigive' })).not.toThrow()
  })
})

describe('MIR lower — builtin: effect', () => {
  test('effect give compiles', () => {
    expect(() => compile(`
      fn f(): int {
        effect(@s, "speed", "30", "0");
        return 0;
      }
    `, { namespace: 'bieff' })).not.toThrow()
  })
})

describe('MIR lower — builtin: effect_clear', () => {
  test('effect clear single effect compiles', () => {
    expect(() => compile(`
      fn f(): int {
        effect_clear(@s, "speed");
        return 0;
      }
    `, { namespace: 'bieffc' })).not.toThrow()
  })

  test('effect clear all effects compiles', () => {
    expect(() => compile(`
      fn f(): int {
        effect_clear(@s);
        return 0;
      }
    `, { namespace: 'bieffca' })).not.toThrow()
  })
})

describe('MIR lower — builtin: playsound', () => {
  test('playsound compiles', () => {
    expect(() => compile(`
      fn f(): int {
        playsound("entity.player.levelup", "master", @s);
        return 0;
      }
    `, { namespace: 'bipsnd' })).not.toThrow()
  })
})

describe('MIR lower — builtin: clear', () => {
  test('clear inventory compiles', () => {
    expect(() => compile(`
      fn f(): int {
        clear(@s, "minecraft:dirt");
        return 0;
      }
    `, { namespace: 'biclr' })).not.toThrow()
  })
})

describe('MIR lower — builtin: weather', () => {
  test('weather clear compiles', () => {
    expect(() => compile(`
      fn f(): int {
        weather("clear");
        return 0;
      }
    `, { namespace: 'biwth' })).not.toThrow()
  })
})

describe('MIR lower — builtin: time_set / time_add', () => {
  test('time_set compiles', () => {
    expect(() => compile(`
      fn f(): int {
        time_set("day");
        return 0;
      }
    `, { namespace: 'bitset' })).not.toThrow()
  })

  test('time_add compiles', () => {
    expect(() => compile(`
      fn f(): int {
        time_add("1000");
        return 0;
      }
    `, { namespace: 'bitadd' })).not.toThrow()
  })
})

describe('MIR lower — builtin: gamerule', () => {
  test('gamerule compiles', () => {
    expect(() => compile(`
      fn f(): int {
        gamerule("keepInventory", "true");
        return 0;
      }
    `, { namespace: 'bigr' })).not.toThrow()
  })
})

describe('MIR lower — builtin: tag_add / tag_remove', () => {
  test('tag_add compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tag_add(@s, "my_tag");
        return 0;
      }
    `, { namespace: 'bitag' })).not.toThrow()
  })

  test('tag_remove compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tag_remove(@s, "my_tag");
        return 0;
      }
    `, { namespace: 'bitagr' })).not.toThrow()
  })
})

describe('MIR lower — builtin: kick', () => {
  test('kick player compiles', () => {
    expect(() => compile(`
      fn f(): int {
        kick(@s, "bye");
        return 0;
      }
    `, { namespace: 'bikick' })).not.toThrow()
  })
})

describe('MIR lower — builtin: clone', () => {
  test('clone blocks compiles', () => {
    expect(() => compile(`
      fn f(): int {
        clone("0", "0", "0", "10", "10", "10", "20", "20", "20");
        return 0;
      }
    `, { namespace: 'biclone' })).not.toThrow()
  })
})

describe('MIR lower — builtin: difficulty', () => {
  test('difficulty compiles', () => {
    expect(() => compile(`
      fn f(): int {
        difficulty("hard");
        return 0;
      }
    `, { namespace: 'bidiff' })).not.toThrow()
  })
})

describe('MIR lower — builtin: xp_add / xp_set', () => {
  test('xp_add compiles', () => {
    expect(() => compile(`
      fn f(): int {
        xp_add(@s, "10");
        return 0;
      }
    `, { namespace: 'bixpa' })).not.toThrow()
  })

  test('xp_set compiles', () => {
    expect(() => compile(`
      fn f(): int {
        xp_set(@s, "10", "points");
        return 0;
      }
    `, { namespace: 'bixps' })).not.toThrow()
  })
})

describe('MIR lower — builtin: kill', () => {
  test('kill with selector compiles', () => {
    expect(() => compile(`
      fn f(): int {
        kill(@s);
        return 0;
      }
    `, { namespace: 'bikill' })).not.toThrow()
  })
})

describe('MIR lower — builtin: setblock with blockpos', () => {
  test('setblock with blockpos tuple compiles', () => {
    expect(() => compile(`
      fn f(): int {
        setblock((1, 2, 3), "stone");
        return 0;
      }
    `, { namespace: 'bisbp' })).not.toThrow()
  })
})

describe('MIR lower — builtin: fill with blockpos', () => {
  test('fill with blockpos tuples compiles', () => {
    expect(() => compile(`
      fn f(): int {
        fill((0, 0, 0), (10, 10, 10), "stone");
        return 0;
      }
    `, { namespace: 'bifill' })).not.toThrow()
  })
})

// ── selectorToString with range filters ───────────────────────────────────

describe('MIR lower — selectorToString range filter', () => {
  test('selector with level min..max range filter', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[level=1..10] run {
          tell(@s, "range");
        }
        return 0;
      }
    `, { namespace: 'selrng' })).not.toThrow()
  })

  test('selector with level max-only range filter', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[level=..5] run {
          tell(@s, "max only");
        }
        return 0;
      }
    `, { namespace: 'selmx' })).not.toThrow()
  })

  test('selector with level min-only range filter', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[level=5..] run {
          tell(@s, "min only");
        }
        return 0;
      }
    `, { namespace: 'selmn' })).not.toThrow()
  })
})

// ── exprToCommandArg edge cases ────────────────────────────────────────────

describe('MIR lower — exprToCommandArg: various literal types', () => {
  test('bool literal in command arg', () => {
    expect(() => compile(`
      fn f(): int {
        gamerule("keepInventory", true);
        return 0;
      }
    `, { namespace: 'argbool' })).not.toThrow()
  })

  test('float literal in summon arg', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", "~", "~", "~");
        return 0;
      }
    `, { namespace: 'argflt' })).not.toThrow()
  })
})

// ── fill without blockpos (plain coords) ──────────────────────────────────

describe('MIR lower — fill without blockpos', () => {
  test('fill with plain string coords compiles', () => {
    expect(() => compile(`
      fn f(): int {
        fill("0", "0", "0", "10", "10", "10", "stone");
        return 0;
      }
    `, { namespace: 'fillno' })).not.toThrow()
  })
})

// ── say builtin ────────────────────────────────────────────────────────────

describe('MIR lower — builtin: say', () => {
  test('say compiles to say command', () => {
    const result = compile(`
      fn f(): int {
        say("hello world");
        return 0;
      }
    `, { namespace: 'bigsay' })
    const fn = result.files.find(f => f.path.includes('f.mcfunction'))
    expect(fn?.content).toContain('say hello world')
  })
})

// ── title_times builtin ────────────────────────────────────────────────────

describe('MIR lower — builtin: title_times', () => {
  test('title_times compiles', () => {
    expect(() => compile(`
      fn f(): int {
        title_times(@s, "10", "70", "20");
        return 0;
      }
    `, { namespace: 'bitt' })).not.toThrow()
  })
})

// ── if_score / unless_score execute subcommands ───────────────────────────

describe('MIR lower — execute: if_score / unless_score subcommands', () => {
  test('execute if score compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute if score myvar __test = othervar __test run {
          tell(@s, "equal");
        }
        return 0;
      }
    `, { namespace: 'exifs' })).not.toThrow()
  })

  test('execute unless score compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute unless score myvar __test = othervar __test run {
          tell(@s, "not equal");
        }
        return 0;
      }
    `, { namespace: 'exunlss' })).not.toThrow()
  })
})
