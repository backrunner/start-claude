'use client'

/**
 * Manager for coordinating shutdown behavior across multiple browser tabs
 */
export class ShutdownCoordinator {
  private channel: BroadcastChannel
  private tabId: string
  private activeTabs: Set<string>
  private isLastTab: boolean
  private shutdownCallback?: () => Promise<void>

  constructor(channelName = 'claude-manager') {
    this.channel = new BroadcastChannel(channelName)
    this.tabId = `tab-${Date.now()}-${Math.random()}`
    this.activeTabs = new Set([this.tabId])
    this.isLastTab = true

    this.setupChannelListeners()
    this.announcePresence()
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
    this.channel.addEventListener('message', (event) => {
      const { type, tabId: otherTabId } = event.data

      switch (type) {
        case 'tab-announce':
          this.activeTabs.add(otherTabId)
          this.updateLastTabStatus()
          // Respond with our presence
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
          // Another tab is asking for active tabs to announce themselves
          this.channel.postMessage({ type: 'tab-response', tabId: this.tabId })
          break
      }

      console.log(`Active manager tabs: ${this.activeTabs.size}`)
    })
  }

  /**
   * Announce this tab's presence to other tabs
   */
  private announcePresence(): void {
    // Announce this tab's presence
    this.channel.postMessage({ type: 'tab-announce', tabId: this.tabId })

    // Request existing tabs to announce themselves
    this.channel.postMessage({ type: 'tab-request' })
  }

  /**
   * Update the isLastTab flag based on active tabs count
   */
  private updateLastTabStatus(): void {
    this.isLastTab = this.activeTabs.size === 1
  }

  /**
   * Call shutdown API only if this is the last tab
   */
  async callShutdownIfLastTab(): Promise<void> {
    if (!this.isLastTab) {
      console.log('Not calling shutdown API - other manager tabs are open')
      return
    }

    console.log('Calling shutdown API - this is the last manager tab')

    if (this.shutdownCallback) {
      await this.shutdownCallback()
    }
    else {
      // Default shutdown implementation
      await this.defaultShutdown()
    }
  }

  /**
   * Default shutdown implementation using fetch and sendBeacon
   */
  private async defaultShutdown(): Promise<void> {
    try {
      const response = await fetch('/api/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true, // Ensure request completes even if page is closing
        body: JSON.stringify({}),
      })

      if (response.ok) {
        console.log('Shutdown API called successfully')
      }
      else {
        console.warn('Shutdown API returned non-ok response')
      }
    }
    catch (error) {
      console.error('Error calling shutdown API:', error)
      // Try sendBeacon as fallback
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/shutdown', JSON.stringify({}))
      }
    }
  }

  /**
   * Send shutdown with sendBeacon (for unload events)
   */
  sendBeaconShutdownIfLastTab(): void {
    if (!this.isLastTab) {
      console.log('Not sending beacon shutdown - other manager tabs are open')
      return
    }

    console.log('Sending beacon shutdown - this is the last manager tab')
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
   * Handle beforeunload event
   */
  handleBeforeUnload(): void {
    this.announceClosing()
    // Wait a brief moment for other tabs to process the message
    setTimeout(() => {
      void this.callShutdownIfLastTab()
    }, 50)
  }

  /**
   * Handle unload event
   */
  handleUnload(): void {
    this.announceClosing()
    this.sendBeaconShutdownIfLastTab()
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
   * Cleanup resources
   */
  cleanup(): void {
    this.announceClosing()
    this.channel.close()
  }
}
