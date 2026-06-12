import type { ExternalProductId } from '@start-claude/cli/src/products/types'
import type { NextRequest } from 'next/server'
import { ExternalProductConfigManager } from '@start-claude/cli/src/products/config-manager'
import { isExternalProductId } from '@start-claude/cli/src/products/registry'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ProductSettingsRouteParams {
  params: Promise<{
    product: string
  }>
}

async function resolveProductId(params: ProductSettingsRouteParams['params']): Promise<ExternalProductId | null> {
  const { product } = await params
  return isExternalProductId(product) ? product : null
}

export async function GET(_request: NextRequest, { params }: ProductSettingsRouteParams): Promise<NextResponse> {
  const productId = await resolveProductId(params)
  if (!productId) {
    return NextResponse.json({ error: 'Unknown product' }, { status: 404 })
  }

  try {
    const manager = ExternalProductConfigManager.getInstance(productId)
    return NextResponse.json({ success: true, settings: manager.getSettings() })
  }
  catch (error) {
    console.error(`GET /api/products/${productId}/settings error:`, error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: ProductSettingsRouteParams): Promise<NextResponse> {
  const productId = await resolveProductId(params)
  if (!productId) {
    return NextResponse.json({ error: 'Unknown product' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const settings = body.settings
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings data' }, { status: 400 })
    }

    const manager = ExternalProductConfigManager.getInstance(productId)
    manager.updateSettings(settings)
    return NextResponse.json({ success: true, settings: manager.getSettings() })
  }
  catch (error) {
    console.error(`POST /api/products/${productId}/settings error:`, error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
