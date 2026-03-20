import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../emit/compile'
import { MCRuntime } from '../../runtime'

const NS = 'test'
const OBJ = `__${NS}`

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/math.mcrs'),
  'utf-8',
)
const ODE_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/ode.mcrs'),
  'utf-8',
)

function makeRuntime(source: string, libs: string[] = [MATH_SRC]): MCRuntime {
  const result = compile(source, { namespace: NS, librarySources: libs })
  const rt = new MCRuntime(NS)
  for (const file of result.files) {
    if (!file.path.endsWith('.mcfunction')) continue
    const m = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!m) continue
    rt.loadFunction(`${m[1]}:${m[2]}`, file.content.split('\n'))
  }
  rt.execFunction(`${NS}:load`)
  return rt
}

function callAndGetRet(rt: MCRuntime, fnName: string): number {
  rt.execFunction(`${NS}:${fnName}`)
  return rt.getScore('$ret', OBJ)
}

describe('ode.mcrs — isolated runtime', () => {
  const rt = makeRuntime(`
    fn test_decay_y(): int {
      ode_run(1, 0, 10000, 1000, 10, 10000)
      return ode_get_y()
    }

    fn test_growth_y(): int {
      ode_run(2, 0, 10000, 1000, 5, 10000)
      return ode_get_y()
    }

    fn test_final_t(): int {
      ode_run(1, 2500, 10000, 1000, 10, 10000)
      return ode_get_t()
    }
  `, [MATH_SRC, ODE_SRC])

  test('decay stays near e^-1', () => {
    const val = callAndGetRet(rt, 'test_decay_y')
    expect(val).toBeGreaterThanOrEqual(3629)
    expect(val).toBeLessThanOrEqual(3729)
  })

  test('growth stays near e^0.5', () => {
    const val = callAndGetRet(rt, 'test_growth_y')
    expect(val).toBeGreaterThanOrEqual(16287)
    expect(val).toBeLessThanOrEqual(16687)
  })

  test('t advances by steps*h', () =>
    expect(callAndGetRet(rt, 'test_final_t')).toBe(12500))
})
