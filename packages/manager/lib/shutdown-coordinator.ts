'use client'

const SESSION_KEY_UNLOAD_TIME = 'claude-manager-unload-time'
const SESSION_KEY_TAB_ID = 'claude-manager-tab-id'
const RELOAD_THRESHOLD_MS = 3000

/**
 * Manager for coordinating shutdown behavior across multiple browser tabs
 */
export class ShutdownCoordinator {
  private channel: BroadcastChannel
  private tabId: string
  private activeTabs: Set<string>
  private isLastTab: boolean
  private shutdownCallback?: () => Promise<void>
  private isReloading: boolean = false
  private pagehideHandler: ((event: PageTransitionEvent) => void) | null = null
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null

  constructor(channelName = 'claude-manager') {
    // Try to restore tab ID from session storage (for reload continuity)
    this.tabId = this.restoreOrGenerateTabId()
    this.activeTabs = new Set([this.tabId])
    this.isLastTab = true
    this.isReloading = false

    // Only initialize browser-specific features in client environment
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(channelName)
      this.detectReloadOnPageLoad()
      this.setupChannelListeners()
      this.announcePresence()
      this.setupPageHideListener()
      this.setupKeyboardReloadDetection()
    }
    else {
      // Create a no-op channel for SSR compatibility
      this.channel = {
        name: channelName,
        postMessage: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        close: () => {},
        onmessage: null,
        onmessageerror: null,
        dispatchEvent: () => false,
      } as BroadcastChannel
    }
  }

  /**
   * Restore tab ID from session storage or generate a new one
   */
  private restoreOrGenerateTabId(): string {
    if (typeof sessionStorage === 'undefined') {
      return `tab-${Date.now()}-${Math.random()}`
    }

    try {
      const storedTabId = sessionStorage.getItem(SESSION_KEY_TAB_ID)
      if (storedTabId) {
        return storedTabId
      }
    }
    catch {
      // Session storage might not be available
    }

    const newTabId = `tab-${Date.now()}-${Math.random()}`
    try {
      sessionStorage.setItem(SESSION_KEY_TAB_ID, newTabId)
    }
    catch {
      // Ignore storage errors
    }
    return newTabId
  }

  /**
   * Detect if this page load is a reload (vs fresh navigation)
   */
  private detectReloadOnPageLoad(): void {
    if (typeof window === 'undefined') {
      return
    }

    let isReloadDetected = false

    // Method 1: Check Performance Navigation API
    try {
      const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') {
        isReloadDetected = true
        console.log('[ShutdownCoordinator] Detected reload via Performance API')
      }
    }
    catch {
      // Performance API not available
    }

    // Method 2: Check if unload timestamp is recent
    try {
      const unloadTimeStr = sessionStorage.getItem(SESSION_KEY_UNLOAD_TIME)
      if (unloadTimeStr) {
        const unloadTime = parseInt(unloadTimeStr, 10)
        const timeSinceUnload = Date.now() - unloadTime
        if (timeSinceUnload < RELOAD_THRESHOLD_MS) {
          isReloadDetected = true
          console.log(`[ShutdownCoordinator] Detected reload via timestamp (${timeSinceUnload}ms ago)`)
        }
        sessionStorage.removeItem(SESSION_KEY_UNLOAD_TIME)
      }
    }
    catch {
      // Session storage might not be available
    }

    if (isReloadDetected) {
      this.isReloading = true

      // CRITICAL: Immediately send a heartbeat to cancel any pending shutdown
      // This must happen before the grace period expires
      this.sendImmediateHeartbeat()

      // Clear reload flag after a short delay to allow normal operation
      setTimeout(() => {
        this.isReloading = false
        console.log('[ShutdownCoordinator] Reload flag cleared')
      }, 1000)
    }
  }

  /**
   * Send an immediate heartbeat to cancel any pending shutdown on the server
   */
  private sendImmediateHeartbeat(): void {
    console.log('[ShutdownCoordinator] Sending immediate heartbeat to cancel pending shutdown')

    // Use fetch with keepalive to ensure it completes
    fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) {
          console.log('[ShutdownCoordinator] Immediate heartbeat sent successfully')
        }
      })
      .catch((error) => {
        console.warn('[ShutdownCoordinator] Failed to send immediate heartbeat:', error)
      })
  }

  /**
   * Setup keyboard shortcut detection for reload
   */
  private setupKeyboardReloadDetection(): void {
    if (typeof window === 'undefined') {
      return
    }

    this.keydownHandler = (event: KeyboardEvent) => {
      const isReloadShortcut = event.key === 'F5'
        || (event.ctrlKey && event.key === 'r')
        || (event.metaKey && event.key === 'r')

      if (isReloadShortcut) {
        this.isReloading = true
        this.storeUnloadTimestamp()
        console.log('[ShutdownCoordinator] Reload keyboard shortcut detected')
      }
    }

    window.addEventListener('keydown', this.keydownHandler)
  }

  /**
   * Setup pagehide listener for detecting page close/navigation
   */
  private setupPageHideListener(): void {
    if (typeof window === 'undefined') {
      return
    }

    this.pagehideHandler = (event: PageTransitionEvent) => {
      // Store unload timestamp for reload detection
      this.storeUnloadTimestamp()

      // If page is being persisted (bfcache), don't trigger shutdown
      if (event.persisted) {
        console.log('[ShutdownCoordinator] Page entering bfcache, skipping shutdown')
        return
      }

      // If we detected a reload, don't shutdown
      if (this.isReloading) {
        console.log('[ShutdownCoordinator] Page hiding but reload detected, skipping shutdown')
        return
      }

      // Announce closing and trigger shutdown if last tab
      console.log('[ShutdownCoordinator] Page hiding, checking if shutdown needed')
      this.announceClosing()
      this.sendBeaconShutdownIfLastTab()
    }

    window.addEventListener('pagehide', this.pagehideHandler)
  }

  /**
   * Store the current timestamp for reload detection
   */
  private storeUnloadTimestamp(): void {
    try {
      sessionStorage.setItem(SESSION_KEY_UNLOAD_TIME, Date.now().toString())
    }
    catch {
      // Session storage might not be available
    }
  }

  /**
   * Update the isLastTab flag based on active tabs count
   */
  private updateLastTabStatus(): void {
    this.isLastTab = this.activeTabs.size === 1
  }

  /**
   * Mark as reload to prevent shutdown during intentional page refresh
   */
  markAsReload(): void {
    this.isReloading = true
    this.storeUnloadTimestamp()
    console.log('[ShutdownCoordinator] Explicitly marked as reload')
  }

  /**
   * Set the callback function to call when shutdown is needed
   */
  setShutdownCallback(callback: () => Promise<void>): void {
    this.shutdownCallback = callback
  }

  /**
   * Setup BroadcastChannel message listeners
   */
  private setupChannelListeners(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return
    }

    this.channel.addEventListener('message', (event) => {
      const { type, tabId: otherTabId } = event.data

      switch (type) {
        case 'tab-announce':
          this.activeTabs.add(otherTabId)
          this.updateLastTabStatus()
          this.channel.postMessage({ type: 'tab-response', tabId: this.tabId })
          break
        case 'tab-response':
          this.activeTabs.add(otherTabId)
          this.updateLastTabStatus()
          break
        case 'tab-closing':
          this.activeTabs.delete(otherTabId)
          this.updateLastTabStatus()
          break
        case 'tab-request':
          this.channel.postMessage({ type: 'tab-response', tabId: this.tabId })
          break
      }

      console.log(`[ShutdownCoordinator] Active tabs: ${this.activeTabs.size}`)
    })
  }

  /**
   * Announce this tab's presence to other tabs
   */
  private announcePresence(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return
    }

    this.channel.postMessage({ type: 'tab-announce', tabId: this.tabId })
    this.channel.postMessage({ type: 'tab-request' })
  }

  /**
   * Call shutdown API only if this is the last tab and not a reload
   */
  async callShutdownIfLastTab(): Promise<void> {
    if (this.isReloading) {
      console.log('[ShutdownCoordinator] Not calling shutdown - page is reloading')
      return
    }

    if (!this.isLastTab) {
      console.log('[ShutdownCoordinator] Not calling shutdown - other tabs are open')
      return
    }

    console.log('[ShutdownCoordinator] Calling shutdown - this is the last tab')

    if (this.shutdownCallback) {
      await this.shutdownCallback()
    }
    else {
      await this.defaultShutdown()
    }
  }

  /**
   * Default shutdown implementation using fetch with sendBeacon fallback
   */
  private async defaultShutdown(): Promise<void> {
    try {
      const response = await fetch('/api/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({}),
      })

      if (response.ok) {
        console.log('[ShutdownCoordinator] Shutdown API called successfully')
      }
      else {
        console.warn('[ShutdownCoordinator] Shutdown API returned non-ok response')
      }
    }
    catch (error) {
      console.error('[ShutdownCoordinator] Error calling shutdown API:', error)
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/shutdown', JSON.stringify({}))
      }
    }
  }

  /**
   * Send shutdown via sendBeacon (for pagehide events) only if conditions are met
   */
  sendBeaconShutdownIfLastTab(): void {
    if (this.isReloading) {
      console.log('[ShutdownCoordinator] Not sending beacon shutdown - page is reloading')
      return
    }

    if (!this.isLastTab) {
      console.log('[ShutdownCoordinator] Not sending beacon shutdown - other tabs are open')
      return
    }

    console.log('[ShutdownCoordinator] Sending beacon shutdown - this is the last tab')
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/shutdown', JSON.stringify({}))
    }
  }

  /**
   * Announce that this tab is closing
   */
  announceClosing(): void {
    this.channel.postMessage({ type: 'tab-closing', tabId: this.tabId })
  }

  /**
   * Get current tab information
   */
  getTabInfo(): { tabId: string, activeTabsCount: number, isLastTab: boolean } {
    return {
      tabId: this.tabId,
      activeTabsCount: this.activeTabs.size,
      isLastTab: this.isLastTab,
    }
  }

  /**
   * Cleanup resources (called on component unmount)
   * Note: Does NOT announce closing or trigger shutdown - that's handled by pagehide
   */
  cleanup(): void {
    if (typeof window !== 'undefined') {
      if (this.pagehideHandler) {
        window.removeEventListener('pagehide', this.pagehideHandler)
      }
      if (this.keydownHandler) {
        window.removeEventListener('keydown', this.keydownHandler)
      }
    }
    this.channel.close()
  }
}
