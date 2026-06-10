import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { availableTransformers } from '@start-claude/cli/src/transformers'

const transformerMetadata: Record<string, { label: string, description: string }> = {
  openai: {
    label: 'OpenAI Chat Completions',
    description: 'Use /v1/chat/completions compatible request and response conversion',
  },
  'openai-responses': {
    label: 'OpenAI Responses',
    description: 'Use /v1/responses compatible request and response conversion',
  },
  openrouter: {
    label: 'OpenRouter',
    description: 'Use OpenRouter chat completions compatible conversion',
  },
  gemini: {
    label: 'Gemini',
    description: 'Use Google Gemini generateContent conversion',
  },
}

function formatTransformerName(name: string): string {
  return name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const transformers = Object.keys(availableTransformers).map(name => ({
      value: name,
      label: transformerMetadata[name]?.label || formatTransformerName(name),
      description: transformerMetadata[name]?.description || `${formatTransformerName(name)} API format transformer`,
    }))

    const options = [
      {
        value: 'auto',
        label: 'Auto',
        description: 'Automatically detect transformer based on API endpoint domain',
      },
      ...transformers,
    ]

    return NextResponse.json({ transformers: options })
  }
  catch (error) {
    console.error('Error fetching transformers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transformers' },
      { status: 500 },
    )
  }
}
