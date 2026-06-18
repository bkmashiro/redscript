const tsJestTransform = {
  '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }],
}

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  projects: [
    {
      displayName: 'mc-integration',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: [
        '**/__tests__/mc-integration.test.ts',
        '**/__tests__/mc-integration/**/*.test.ts',
      ],
      testEnvironmentOptions: {},
      setupFilesAfterEnv: ['<rootDir>/jest.setup.mc-integration.js'],
      transform: tsJestTransform,
    },
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testPathIgnorePatterns: ['mc-integration.test.ts', 'mc-integration/'],
      transform: tsJestTransform,
    },
  ],
}
