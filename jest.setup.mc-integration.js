// Retry flaky live Paper/TestHarness integration tests without using the
// unsupported Jest config-level `retryTimes` key.
jest.retryTimes(2)

// Live Paper tests emit many success breadcrumbs. Keep default CI/local output
// quiet and allow opt-in diagnostics with MC_VERBOSE=1.
require('./src/test-utils/mc-integration-console').installMcIntegrationConsoleFilter()
