import { UILogger } from '../utils/cli/ui'
import { CacheManager } from '../utils/config/cache-manager'

export async function handleCacheClearCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  const cache = CacheManager.getInstance()

  try {
    cache.clear()
    ui.displaySuccess('✅ All cache cleared successfully!')
    ui.displayInfo('Next startup will re-check Claude installation and other cached values.')
  }
  catch (error) {
    ui.displayError(`❌ Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function handleCacheClearClaudeCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  const cache = CacheManager.getInstance()

  try {
    cache.clearClaudeInstallationCache()
    ui.displaySuccess('✅ Claude installation cache cleared!')
    ui.displayInfo('Next startup will re-check Claude installation.')
  }
  catch (error) {
    ui.displayError(`❌ Failed to clear Claude cache: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function handleCacheStatusCommand(options: { verbose?: boolean } = {}): Promise<void> {
  const ui = new UILogger(options.verbose)
  const cache = CacheManager.getInstance()

  try {
    const claudeInstalled = cache.isClaudeInstalled()
    const claudeVersion = cache.getClaudeVersion()
    const lastUpdateCheck = cache.getUpdateCheckTimestamp()

    ui.displayInfo('📦 Cache Status:')
    ui.displayInfo('')
    ui.displayInfo(`Claude Installation: ${claudeInstalled === true ? '✅ Cached' : claudeInstalled === false ? '❌ Not cached (failed)' : '⚪ Not cached'}`)
    if (claudeVersion) {
      ui.displayInfo(`Claude Version: ${claudeVersion}`)
    }
    ui.displayInfo('')
    ui.displayInfo(`Last Update Check: ${lastUpdateCheck ? new Date(lastUpdateCheck).toLocaleString() : 'Never'}`)

    if (options.verbose) {
      ui.displayInfo('')
      ui.displayInfo('All cache keys:')
      const keys = cache.keys()
      keys.forEach(key => ui.displayInfo(`  - ${key}`))
    }
  }
  catch (error) {
    ui.displayError(`❌ Failed to get cache status: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
