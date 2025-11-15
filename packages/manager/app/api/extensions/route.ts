import type { ExtensionsLibrary, McpServerDefinition, SkillDefinition, SubagentDefinition } from '@/config/types'
import type { NextRequest } from 'next/server'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize the ConfigManager instance
const configManager = ConfigManager.getInstance()

/**
 * Get the extensions library from settings
 */
async function getExtensionsLibrary(): Promise<ExtensionsLibrary> {
  try {
    const configFile = await configManager.load()
    const library = configFile.settings.extensionsLibrary || {
      mcpServers: {},
      skills: {},
      subagents: {},
    }

    return library
  }
  catch (error) {
    console.error('[Extensions API] Error loading extensions library:', error)
    return {
      mcpServers: {},
      skills: {},
      subagents: {},
    }
  }
}

/**
 * Save the extensions library to settings
 */
async function saveExtensionsLibrary(library: ExtensionsLibrary): Promise<void> {
  try {
    const configFile = await configManager.load()
    const updatedConfigFile = {
      ...configFile,
      settings: {
        ...configFile.settings,
        extensionsLibrary: library,
      },
    }
    await configManager.save(updatedConfigFile)
    console.log('[Extensions API] Extensions library saved successfully')
  }
  catch (error) {
    console.error('[Extensions API] Error saving extensions library:', error)
    throw error
  }
}

/**
 * GET /api/extensions
 * Get the complete extensions library
 */
export async function GET(): Promise<NextResponse> {
  try {
    const library = await getExtensionsLibrary()
    return NextResponse.json({ success: true, library })
  }
  catch (error) {
    console.error('[Extensions API] GET error:', error)
    return NextResponse.json({
      error: 'Failed to fetch extensions library',
    }, { status: 500 })
  }
}

/**
 * POST /api/extensions
 * Add a new extension to the library
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { type, extension } = body

    if (!type || !['mcpServers', 'skills', 'subagents'].includes(type)) {
      return NextResponse.json({
        error: 'Invalid extension type. Must be one of: mcpServers, skills, subagents',
      }, { status: 400 })
    }

    if (!extension || typeof extension !== 'object') {
      return NextResponse.json({
        error: 'Extension data is required',
      }, { status: 400 })
    }

    // Generate ID if not provided
    const id = extension.id || randomUUID()

    // Validate required fields based on type
    if (type === 'mcpServers') {
      const server = extension as McpServerDefinition
      if (!server.name || !server.type) {
        return NextResponse.json({
          error: 'MCP server must have name and type',
        }, { status: 400 })
      }

      if (server.type === 'stdio' && !server.command) {
        return NextResponse.json({
          error: 'stdio MCP server must have command',
        }, { status: 400 })
      }

      if (server.type === 'http' && !server.url) {
        return NextResponse.json({
          error: 'HTTP MCP server must have url',
        }, { status: 400 })
      }
    }
    else if (type === 'skills') {
      const skill = extension as SkillDefinition
      if (!skill.name || !skill.description || !skill.content) {
        return NextResponse.json({
          error: 'Skill must have name, description, and content',
        }, { status: 400 })
      }
    }
    else if (type === 'subagents') {
      const subagent = extension as SubagentDefinition
      if (!subagent.name || !subagent.description || !subagent.systemPrompt) {
        return NextResponse.json({
          error: 'Subagent must have name, description, and systemPrompt',
        }, { status: 400 })
      }
    }

    // Load current library
    const library = await getExtensionsLibrary()

    // Check for duplicate name
    const existingIds = Object.keys(library[type as keyof ExtensionsLibrary])
    const existingNames = Object.values(library[type as keyof ExtensionsLibrary]).map(
      (ext: any) => ext.name,
    )

    if (existingNames.includes(extension.name) && !existingIds.includes(id)) {
      return NextResponse.json({
        error: `An extension with name "${extension.name}" already exists`,
      }, { status: 409 })
    }

    // Add extension to library
    const updatedLibrary = {
      ...library,
      [type]: {
        ...library[type as keyof ExtensionsLibrary],
        [id]: { ...extension, id },
      },
    }

    await saveExtensionsLibrary(updatedLibrary)

    return NextResponse.json({
      success: true,
      library: updatedLibrary,
      extension: { ...extension, id },
    })
  }
  catch (error) {
    console.error('[Extensions API] POST error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body',
      }, { status: 400 })
    }
    return NextResponse.json({
      error: 'Failed to add extension',
    }, { status: 500 })
  }
}

/**
 * PUT /api/extensions
 * Update an existing extension
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { type, id, extension } = body

    if (!type || !['mcpServers', 'skills', 'subagents'].includes(type)) {
      return NextResponse.json({
        error: 'Invalid extension type',
      }, { status: 400 })
    }

    if (!id) {
      return NextResponse.json({
        error: 'Extension ID is required',
      }, { status: 400 })
    }

    if (!extension || typeof extension !== 'object') {
      return NextResponse.json({
        error: 'Extension data is required',
      }, { status: 400 })
    }

    // Load current library
    const library = await getExtensionsLibrary()

    // Check if extension exists
    if (!library[type as keyof ExtensionsLibrary][id]) {
      return NextResponse.json({
        error: 'Extension not found',
      }, { status: 404 })
    }

    // Update extension
    const updatedLibrary = {
      ...library,
      [type]: {
        ...library[type as keyof ExtensionsLibrary],
        [id]: { ...extension, id },
      },
    }

    await saveExtensionsLibrary(updatedLibrary)

    return NextResponse.json({
      success: true,
      library: updatedLibrary,
      extension: { ...extension, id },
    })
  }
  catch (error) {
    console.error('[Extensions API] PUT error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body',
      }, { status: 400 })
    }
    return NextResponse.json({
      error: 'Failed to update extension',
    }, { status: 500 })
  }
}

/**
 * DELETE /api/extensions?type=mcpServers&id=xxx
 * Delete an extension from the library
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')

    if (!type || !['mcpServers', 'skills', 'subagents'].includes(type)) {
      return NextResponse.json({
        error: 'Invalid extension type',
      }, { status: 400 })
    }

    if (!id) {
      return NextResponse.json({
        error: 'Extension ID is required',
      }, { status: 400 })
    }

    // Load current library
    const library = await getExtensionsLibrary()

    // Check if extension exists
    if (!library[type as keyof ExtensionsLibrary][id]) {
      return NextResponse.json({
        error: 'Extension not found',
      }, { status: 404 })
    }

    // Check if extension is used by any configs
    const configFile = await configManager.load()
    const usedBy: string[] = []

    for (const config of configFile.configs) {
      if (!config.enabledExtensions) {
        continue
      }

      let isUsed = false

      // Check if using override model
      if (config.enabledExtensions.useGlobalDefaults && config.enabledExtensions.overrides) {
        const overrides = config.enabledExtensions.overrides
        const overrideForType =
          type === 'mcpServers'
            ? overrides.mcpServers
            : type === 'skills'
              ? overrides.skills
              : overrides.subagents

        // Check if in the add list
        if (overrideForType?.add && overrideForType.add.includes(id)) {
          isUsed = true
        }
      }
      else {
        // Check legacy explicit list model
        const enabledIds =
          type === 'mcpServers'
            ? config.enabledExtensions.mcpServers
            : type === 'skills'
              ? config.enabledExtensions.skills
              : config.enabledExtensions.subagents

        if (enabledIds && enabledIds.includes(id)) {
          isUsed = true
        }
      }

      if (isUsed) {
        usedBy.push(config.name)
      }
    }

    // Also check if extension is in global defaults
    const defaults = configFile.settings.defaultEnabledExtensions
    if (defaults) {
      const defaultIds =
        type === 'mcpServers'
          ? defaults.mcpServers
          : type === 'skills'
            ? defaults.skills
            : defaults.subagents

      if (defaultIds.includes(id)) {
        usedBy.push('Global Defaults')
      }
    }

    if (usedBy.length > 0) {
      return NextResponse.json({
        error: 'Cannot delete extension that is in use',
        usedBy,
      }, { status: 409 })
    }

    // Delete extension
    const updatedLibrary = {
      ...library,
      [type]: { ...library[type as keyof ExtensionsLibrary] },
    }
    delete (updatedLibrary[type as keyof ExtensionsLibrary] as any)[id]

    await saveExtensionsLibrary(updatedLibrary)

    return NextResponse.json({
      success: true,
      library: updatedLibrary,
    })
  }
  catch (error) {
    console.error('[Extensions API] DELETE error:', error)
    return NextResponse.json({
      error: 'Failed to delete extension',
    }, { status: 500 })
  }
}
