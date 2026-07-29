import type { NextRequest } from 'next/server'
import { installSkillFromSkillsCat } from '@start-claude/cli/src/extensions/skill-installer'
import { resolveClaudeProjectRoot } from '@start-claude/cli/src/utils/system/path-utils'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const projectRoot = resolveClaudeProjectRoot()

interface InstallRequest {
  force?: boolean
  repo?: boolean
  skills?: string[]
  source: string
}

function parseInstallRequest(value: unknown): InstallRequest | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const request = value as Record<string, unknown>
  if (
    typeof request.source !== 'string'
    || !request.source.trim()
    || request.source.trim().startsWith('-')
    || request.source.length > 500
  ) {
    return undefined
  }
  if (request.repo !== undefined && typeof request.repo !== 'boolean') {
    return undefined
  }
  if (request.force !== undefined && typeof request.force !== 'boolean') {
    return undefined
  }
  if (request.skills !== undefined && (
    !Array.isArray(request.skills)
    || request.skills.length > 50
    || request.skills.some(skill => (
      typeof skill !== 'string'
      || !skill.trim()
      || skill.trim().startsWith('-')
      || skill.length > 128
    ))
  )) {
    return undefined
  }

  return {
    source: request.source.trim(),
    repo: request.repo,
    force: request.force,
    skills: request.skills?.map(skill => skill.trim()),
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const installRequest = parseInstallRequest(await request.json() as unknown)
    if (!installRequest) {
      return NextResponse.json({ error: 'Invalid SkillsCat install request' }, { status: 400 })
    }

    const result = await installSkillFromSkillsCat(installRequest.source, {
      force: installRequest.force,
      repo: installRequest.repo,
      skill: installRequest.skills,
      yes: true,
    }, projectRoot)

    return NextResponse.json({
      success: true,
      library: result.library,
      sync: result.sync,
    })
  }
  catch (error) {
    console.error('[SkillsCat Install API] Installation failed:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'SkillsCat installation failed',
    }, { status: 500 })
  }
}
