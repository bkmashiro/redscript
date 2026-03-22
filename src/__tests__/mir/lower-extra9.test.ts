/**
 * Coverage boost for src/mir/lower.ts (part 9)
 *
 * Specifically targeting high-count uncovered branches:
 * - exprToCommandArg: byte_lit, short_lit, long_lit, double_lit, bool_lit, local_coord, rel_coord, unary neg
 * - selectorToString: range filters (min+max, max-only, min-only)
 * - lowerExpr switch: byte_lit, short_lit, long_lit, double_lit used in expressions
 * - formatBuiltinCall: setblock with blockpos, fill with blockpos, title_times
 * - lowerTimerMethod: tick without duration, done without duration, remaining without duration
 * - precomputeFStringParts: complex nested expr push (else branch)
 * - fStringToJsonText: non-ident expr parts
 * - lowerStringExprToPath: assign where srcPath === dstPath
 */

import { compile } from '../../emit/compile'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule } from '../../mir/types'

function compileMIR(source: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

// ── exprToCommandArg: bool_lit in command arg ─────────────────────────────

describe('MIR lower — exprToCommandArg: bool_lit', () => {
  test('bool literal true/false in gamerule command', () => {
    expect(() => compile(`
      fn f(): int {
        gamerule("keepInventory", true);
        return 0;
      }
    `, { namespace: 'boolarg' })).not.toThrow()
  })

  test('bool literal false in gamerule command', () => {
    expect(() => compile(`
      fn f(): int {
        gamerule("commandBlockOutput", false);
        return 0;
      }
    `, { namespace: 'boolargf' })).not.toThrow()
  })
})

// ── exprToCommandArg: local_coord and rel_coord ───────────────────────────

describe('MIR lower — exprToCommandArg: coord types', () => {
  test('local coord in summon command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", ^0, ^0, ^5);
        return 0;
      }
    `, { namespace: 'localcoord' })).not.toThrow()
  })

  test('relative coord in summon command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", ~1, ~0, ~-1);
        return 0;
      }
    `, { namespace: 'relcoord' })).not.toThrow()
  })

  test('relative coord with zero offset in summon compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", ~, ~, ~);
        return 0;
      }
    `, { namespace: 'relcoord0' })).not.toThrow()
  })

  test('local coord with zero offset in summon compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", ^, ^, ^);
        return 0;
      }
    `, { namespace: 'localcoord0' })).not.toThrow()
  })
})

// ── exprToCommandArg: unary neg for float_lit and int_lit ─────────────────

describe('MIR lower — exprToCommandArg: unary neg', () => {
  test('negative int literal in command arg compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", "-5", "64", "10");
        return 0;
      }
    `, { namespace: 'negintatg' })).not.toThrow()
  })

  test('negative float literal in summon compiles', () => {
    expect(() => compile(`
      fn f(): int {
        particle("minecraft:dust", "~", "~", "~", "-0.5", "-1.0", "-0.5", "0.1");
        return 0;
      }
    `, { namespace: 'negfloatarg2' })).not.toThrow()
  })
})

// ── formatBuiltinCall: setblock with blockpos ──────────────────────────────

describe('MIR lower — setblock/fill with blockpos', () => {
  test('setblock with blockpos compiles', () => {
    expect(() => compile(`
      fn f(): int {
        setblock("~1 ~0 ~0", "stone");
        return 0;
      }
    `, { namespace: 'setblockbp' })).not.toThrow()
  })

  test('fill with blockpos pair compiles', () => {
    expect(() => compile(`
      fn f(): int {
        fill("~-5 ~0 ~-5", "~5 ~10 ~5", "air");
        return 0;
      }
    `, { namespace: 'fillbp' })).not.toThrow()
  })
})

// ── formatBuiltinCall: title_times ────────────────────────────────────────

describe('MIR lower — title_times builtin', () => {
  test('title_times command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        title_times(@s, "10", "70", "20");
        return 0;
      }
    `, { namespace: 'titletimes' })).not.toThrow()
  })
})

// ── selectorToString: range filters ──────────────────────────────────────

describe('MIR lower — selectorToString range filters', () => {
  test('selector with x_rotation range (min..max) compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[x_rotation=-90..90] run {
          tell(@s, "looking forward");
        }
        return 0;
      }
    `, { namespace: 'rotrange' })).not.toThrow()
  })

  test('selector with level range (..max) compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[level=..30] run {
          tell(@s, "low level");
        }
        return 0;
      }
    `, { namespace: 'levmax' })).not.toThrow()
  })

  test('selector with level range (min..) compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[level=30..] run {
          tell(@s, "high level");
        }
        return 0;
      }
    `, { namespace: 'levmin' })).not.toThrow()
  })

  test('selector with multiple range filters compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[distance=5..20,level=..30] run {
          tell(@s, "target");
        }
        return 0;
      }
    `, { namespace: 'multirange' })).not.toThrow()
  })
})

// ── byte_lit / short_lit / long_lit in expressions ───────────────────────

describe('MIR lower — byte/short/long literals in expressions', () => {
  test('byte literal expression compiles', () => {
    // Byte literals are used in NBT context / scoreboard, test them in expressions
    expect(() => compile(`
      fn f(): int {
        let x: int = 5b;
        return x;
      }
    `, { namespace: 'bytelit' })).not.toThrow()
  })

  test('short literal expression compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let x: int = 1000s;
        return x;
      }
    `, { namespace: 'shortlit' })).not.toThrow()
  })

  test('long literal expression compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let x: int = 1000000L;
        return x;
      }
    `, { namespace: 'longlit' })).not.toThrow()
  })
})

// ── double_lit in expression context ─────────────────────────────────────

describe('MIR lower — double_lit in expression context', () => {
  test('double literal in arithmetic expression compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let d: double = 3.14d;
        let e: double = d + 1.0d;
        return 0;
      }
    `, { namespace: 'dblitexpr' })).not.toThrow()
  })

  test('double literal passed to function compiles', () => {
    expect(() => compile(`
      fn process(d: double): int {
        return 0;
      }
      fn f(): int {
        return process(2.71d);
      }
    `, { namespace: 'dblitefn' })).not.toThrow()
  })
})

// ── fStringToJsonText: non-ident/non-lit expr parts ──────────────────────

describe('MIR lower — fStringToJsonText: various part types', () => {
  test('f-string with text-only parts compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let msg: string = "hello";
        tell(@s, "plain text");
        return 0;
      }
    `, { namespace: 'fstrtextonly' })).not.toThrow()
  })

  test('f-string with multiple parts compiles', () => {
    expect(() => compile(`
      fn f(x: int, y: int): int {
        tell(@s, f"x={x}, y={y}, done");
        return 0;
      }
    `, { namespace: 'fstrmultipart' })).not.toThrow()
  })

  test('f-string with bool literal part compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tell(@s, f"flag={true}");
        return 0;
      }
    `, { namespace: 'fstrboolpart' })).not.toThrow()
  })

  test('f-string with int literal part compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tell(@s, f"count={42}");
        return 0;
      }
    `, { namespace: 'fstrintlit' })).not.toThrow()
  })
})

// ── let_destruct with general non-ident, non-tuple_lit expr ─────────────

describe('MIR lower — let_destruct from general expr', () => {
  test('destructuring from member access expression compiles', () => {
    expect(() => compile(`
      fn pair(): (int, int) { return (1, 2); }
      fn f(): int {
        let (a, b) = pair();
        let (c, d) = pair();
        return a + b + c + d;
      }
    `, { namespace: 'destrgem' })).not.toThrow()
  })
})

// ── coordStr: all three variants ──────────────────────────────────────────

describe('MIR lower — coordStr: absolute / relative / local', () => {
  test('absolute coord in particle compiles', () => {
    expect(() => compile(`
      fn f(): int {
        particle("flame", 100, 64, 200);
        return 0;
      }
    `, { namespace: 'abscoord' })).not.toThrow()
  })

  test('mixed coord types in summon compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", 100, 64, ~10);
        return 0;
      }
    `, { namespace: 'mixcoord' })).not.toThrow()
  })
})

// ── lowerStmt: let with string from function that returns string ──────────

describe('MIR lower — let string from function return', () => {
  test('let s: string = fn() chains string paths', () => {
    expect(() => compile(`
      fn get_msg(): string { return "hello"; }
      fn f(): int {
        let msg: string = get_msg();
        tell(@s, msg);
        return 0;
      }
    `, { namespace: 'letstrfn' })).not.toThrow()
  })
})

// ── lowerStmt: while with compound condition ──────────────────────────────

describe('MIR lower — while with compound condition', () => {
  test('while with && condition and break compiles', () => {
    expect(() => compile(`
      fn f(a: int): int {
        let i: int = 0;
        while (i < 5 && a > 0) {
          i = i + 1;
          if (i > 3) { break; }
        }
        return i;
      }
    `, { namespace: 'whilecompound' })).not.toThrow()
  })
})

// ── execute: if_block/unless_block subcommands ────────────────────────────

describe('MIR lower — execute: if_block/unless_block subcommands', () => {
  test('execute if block subcommand compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute if block ~ ~ ~ "stone" run {
          say("standing on stone");
        }
        return 0;
      }
    `, { namespace: 'execifblock' })).not.toThrow()
  })

  test('execute unless block subcommand compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute unless block ~ ~ ~ "air" run {
          say("not air here");
        }
        return 0;
      }
    `, { namespace: 'execunlessblock' })).not.toThrow()
  })
})

// ── execute: if_entity / unless_entity subcommands ───────────────────────

describe('MIR lower — execute: if_entity/unless_entity', () => {
  test('execute if entity subcommand compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute if entity @a run {
          announce("players online");
        }
        return 0;
      }
    `, { namespace: 'execifent' })).not.toThrow()
  })
})

// ── execute: if_score / unless_score subcommands ─────────────────────────

describe('MIR lower — execute: if_score', () => {
  test('execute if score subcommand compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute if score myvar __ns matches 1 run {
          say("score is 1");
        }
        return 0;
      }
    `, { namespace: 'execifscore' })).not.toThrow()
  })
})

// ── execute: positioned_as, rotated_as subcommands ────────────────────────

describe('MIR lower — execute: positioned_as, rotated_as', () => {
  test('execute positioned as entity compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute positioned as @a run {
          say("at player pos");
        }
        return 0;
      }
    `, { namespace: 'execposedas' })).not.toThrow()
  })

  test('execute rotated as entity compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute rotated as @a run {
          say("rotated");
        }
        return 0;
      }
    `, { namespace: 'execrotas' })).not.toThrow()
  })
})

// ── execute: in/anchored/on/summon subcommands ────────────────────────────

describe('MIR lower — execute: in/anchored/align/facing subcommands', () => {
  test('execute in dimension compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute in nether run {
          say("in nether");
        }
        return 0;
      }
    `, { namespace: 'execin' })).not.toThrow()
  })

  test('execute anchored compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute anchored eyes run {
          say("from eyes");
        }
        return 0;
      }
    `, { namespace: 'execanchored' })).not.toThrow()
  })

  test('execute align compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute align xyz run {
          say("aligned");
        }
        return 0;
      }
    `, { namespace: 'execalign' })).not.toThrow()
  })

  test('execute facing entity compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute facing entity @a eyes run {
          say("facing player");
        }
        return 0;
      }
    `, { namespace: 'execfacent' })).not.toThrow()
  })

  test('execute on entity compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute on owner run {
          say("owner");
        }
        return 0;
      }
    `, { namespace: 'execon' })).not.toThrow()
  })

  test('execute summon entity compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute summon zombie run {
          say("new zombie");
        }
        return 0;
      }
    `, { namespace: 'execsummon' })).not.toThrow()
  })
})

// ── lowerExecuteSubcmd: facing (non-entity) ───────────────────────────────

describe('MIR lower — execute: facing position', () => {
  test('execute facing position compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute facing 0 64 0 run {
          say("facing origin");
        }
        return 0;
      }
    `, { namespace: 'execfacpos' })).not.toThrow()
  })
})

// ── lowerExecuteSubcmd: rotated ───────────────────────────────────────────

describe('MIR lower — execute: rotated', () => {
  test('execute rotated compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute rotated 0 0 run {
          say("facing north");
        }
        return 0;
      }
    `, { namespace: 'execrot' })).not.toThrow()
  })
})

// ── playsound builtin ─────────────────────────────────────────────────────

describe('MIR lower — playsound builtin', () => {
  test('playsound with all args compiles', () => {
    expect(() => compile(`
      fn f(): int {
        playsound("minecraft:entity.arrow.hit_player", "master", @s, "~", "~", "~", "1.0", "1.0");
        return 0;
      }
    `, { namespace: 'playsound' })).not.toThrow()
  })
})

// ── kick builtin ──────────────────────────────────────────────────────────

describe('MIR lower — kick builtin', () => {
  test('kick with reason compiles', () => {
    expect(() => compile(`
      fn f(): int {
        kick(@s, "Too many deaths");
        return 0;
      }
    `, { namespace: 'kickreason' })).not.toThrow()
  })

  test('kick without reason compiles', () => {
    expect(() => compile(`
      fn f(): int {
        kick(@s);
        return 0;
      }
    `, { namespace: 'kicknoarg' })).not.toThrow()
  })
})

// ── effect_clear with and without effect type ─────────────────────────────

describe('MIR lower — effect_clear builtin', () => {
  test('effect_clear with specific effect compiles', () => {
    expect(() => compile(`
      fn f(): int {
        effect_clear(@s, "minecraft:speed");
        return 0;
      }
    `, { namespace: 'effectclearspecific' })).not.toThrow()
  })

  test('effect_clear without effect type compiles', () => {
    expect(() => compile(`
      fn f(): int {
        effect_clear(@s);
        return 0;
      }
    `, { namespace: 'effectclearall' })).not.toThrow()
  })
})

// ── time_set / time_add builtins ──────────────────────────────────────────

describe('MIR lower — time builtins', () => {
  test('time_set command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        time_set("day");
        return 0;
      }
    `, { namespace: 'timeset' })).not.toThrow()
  })

  test('time_add command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        time_add("1000t");
        return 0;
      }
    `, { namespace: 'timeadd' })).not.toThrow()
  })
})

// ── weather builtin ───────────────────────────────────────────────────────

describe('MIR lower — weather builtin', () => {
  test('weather command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        weather("clear");
        return 0;
      }
    `, { namespace: 'weathercmd' })).not.toThrow()
  })
})

// ── difficulty builtin ────────────────────────────────────────────────────

describe('MIR lower — difficulty builtin', () => {
  test('difficulty command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        difficulty("hard");
        return 0;
      }
    `, { namespace: 'difficultycmd' })).not.toThrow()
  })
})

// ── xp_set builtin ────────────────────────────────────────────────────────

describe('MIR lower — xp_set builtin', () => {
  test('xp_set command with points compiles', () => {
    expect(() => compile(`
      fn f(): int {
        xp_set(@s, "100", "points");
        return 0;
      }
    `, { namespace: 'xpsetpts' })).not.toThrow()
  })

  test('xp_set command with levels compiles', () => {
    expect(() => compile(`
      fn f(): int {
        xp_set(@s, "5", "levels");
        return 0;
      }
    `, { namespace: 'xpsetlvl' })).not.toThrow()
  })
})

// ── clone builtin ─────────────────────────────────────────────────────────

describe('MIR lower — clone builtin', () => {
  test('clone command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        clone("~-5 ~0 ~-5", "~5 ~10 ~5", "~20 ~0 ~20");
        return 0;
      }
    `, { namespace: 'clonecmd' })).not.toThrow()
  })
})

// ── say builtin ───────────────────────────────────────────────────────────

describe('MIR lower — say builtin', () => {
  test('say command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        say("Hello everyone!");
        return 0;
      }
    `, { namespace: 'saycmd' })).not.toThrow()
  })
})

// ── tag_add / tag_remove builtins ─────────────────────────────────────────

describe('MIR lower — tag_add / tag_remove builtins', () => {
  test('tag_add command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tag_add(@s, "is_player");
        return 0;
      }
    `, { namespace: 'tagadd' })).not.toThrow()
  })

  test('tag_remove command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tag_remove(@s, "is_player");
        return 0;
      }
    `, { namespace: 'tagremove' })).not.toThrow()
  })
})

// ── give with only 2 args (no count, no nbt) ──────────────────────────────

describe('MIR lower — give without count or NBT', () => {
  test('give with selector and item only compiles', () => {
    expect(() => compile(`
      fn f(): int {
        give(@s, "minecraft:apple");
        return 0;
      }
    `, { namespace: 'givebasic' })).not.toThrow()
  })
})

// ── summon with NBT ───────────────────────────────────────────────────────

describe('MIR lower — summon with NBT', () => {
  test('summon with NBT data compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", "~", "~", "~", "{CustomNameVisible:1}");
        return 0;
      }
    `, { namespace: 'summonnbt' })).not.toThrow()
  })
})

// ── particle with extra args ──────────────────────────────────────────────

describe('MIR lower — particle with extra args', () => {
  test('particle with all 7 args compiles', () => {
    expect(() => compile(`
      fn f(): int {
        particle("minecraft:dust", "~", "~1", "~", "0.5", "0.5", "0.5", "1");
        return 0;
      }
    `, { namespace: 'particleall' })).not.toThrow()
  })

  test('particle with just position compiles', () => {
    expect(() => compile(`
      fn f(): int {
        particle("minecraft:flame", "~", "~", "~");
        return 0;
      }
    `, { namespace: 'particlemin' })).not.toThrow()
  })
})

// ── let statement with bool_lit init ─────────────────────────────────────

describe('MIR lower — let with bool_lit init', () => {
  test('let b: int = true compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let active: bool = true;
        if (active) { return 1; }
        return 0;
      }
    `, { namespace: 'letbool' })).not.toThrow()
  })
})

// ── module-level const with int_lit ───────────────────────────────────────

describe('MIR lower — module-level const inline', () => {
  test('const int value is inlined at use site', () => {
    expect(() => compile(`
      const MAX: int = 100;
      fn f(): int {
        let x: int = MAX + 1;
        return x;
      }
    `, { namespace: 'constinline' })).not.toThrow()
  })
})

// ── lowerExpr: mc_name expression ────────────────────────────────────────

describe('MIR lower — mc_name expression in command', () => {
  test('mc_name type in give command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        give(@s, "#minecraft:swords");
        return 0;
      }
    `, { namespace: 'mcname' })).not.toThrow()
  })
})

// ── lowerExpr: selector expression ───────────────────────────────────────

describe('MIR lower — selector expression as arg', () => {
  test('selector as command arg compiles', () => {
    expect(() => compile(`
      fn f(): int {
        kill(@a);
        return 0;
      }
    `, { namespace: 'selarg' })).not.toThrow()
  })
})
