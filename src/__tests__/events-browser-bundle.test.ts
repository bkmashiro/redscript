/**
 * Browser-bundle smoke for event manifest imports.
 *
 * The online IDE bundles redscript-mc for a browser target and stubs Node builtins.
 * Event metadata is imported during compiler module initialization, so it must not
 * call Node-only path helpers at import time.
 */

describe('events browser-bundle compatibility', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('path')
  })

  test('event type registry loads when Node path is stubbed like the browser IDE bundle', () => {
    jest.resetModules()
    jest.doMock('path', () => ({}))

    jest.isolateModules(() => {
      const { EVENT_TYPES } = require('../events/types')
      expect(Object.keys(EVENT_TYPES)).toContain('PlayerJoin')
      expect(EVENT_TYPES.PlayerJoin.runtimeAssets).toEqual(['src/stdlib/events.mcrs'])
    })
  })
})
