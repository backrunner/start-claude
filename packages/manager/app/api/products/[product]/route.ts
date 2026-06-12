import type { ExternalProductConfig, ExternalProductId } from '@start-claude/cli/src/products/types'
import type { NextRequest } from 'next/server'
import { ExternalProductConfigManager } from '@start-claude/cli/src/products/config-manager'
import { getProductDefinition, isExternalProductId } from '@start-claude/cli/src/products/registry'
import { NextResponse } from 'next/server'
import { externalProductConfigCreateRequestSchema, externalProductConfigUpdateRequestSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ProductRouteParams {
  params: Promise<{
    product: string
  }>
}

async function resolveProductId(params: ProductRouteParams['params']): Promise<ExternalProductId | null> {
  const { product } = await params
  return isExternalProductId(product) ? product : null
}

function getManager(productId: ExternalProductId): ExternalProductConfigManager {
  return ExternalProductConfigManager.getInstance(productId)
}

function getConfigs(productId: ExternalProductId): ExternalProductConfig[] {
  return getManager(productId)
    .listConfigs()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export async function GET(_request: NextRequest, { params }: ProductRouteParams): Promise<NextResponse> {
  const productId = await resolveProductId(params)
  if (!productId) {
    return NextResponse.json({ error: 'Unknown product' }, { status: 404 })
  }

  try {
    const manager = getManager(productId)
    return NextResponse.json({
      success: true,
      product: getProductDefinition(productId),
      configs: getConfigs(productId),
      settings: manager.getSettings(),
    })
  }
  catch (error) {
    console.error(`GET /api/products/${productId} error:`, error)
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: ProductRouteParams): Promise<NextResponse> {
  const productId = await resolveProductId(params)
  if (!productId) {
    return NextResponse.json({ error: 'Unknown product' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const validation = externalProductConfigCreateRequestSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.issues,
      }, { status: 400 })
    }

    const manager = getManager(productId)
    manager.addConfig(validation.data.config)

    return NextResponse.json({
      success: true,
      configs: getConfigs(productId),
      settings: manager.getSettings(),
    })
  }
  catch (error) {
    console.error(`POST /api/products/${productId} error:`, error)
    if (error instanceof Error && error.message.includes('conflicts with existing configuration')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: ProductRouteParams): Promise<NextResponse> {
  const productId = await resolveProductId(params)
  if (!productId) {
    return NextResponse.json({ error: 'Unknown product' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const validation = externalProductConfigUpdateRequestSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.issues,
      }, { status: 400 })
    }

    const manager = getManager(productId)
    const configFile = manager.getConfigFile()
    const deletedConfigs = configFile.configs.filter(config => config.isDeleted)
    manager.saveConfigFile({
      ...configFile,
      configs: [...validation.data.configs, ...deletedConfigs],
    })

    return NextResponse.json({
      success: true,
      configs: getConfigs(productId),
      settings: manager.getSettings(),
    })
  }
  catch (error) {
    console.error(`PUT /api/products/${productId} error:`, error)
    return NextResponse.json({ error: 'Failed to update configs' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: ProductRouteParams): Promise<NextResponse> {
  const productId = await resolveProductId(params)
  if (!productId) {
    return NextResponse.json({ error: 'Unknown product' }, { status: 404 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const name = searchParams.get('name')

    if (!id && !name) {
      return NextResponse.json({ error: 'Config id or name is required' }, { status: 400 })
    }

    const manager = getManager(productId)
    const success = id ? manager.removeConfigById(id) : manager.removeConfig(name || '')
    if (!success) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    const reorderedConfigs = getConfigs(productId).map((config, index) => ({
      ...config,
      order: index + 1,
    }))

    const configFile = manager.getConfigFile()
    const deletedConfigs = configFile.configs.filter(config => config.isDeleted)
    manager.saveConfigFile({
      ...configFile,
      configs: [...reorderedConfigs, ...deletedConfigs],
    })

    return NextResponse.json({
      success: true,
      configs: reorderedConfigs,
      settings: manager.getSettings(),
    })
  }
  catch (error) {
    console.error(`DELETE /api/products/${productId} error:`, error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}
