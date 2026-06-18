// Retry flaky live Paper/TestHarness integration tests without using the
// unsupported Jest config-level `retryTimes` key.
jest.retryTimes(2)
