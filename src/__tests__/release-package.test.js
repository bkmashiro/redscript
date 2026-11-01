const { validateRequest, publishedVersion, hashes, verifyReceipt, requireOidc } = require('../../scripts/release-package')
const SHA = 'a'.repeat(40)
const base = { name: 'redscript-mc', version: '4.0.0', event: 'workflow_dispatch', sha: SHA, onMain: false }
const tagged = { ...base, event: 'push', ref: 'refs/tags/v4.0.0', tagSha: SHA, onMain: true }

test('manual invocation defaults to a dry run; matching tag push explicitly publishes', () => {
  expect(validateRequest(base)).toMatchObject({ publish: false, tag: '' })
  expect(validateRequest(tagged)).toMatchObject({ publish: true, tag: 'v4.0.0', sha: SHA })
  expect(validateRequest({ ...base, tag: 'v4.0.0', tagSha: SHA, publish: 'true', onMain: true }).publish).toBe(true)
})

test.each([
  { ...tagged, event: 'workflow_run' },
  { ...tagged, ref: 'refs/heads/main' },
  { ...tagged, ref: 'refs/tags/v4.0.1' },
  { ...tagged, tagSha: 'b'.repeat(40) },
  { ...tagged, onMain: false },
  { ...tagged, expectedSha: 'b'.repeat(40) },
  { ...base, publish: true, onMain: true },
  { ...tagged, name: 'another-package' },
  { ...tagged, sha: 'not-a-commit' },
])('rejects an unbound or unauthorized release request: %j', input => {
  expect(() => validateRequest(input)).toThrow()
})

test('publication requires OIDC without a competing token path', () => {
  expect(() => requireOidc({})).toThrow('OIDC')
  const env = { GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'test-only', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-only' }
  expect(() => requireOidc(env)).not.toThrow()
  expect(() => requireOidc({ ...env, NODE_AUTH_TOKEN: 'test-only-legacy' })).toThrow('mix token')
})

test('only a real 404 means absent; other registry failures remain failures', async () => {
  expect(await publishedVersion('redscript-mc', '4.0.0', async () => ({ status: 404 }))).toBeNull()
  for (const status of [401, 403, 429, 500]) {
    await expect(publishedVersion('redscript-mc', '4.0.0', async () => ({ status, ok: false }))).rejects.toThrow(`HTTP ${status}`)
  }
  await expect(publishedVersion('redscript-mc', '4.0.0', async () => { throw new Error('network failure') })).rejects.toThrow('network failure')
  await expect(publishedVersion('redscript-mc', '4.0.0', async () => ({ status: 200, ok: true, json: async () => ({ name: 'other', version: '4.0.0' }) }))).rejects.toThrow('identity')
})

test('receipt binds tarball bytes, package identity, tag and commit', () => {
  const bytes = Buffer.from('test-only archive')
  const ctx = validateRequest(tagged)
  const receipt = { name: ctx.name, version: ctx.version, commit: SHA, tag: ctx.tag, filename: 'redscript-mc-4.0.0.tgz', ...hashes(bytes) }
  expect(() => verifyReceipt(receipt, ctx, bytes)).not.toThrow()
  expect(() => verifyReceipt(receipt, ctx, Buffer.from('changed'))).toThrow('differs')
  expect(() => verifyReceipt({ ...receipt, commit: 'b'.repeat(40) }, ctx, bytes)).toThrow('mismatch')
  expect(() => verifyReceipt({ ...receipt, filename: '../outside.tgz' }, ctx, bytes)).toThrow('filename')
})
