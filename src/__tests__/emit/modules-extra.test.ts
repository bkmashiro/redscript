import { compileModules } from '../../emit/modules'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

describe('emit/modules: extra branch coverage', () => {
  test('rewrites imported calls inside impl methods', () => {
    const result = compileModules([
      {
        name: 'util',
        source: `
          module util;
          export fn add_one(n: int): int { return n + 1; }
          export fn nonzero(n: int): bool { return n != 0; }
        `,
      },
      {
        name: 'main',
        source: `
          import util::add_one;
          import util::nonzero;

          struct Counter { value: int }

          impl Counter {
            fn bump(self): Counter {
              let next: int = add_one(self.value);
              if (nonzero(next)) {
                return Counter { value: next };
              } else {
                return Counter { value: 0 };
              }
            }
          }

          fn main_fn(): int {
            let c: Counter = Counter { value: 1 };
            let d: Counter = c.bump();
            return d.value;
          }
        `,
      },
    ], { namespace: 'mods' })

    const bump = getFile(result.files, 'counter/bump.mcfunction')
    expect(bump).toBeDefined()
    expect(bump).toContain('function mods:util/add_one')
    expect(bump).toContain('function mods:util/nonzero')
  })

  test('module-local coroutine and schedule decorators use default arguments', () => {
    const result = compileModules([
      {
        name: 'jobs',
        source: `
          module jobs;

          @coroutine
          fn worker() {
            let i: int = 0;
            while (i < 2) {
              i = i + 1;
            }
          }

          @schedule
          fn later() {}
        `,
      },
    ], { namespace: 'mods' })

    const tickJson = getFile(result.files, 'tick.json')
    const scheduleWrapper = getFile(result.files, '_schedule_jobs/later.mcfunction')

    expect(tickJson).toBeDefined()
    expect(JSON.parse(tickJson!).values).toContain('mods:_coro_jobs/worker_tick')
    expect(scheduleWrapper).toBe('schedule function mods:jobs/later 1t\n')
  })
})
