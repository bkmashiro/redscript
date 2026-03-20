import { compile } from './src/emit/compile'
import { MCRuntime } from './src/runtime'
import * as fs from 'fs'

const MATH = fs.readFileSync('./src/stdlib/math.mcrs', 'utf-8')
const src = 'fn test_sin90(): int { return sin_fixed(90); }'
const NS = 'test'
const r = compile(src, {namespace: NS, librarySources:[MATH]})

// Check _math_init
const initFile = r.files.find((f: any) => f.path.includes('_math_init'))
if (initFile) {
  console.log('_math_init content:')
  console.log(initFile.content)
}

// Check a sin file
const sin2 = r.files.find((f: any) => f.path.includes('sin_fixed__then_2'))
if (sin2) {
  console.log('sin_fixed__then_2 content:')
  console.log(sin2.content)
}

const rt = new MCRuntime(NS)
for (const f of r.files) {
  if (!f.path.endsWith('.mcfunction')) continue
  const m = f.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
  if (!m) continue
  rt.loadFunction(m[1]+':'+m[2], f.content.split('\n'))
}
rt.execFunction('test:load')
rt.execFunction('test:test_sin90')
const val = rt.getScore('$ret', '__test')
console.log('sin_fixed(90) =', val, '(expected 1000)')

// Check storage
const storage = (rt as any).storage
console.log('Storage keys:', [...storage.keys()])
if (storage.has('math:tables')) {
  const t = storage.get('math:tables')
  console.log('math:tables keys:', Object.keys(t))
  if (t.sin) console.log('sin[0..5]:', t.sin.slice(0, 5), '...', 'sin[90]:', t.sin[90])
}
