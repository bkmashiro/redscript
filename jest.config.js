module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Retry flaky MC integration tests (depend on live server)
  projects: [
    {
      displayName: 'mc-integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: [
        '**/__tests__/mc-integration.test.ts',
        '**/__tests__/mc-integration/**/*.test.ts',
      ],
      testEnvironmentOptions: {},
      retryTimes: 2,
    },
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testPathIgnorePatterns: ['mc-integration.test.ts', 'mc-integration/'],
    },
  ],
};
