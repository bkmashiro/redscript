function isVerbose(env) {
  const value = env && env.MC_VERBOSE
  if (value == null) return false
  return !['', '0', 'false', 'off', 'no'].includes(String(value).toLowerCase())
}

function installMcIntegrationConsoleFilter({ env = process.env, consoleObj = console } = {}) {
  if (isVerbose(env)) return

  const originalLog = consoleObj.log.bind(consoleObj)
  consoleObj.log = () => {}

  return () => {
    consoleObj.log = originalLog
  }
}

module.exports = {
  installMcIntegrationConsoleFilter,
}
