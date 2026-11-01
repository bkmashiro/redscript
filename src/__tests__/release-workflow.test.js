const fs = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')

const workflow = () => YAML.parse(fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/publish-npm.yml'), 'utf8'))

test('npm publication is not triggered by ordinary CI completion', () => {
  expect(workflow().on.workflow_run).toBeUndefined()
  expect(workflow().on.push.tags).toContain('v[0-9]*')
})

test('manual publication is explicit and defaults to dry-run', () => {
  const inputs = workflow().on.workflow_dispatch.inputs
  expect(inputs.publish.type).toBe('boolean')
  expect(inputs.publish.default).toBe(false)
  expect(inputs.tag.type).toBe('string')
})

test('only the publication job receives OIDC and it consumes the verified artifact', () => {
  const jobs = workflow().jobs
  expect(jobs.verify.permissions['id-token']).toBeUndefined()
  expect(jobs.publish.permissions['id-token']).toBe('write')
  expect(jobs.publish.needs).toBe('verify')
  const checkout = jobs.publish.steps.find(step => step.uses?.startsWith('actions/checkout@'))
  expect(checkout.with.ref).toBe('${{ needs.verify.outputs.sha }}')
  const download = jobs.publish.steps.find(step => step.uses?.startsWith('actions/download-artifact@'))
  expect(download.with.name).toBe('${{ needs.verify.outputs.artifact_name }}')
  const publication = jobs.publish.steps.find(step => step.run === 'node scripts/release-package.js publish')
  expect(publication.env?.NODE_AUTH_TOKEN).toBe('')
})
