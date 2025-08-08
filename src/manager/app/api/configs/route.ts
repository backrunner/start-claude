import type { NextRequest } from 'next/server'
import type { ClaudeConfig } from '@/types/config'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CONFIG_DIR = join(homedir(), '.start-claude')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

function getConfigs(): ClaudeConfig[] {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    if (!existsSync(CONFIG_PATH)) {
      return []
    }
    const data = readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(data)
    return parsed.configs || []
  }
  catch (error) {
    console.error('Error reading configs:', error)
    return []
  }
}

function saveConfigs(configs: ClaudeConfig[]): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    const data = {
      configs,
      settings: {
        overrideClaudeCommand: false,
      },
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2))
  }
  catch (error) {
    console.error('Error saving configs:', error)
    throw error
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const configs = getConfigs()
    return NextResponse.json({ configs })
  }
  catch (error) {
    console.error('GET /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { config } = body

    if (!config || !config.name) {
      return NextResponse.json({ error: 'Invalid config data' }, { status: 400 })
    }

    const configs = getConfigs()
    const existingIndex = configs.findIndex(c => c.name === config.name)

    if (existingIndex >= 0) {
      configs[existingIndex] = { ...configs[existingIndex], ...config }
    }
    else {
      configs.push({
        ...config,
        order: config.order ?? configs.length,
        enabled: config.enabled ?? true,
      })
    }

    saveConfigs(configs)
    return NextResponse.json({ success: true, configs })
  }
  catch (error) {
    console.error('POST /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { configs } = body

    if (!Array.isArray(configs)) {
      return NextResponse.json({ error: 'Invalid configs data' }, { status: 400 })
    }

    saveConfigs(configs)
    return NextResponse.json({ success: true, configs })
  }
  catch (error) {
    console.error('PUT /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to update configs' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name) {
      return NextResponse.json({ error: 'Config name is required' }, { status: 400 })
    }

    const configs = getConfigs()
    const filteredConfigs = configs.filter(c => c.name !== name)

    if (filteredConfigs.length === configs.length) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    saveConfigs(filteredConfigs)
    return NextResponse.json({ success: true, configs: filteredConfigs })
  }
  catch (error) {
    console.error('DELETE /api/configs error:', error)
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
  }
}
