import { compile } from './compile';
const result = compile(`
  fn test_get() {
    let h: int = scoreboard_get("enemy1", #health)
    scoreboard_set("#out", "obj", h)
  }
`, { namespace: 'test_ns' });
(result.files ?? []).forEach((f: any) => {
  if (f.path.includes('test_get')) {
    console.log(f.content);
  }
});
