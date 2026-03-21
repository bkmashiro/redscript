import { compile } from './compile';
const MATH_SRC = require('fs').readFileSync('./src/stdlib/math.mcrs', 'utf-8');
const COMBAT_SRC = require('fs').readFileSync('./src/stdlib/combat.mcrs', 'utf-8');

const result = compile(`
  namespace stdlib_combat_test

  fn test_apply_damage() {
    scoreboard_set("#enemy1", #health, 100);
    apply_damage("enemy1", 30);
  }

  fn test_apply_damage_clamp() {
    scoreboard_set("#enemy2", #health, 20);
    apply_damage("enemy2", 50);
  }
`, { namespace: 'stdlib_combat_test', librarySources: [MATH_SRC, COMBAT_SRC] });
(result.files ?? []).forEach((f: any) => {
  if (!f.path.includes('pack.mcmeta') && !f.path.includes('minecraft/tags')) {
    console.log('=== ' + f.path + ' ===');
    console.log(f.content);
  }
});
