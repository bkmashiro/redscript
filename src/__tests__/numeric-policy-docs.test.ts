import * as fs from 'fs'
import * as path from 'path'

describe('numeric policy documentation', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')

  it('documents the public tuner workflow in README and changelog', () => {
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf-8')
    const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf-8')

    expect(readme).toContain('redscript tune --adapter sqrt-newton --range 10000:400000 --samples 128 --out tuned.mcrs --manifest-out tuned.tune.json')
    expect(readme).toContain('reviewable `.mcrs` overlay')
    expect(readme).toContain('`.tune.json` manifest')
    expect(changelog).toContain('`redscript tune --adapter sqrt-newton --range 10000:400000 --samples 128 --out tuned.mcrs --manifest-out tuned.tune.json`')
  })

  it('records that true IEEE double multiplication should be a separate future helper', () => {
    const roadmap = fs.readFileSync(path.join(repoRoot, 'docs/plans/compiler-mc-hardening-roadmap.md'), 'utf-8')
    const policy = fs.readFileSync(path.join(repoRoot, 'docs/plans/numeric-scale-policy.md'), 'utf-8')
    const mathHpDocs = fs.readFileSync(path.join(repoRoot, 'docs/stdlib/math_hp.md'), 'utf-8')

    expect(roadmap).toContain('Decision: keep `double_mul` on the reviewed macro-scale tier')
    expect(roadmap).toContain('A future true-IEEE multiplication path, if implemented, should be exposed as a separate opt-in helper such as `double_mul_ieee`')
    expect(policy).toContain('Do not silently replace `double_mul` with an unproven true-IEEE path')
    expect(mathHpDocs).toContain('A future true-IEEE multiply should be added as a separate opt-in helper rather than silently changing this contract.')
  })
})
