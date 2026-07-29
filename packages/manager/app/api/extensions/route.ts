import type { NextRequest } from 'next/server'
import type { ExtensionsLibrary, McpServerDefinition, SkillDefinition, SubagentDefinition } from '@/config/types'
import { randomUUID } from 'node:crypto'
import { ConfigManager } from '@start-claude/cli/src/config/manager'
import { pruneMissingExtensionReferences } from '@start-claude/cli/src/extensions/references'
import { ExtensionsWriter } from '@start-claude/cli/src/extensions/writer'
import { resolveClaudeProjectRoot } from '@start-claude/cli/src/utils/system/path-utils'
import { NextResponse } from 'next/server'
import {
  mcpServerDefinitionSchema,
  skillDefinitionSchema,
  subagentDefinitionSchema,
} from '@/lib/validation'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize the ConfigManager instance
const configManager = ConfigManager.getInstance()
const projectRoot = resolveClaudeProjectRoot()

type ExtensionType = keyof ExtensionsLibrary

type ValidatedExtension
  = | { type: 'mcpServers', extension: McpServerDefinition }
    | { type: 'skills', extension: SkillDefinition }
    | { type: 'subagents', extension: SubagentDefinition }

type ExtensionValidationResult
  = | { success: true, value: ValidatedExtension }
    | { success: false, error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExtensionType(value: unknown): value is ExtensionType {
  return value === 'mcpServers' || value === 'skills' || value === 'subagents'
}

function formatValidationIssues(issues: Array<{ path: PropertyKey[], message: string }>): string {
  return issues
    .map(issue => `${issue.path.length > 0 ? issue.path.map(String).join('.') : 'extension'}: ${issue.message}`)
    .join('; ')
}

function validateExtension(type: ExtensionType, input: unknown, id: unknown): ExtensionValidationResult {
  if (!isRecord(input)) {
    return { success: false, error: 'Extension data is required' }
  }

  const candidate = { ...input, id }
  if (type === 'mcpServers') {
    const result = mcpServerDefinitionSchema.safeParse(candidate)
    return result.success
      ? { success: true, value: { type, extension: result.data } }
      : { success: false, error: formatValidationIssues(result.error.issues) }
  }
  if (type === 'skills') {
    const result = skillDefinitionSchema.safeParse(candidate)
    return result.success
      ? { success: true, value: { type, extension: result.data } }
      : { success: false, error: formatValidationIssues(result.error.issues) }
  }

  const result = subagentDefinitionSchema.safeParse(candidate)
  return result.success
    ? { success: true, value: { type, extension: result.data } }
    : { success: false, error: formatValidationIssues(result.error.issues) }
}

function setExtension(library: ExtensionsLibrary, value: ValidatedExtension): ExtensionsLibrary {
  if (value.type === 'mcpServers') {
    return {
      ...library,
      mcpServers: { ...library.mcpServers, [value.extension.id]: value.extension },
    }
  }
  if (value.type === 'skills') {
    return {
      ...library,
      skills: { ...library.skills, [value.extension.id]: value.extension },
    }
  }
  return {
    ...library,
    subagents: { ...library.subagents, [value.extension.id]: value.extension },
  }
}

function removeExtension(library: ExtensionsLibrary, type: ExtensionType, id: string): ExtensionsLibrary {
  if (type === 'mcpServers') {
    const { [id]: _removed, ...mcpServers } = library.mcpServers
    return { ...library, mcpServers }
  }
  if (type === 'skills') {
    const { [id]: _removed, ...skills } = library.skills
    return { ...library, skills }
  }
  const { [id]: _removed, ...subagents } = library.subagents
  return { ...library, subagents }
}

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
    throw error
  }
}

/**
 * Save the extensions library to settings
 */
async function saveExtensionsLibrary(library: ExtensionsLibrary): Promise<void> {
  try {
    const configFile = await configManager.load()
    const previousLibrary = configFile.settings.extensionsLibrary || {
      mcpServers: {},
      skills: {},
      subagents: {},
    }
    new ExtensionsWriter(projectRoot).reconcileLibraryChanges(previousLibrary, library)

    const updatedConfigFile = {
      ...configFile,
      settings: {
        ...configFile.settings,
        extensionsLibrary: library,
      },
    }
    pruneMissingExtensionReferences(updatedConfigFile)
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
    const body: unknown = await request.json()
    if (!isRecord(body) || !isExtensionType(body.type)) {
      return NextResponse.json({
        error: 'Invalid extension type. Must be one of: mcpServers, skills, subagents',
      }, { status: 400 })
    }

    const requestedId = isRecord(body.extension) && body.extension.id !== undefined
      ? body.extension.id
      : randomUUID()
    const validation = validateExtension(body.type, body.extension, requestedId)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const library = await getExtensionsLibrary()
    const { type, extension } = validation.value
    const collection = library[type]

    if (Object.prototype.hasOwnProperty.call(collection, extension.id)) {
      return NextResponse.json({
        error: `An extension with ID "${extension.id}" already exists`,
      }, { status: 409 })
    }

    const duplicateName = Object.values(collection)
      .some(existing => existing.name.toLowerCase() === extension.name.toLowerCase())
    if (duplicateName) {
      return NextResponse.json({
        error: `An extension with name "${extension.name}" already exists`,
      }, { status: 409 })
    }

    const updatedLibrary = setExtension(library, validation.value)
    await saveExtensionsLibrary(updatedLibrary)

    return NextResponse.json({
      success: true,
      library: updatedLibrary,
      extension,
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
    const body: unknown = await request.json()
    if (!isRecord(body) || !isExtensionType(body.type)) {
      return NextResponse.json({
        error: 'Invalid extension type',
      }, { status: 400 })
    }

    if (typeof body.id !== 'string' || !body.id.trim()) {
      return NextResponse.json({
        error: 'Extension ID is required',
      }, { status: 400 })
    }

    const validation = validateExtension(body.type, body.extension, body.id)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const library = await getExtensionsLibrary()
    const { type, extension } = validation.value
    const collection = library[type]

    if (!Object.prototype.hasOwnProperty.call(collection, extension.id)) {
      return NextResponse.json({
        error: 'Extension not found',
      }, { status: 404 })
    }

    const duplicateName = Object.entries(collection)
      .some(([existingId, existing]) => (
        existingId !== extension.id
        && existing.name.toLowerCase() === extension.name.toLowerCase()
      ))
    if (duplicateName) {
      return NextResponse.json({
        error: `An extension with name "${extension.name}" already exists`,
      }, { status: 409 })
    }

    const updatedLibrary = setExtension(library, validation.value)
    await saveExtensionsLibrary(updatedLibrary)

    return NextResponse.json({
      success: true,
      library: updatedLibrary,
      extension,
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

    if (!isExtensionType(type)) {
      return NextResponse.json({
        error: 'Invalid extension type',
      }, { status: 400 })
    }

    if (!id) {
      return NextResponse.json({
        error: 'Extension ID is required',
      }, { status: 400 })
    }

    const library = await getExtensionsLibrary()

    if (!Object.prototype.hasOwnProperty.call(library[type], id)) {
      return NextResponse.json({
        error: 'Extension not found',
      }, { status: 404 })
    }

    const updatedLibrary = removeExtension(library, type, id)
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
