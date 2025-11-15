import type { FSWatcher } from 'node:fs'
import type { ExtensionsLibrary } from '../config/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { UILogger } from '../utils/cli/ui'
import { ClaudeConfigSyncer } from './claude-config-syncer'

/**
 * ClaudeConfigWatcher - Monitors Claude Code configuration files for changes
 * and automatically syncs them to the extensions library.
 */
export class ClaudeConfigWatcher {
  private projectRoot: string
  private ui: UILogger
  private syncer: ClaudeConfigSyncer
  private watchers: FSWatcher[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private debounceMs: number = 1000
  private onSyncCallback?: (library: ExtensionsLibrary) => void | Promise<void>

  constructor(
    projectRoot: string = process.cwd(),
    ui?: UILogger,
    options?: { debounceMs?: number },
  ) {
    this.projectRoot = projectRoot
    this.ui = ui || new UILogger(false)
    this.syncer = new ClaudeConfigSyncer(projectRoot, this.ui)
    if (options?.debounceMs) {
      this.debounceMs = options.debounceMs
    }
  }

  /**
   * Start watching Claude Code config files
   * @param currentLibrary - Current extensions library to sync into
   * @param onSync - Callback function called after successful sync
   */
  start(
    currentLibrary: ExtensionsLibrary,
    onSync?: (library: ExtensionsLibrary) => void | Promise<void>,
  ): void {
    this.onSyncCallback = onSync
    this.ui.verbose('Starting Claude Code config file watcher...')

    // Watch .mcp.json
    const mcpConfigPath = path.join(this.projectRoot, '.mcp.json')
    if (fs.existsSync(mcpConfigPath)) {
      this.watchFile(mcpConfigPath, currentLibrary)
    }

    // Watch .claude/skills/ directory
    const skillsDir = path.join(this.projectRoot, '.claude', 'skills')
    if (fs.existsSync(skillsDir)) {
      this.watchDirectory(skillsDir, currentLibrary)
    }

    // Watch .claude/agents/ directory
    const agentsDir = path.join(this.projectRoot, '.claude', 'agents')
    if (fs.existsSync(agentsDir)) {
      this.watchDirectory(agentsDir, currentLibrary)
    }

    this.ui.verbose(`Watching ${this.watchers.length} paths for changes`)
  }

  /**
   * Stop watching all files and directories
   */
  stop(): void {
    this.ui.verbose('Stopping Claude Code config file watcher...')

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Close all watchers
    for (const watcher of this.watchers) {
      watcher.close()
    }

    this.watchers = []
    this.ui.verbose('File watcher stopped')
  }

  /**
   * Watch a single file
   */
  private watchFile(filePath: string, currentLibrary: ExtensionsLibrary): void {
    try {
      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          this.ui.verbose(`Detected change in ${path.basename(filePath)}`)
          this.debouncedSync(currentLibrary)
        }
      })

      watcher.on('error', (error) => {
        this.ui.error(`Error watching ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      })

      this.watchers.push(watcher)
      this.ui.verbose(`Watching file: ${filePath}`)
    }
    catch (error) {
      this.ui.error(`Failed to watch ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Watch a directory recursively
   */
  private watchDirectory(dirPath: string, currentLibrary: ExtensionsLibrary): void {
    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (filename) {
          this.ui.verbose(`Detected ${eventType} in ${dirPath}/${filename}`)
          this.debouncedSync(currentLibrary)
        }
      })

      watcher.on('error', (error) => {
        this.ui.error(`Error watching ${dirPath}: ${error instanceof Error ? error.message : String(error)}`)
      })

      this.watchers.push(watcher)
      this.ui.verbose(`Watching directory: ${dirPath}`)
    }
    catch (error) {
      this.ui.error(`Failed to watch ${dirPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Debounced sync - waits for a pause in file changes before syncing
   */
  private debouncedSync(currentLibrary: ExtensionsLibrary): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      void this.performSync(currentLibrary)
    }, this.debounceMs)
  }

  /**
   * Perform the actual sync operation
   */
  private async performSync(currentLibrary: ExtensionsLibrary): Promise<void> {
    try {
      this.ui.verbose('Syncing Claude Code config changes...')

      const syncResult = await this.syncer.syncClaudeConfig(currentLibrary)

      if (syncResult.result.totalAdded > 0) {
        this.ui.verbose(`Synced ${syncResult.result.totalAdded} new extensions:`)
        if (syncResult.result.mcpServersAdded > 0) {
          this.ui.verbose(`  - ${syncResult.result.mcpServersAdded} MCP servers`)
        }
        if (syncResult.result.skillsAdded > 0) {
          this.ui.verbose(`  - ${syncResult.result.skillsAdded} skills`)
        }
        if (syncResult.result.subagentsAdded > 0) {
          this.ui.verbose(`  - ${syncResult.result.subagentsAdded} subagents`)
        }

        // Call the sync callback if provided
        if (this.onSyncCallback) {
          await this.onSyncCallback(syncResult.library)
        }
      }
      else {
        this.ui.verbose('No new extensions detected')
      }
    }
    catch (error) {
      this.ui.error(`Failed to sync config changes: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Check if watcher is currently active
   */
  isWatching(): boolean {
    return this.watchers.length > 0
  }
}
