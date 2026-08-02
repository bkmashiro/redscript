// Retry flaky live Paper/TestHarness integration tests without using the
// unsupported Jest config-level `retryTimes` key.
jest.retryTimes(2)

// Live Paper tests emit many success breadcrumbs. Keep default CI/local output
// quiet and allow opt-in diagnostics with MC_VERBOSE=1.
require('./src/test-utils/mc-integration-console').installMcIntegrationConsoleFilter()

const {
  assertMcIntegrationConfiguration,
  probeMcIntegrationPrerequisites,
} = require('./src/test-utils/mc-live-prerequisites')

// Configuration errors must fail before any integration test body can run.
assertMcIntegrationConfiguration()

const strictLive = process.env.MC_INTEGRATION_REQUIRE_ONLINE === 'true'
  || process.env.MC_INTEGRATION_REQUIRE_BOT === 'true'

if (strictLive) {
  // Check before suite-local setup so strict runs cannot silently turn into
  // passing no-op tests when Paper or TestBot is unavailable.
  beforeAll(async () => {
    await probeMcIntegrationPrerequisites()
  })

  // Re-check after the suite so a server/bot disappearing during the run is a
  // failed live proof rather than an apparently successful partial run.
  afterAll(async () => {
    await probeMcIntegrationPrerequisites()
  })
}
