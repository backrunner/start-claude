import type { ExternalProductConfig, ExternalProductSettings } from '@start-claude/cli/src/products/types'
import type { ReactNode } from 'react'
import process from 'node:process'
import { ExternalProductConfigManager } from '@start-claude/cli/src/products/config-manager'
import { getProductDefinition } from '@start-claude/cli/src/products/registry'
import ProductHomePage from '@/components/pages/product-home-page'

export const dynamic = 'force-dynamic'

function getConfigs(): ExternalProductConfig[] {
  try {
    return ExternalProductConfigManager.getInstance('codex')
      .listConfigs()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  catch (error) {
    console.error('Error reading Codex configs:', error)
    return []
  }
}

function getSettings(): ExternalProductSettings {
  try {
    return ExternalProductConfigManager.getInstance('codex').getSettings()
  }
  catch (error) {
    console.error('Error reading Codex settings:', error)
    return {}
  }
}

export default function CodexPage(): ReactNode {
  return (
    <ProductHomePage
      isVSCode={process.env.VSCODE_PLUGIN === 'true'}
      product={getProductDefinition('codex')}
      initialConfigs={getConfigs()}
      initialSettings={getSettings()}
    />
  )
}
