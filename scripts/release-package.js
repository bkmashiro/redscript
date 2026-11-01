#!/usr/bin/env node
// One package, one verified tarball. Publication is CI/OIDC-only and tag-bound.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const cp = require('node:child_process')
const { readPackEntry, assertPackFilePolicy } = require('./npm-pack-entry')
const ROOT = path.resolve(__dirname, '..')
const REGISTRY = 'https://registry.npmjs.org'
const capture = (bin, args) => cp.execFileSync(bin, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const run = (bin, args) => cp.execFileSync(bin, args, { cwd: ROOT, stdio: 'inherit' })

function validateRequest(input) {
  if (input.name !== 'redscript-mc' || !/^\d+\.\d+\.\d+$/.test(input.version)) throw new Error('Expected redscript-mc with a stable semantic version')
  if (!['push', 'workflow_dispatch'].includes(input.event)) throw new Error('Only version-tag pushes and explicit dispatch are release events')
  if (!/^[a-f0-9]{40}$/.test(input.sha)) throw new Error('Invalid checkout commit')
  const publish = input.event === 'push' || input.publish === true || input.publish === 'true'
  if (input.event === 'push' && !input.ref?.startsWith('refs/tags/')) throw new Error('A branch push cannot publish')
  const tag = input.event === 'push' ? input.ref.slice('refs/tags/'.length) : input.tag || ''
  if ((publish || tag) && tag !== `v${input.version}`) throw new Error('Release tag must exactly match package version')
  if (tag && input.tagSha !== input.sha) throw new Error('Checkout does not match the version tag commit')
  if (publish && !input.onMain) throw new Error('Publish commit must be contained in origin/main')
  if (input.expectedSha && input.expectedSha !== input.sha) throw new Error('Publish checkout differs from verified commit')
  return { name: input.name, version: input.version, sha: input.sha, tag, publish }
}

function context(env = process.env) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const event = env.GITHUB_EVENT_NAME || 'workflow_dispatch'
  const tag = event === 'push' ? (env.GITHUB_REF || '').replace(/^refs\/tags\//, '') : env.RELEASE_TAG || ''
  const sha = capture('git', ['rev-parse', 'HEAD'])
  const tagSha = tag && tag === `v${pkg.version}` ? capture('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]) : undefined
  const onMain = cp.spawnSync('git', ['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main'], { cwd: ROOT }).status === 0
  return validateRequest({ name: pkg.name, version: pkg.version, event, ref: env.GITHUB_REF,
    publish: env.RELEASE_PUBLISH, tag, tagSha, sha, onMain, expectedSha: env.RELEASE_EXPECTED_SHA })
}

async function publishedVersion(name, version, fetcher = fetch) {
  const response = await fetcher(`${REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, { signal: AbortSignal.timeout(20000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Registry lookup failed: HTTP ${response.status}`)
  const metadata = await response.json()
  if (metadata.name !== name || metadata.version !== version) throw new Error('Registry returned unexpected package identity')
  return metadata
}

function hashes(bytes) {
  return { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), integrity: `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}` }
}

function verifyReceipt(receipt, ctx, bytes) {
  if (receipt.name !== ctx.name || receipt.version !== ctx.version || receipt.commit !== ctx.sha || receipt.tag !== ctx.tag) throw new Error('Release receipt identity/commit mismatch')
  if (receipt.filename !== `${ctx.name}-${ctx.version}.tgz`) throw new Error('Unexpected tarball filename')
  const actual = hashes(bytes)
  if (receipt.integrity !== actual.integrity || receipt.sha256 !== actual.sha256) throw new Error('Tarball differs from verified artifact')
}

function requireOidc(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('Actual publication requires GitHub Actions OIDC')
  if (env.NODE_AUTH_TOKEN || env.NPM_TOKEN) throw new Error('Do not mix token publication with OIDC')
}

function outputs(values) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''))
}

async function main() {
  const phase = process.argv[2]
  const ctx = context()
  if (phase === 'plan') {
    const exists = await publishedVersion(ctx.name, ctx.version)
    outputs({ sha: ctx.sha, version: ctx.version, tag: ctx.tag, publish: ctx.publish, needs_release: !exists })
    console.log(JSON.stringify({ ...ctx, registry: exists ? 'already-present; no publication needed' : 'absent' }))
    return
  }
  const directory = process.env.RELEASE_DIRECTORY || (process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'redscript-release'))
  if (!directory) throw new Error('RELEASE_DIRECTORY is required')
  const dir = path.resolve(directory)
  if (phase === 'pack') {
    if (cp.spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: ROOT }).status !== 0) {
      throw new Error('Pack only clean tracked source; receipt must describe the checked-out commit')
    }
    fs.mkdirSync(dir, { recursive: true })
    const entry = readPackEntry(JSON.parse(capture('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir])))
    assertPackFilePolicy(entry)
    if (entry.filename !== `${ctx.name}-${ctx.version}.tgz`) throw new Error('Unexpected packed filename')
    const receipt = { name: ctx.name, version: ctx.version, commit: ctx.sha, tag: ctx.tag, filename: entry.filename,
      ...hashes(fs.readFileSync(path.join(dir, entry.filename))) }
    fs.writeFileSync(path.join(dir, 'release-manifest.json'), JSON.stringify(receipt, null, 2) + '\n')
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${receipt.sha256}  ${receipt.filename}\n`)
    outputs({ tarball: path.join(dir, entry.filename) })
    console.log(JSON.stringify(receipt))
    return
  }
  if (!['check', 'publish'].includes(phase)) throw new Error('Expected plan, pack, check or publish phase')
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'release-manifest.json'), 'utf8'))
  const tarball = path.join(dir, `${ctx.name}-${ctx.version}.tgz`)
  verifyReceipt(receipt, ctx, fs.readFileSync(tarball))
  const args = ['publish', tarball, '--access', 'public', '--tag', 'latest', '--registry', REGISTRY, '--ignore-scripts']
  if (phase === 'check') {
    const report = readPackEntry(JSON.parse(capture('npm', [...args, '--dry-run', '--provenance=false', '--json'])))
    assertPackFilePolicy(report)
    if (report.integrity !== receipt.integrity) throw new Error('npm dry-run would publish different bytes')
    console.log('NPM DRY-RUN VERIFIED: exact tarball integrity and file policy; registry unchanged')
    return
  }
  const existing = await publishedVersion(ctx.name, ctx.version)
  if (existing) {
    if (existing.dist?.integrity !== receipt.integrity) throw new Error('Version exists with a different tarball; never overwrite')
    console.log('Exact verified tarball is already published; skipping write')
    return
  }
  if (!ctx.publish) {
    run('npm', [...args, '--dry-run', '--provenance=false'])
    console.log('Dry run complete; registry unchanged')
    return
  }
  requireOidc()
  // Never retry this write automatically. A failed follow-up read can be registry propagation.
  run('npm', [...args, '--provenance'])
  // npm can accept a publish before asynchronous processing makes the version visible.
  // Engineering confirmation window: ten minutes; individual requests retain their timeouts.
  // No registry write is retried while npm processes the accepted package.
  const confirmationDeadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < confirmationDeadline) {
    const metadata = await publishedVersion(ctx.name, ctx.version)
    if (metadata) {
      if (metadata.dist?.integrity !== receipt.integrity) throw new Error('Published registry integrity differs from the verified tarball')
      const response = await fetch(`${REGISTRY}/-/package/${ctx.name}/dist-tags`, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`Dist-tag verification failed: HTTP ${response.status}`)
      if ((await response.json()).latest === ctx.version) {
        console.log(`REGISTRY VERIFIED ${ctx.name}@${ctx.version} latest, integrity=${receipt.integrity}`)
        return
      }
    }
    await new Promise(resolve => setTimeout(resolve, 10000))
  }
  throw new Error('Publish returned success, but registry reads have not converged; do not republish blindly')
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { validateRequest, publishedVersion, hashes, verifyReceipt, requireOidc }
