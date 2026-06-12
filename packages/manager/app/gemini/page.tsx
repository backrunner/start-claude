import type { ExternalProductConfig, ExternalProductSettings } from '@start-claude/cli/src/products/types'
import type { ReactNode } from 'react'
import process from 'node:process'
import { ExternalProductConfigManager } from '@start-claude/cli/src/products/config-manager'
import { getProductDefinition } from '@start-claude/cli/src/products/registry'
import ProductHomePage from '@/components/pages/product-home-page'

export const dynamic = 'force-dynamic'

function getConfigs(): ExternalProductConfig[] {
  try {
    return ExternalProductConfigManager.getInstance('gemini')
      .listConfigs()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  catch (error) {
    console.error('Error reading Gemini configs:', error)
    return []
  }
}

function getSettings(): ExternalProductSettings {
  try {
    return ExternalProductConfigManager.getInstance('gemini').getSettings()
  }
  catch (error) {
    console.error('Error reading Gemini settings:', error)
    return {}
  }
}

export default function GeminiPage(): ReactNode {
  return (
    <ProductHomePage
      isVSCode={process.env.VSCODE_PLUGIN === 'true'}
      product={getProductDefinition('gemini')}
      initialConfigs={getConfigs()}
      initialSettings={getSettings()}
    />
  )
}
