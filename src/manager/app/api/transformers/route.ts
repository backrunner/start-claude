import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { availableTransformers } from '../../../../transformers'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // Get available transformer names and their display names
    const transformers = Object.keys(availableTransformers).map(name => ({
      value: name,
      label: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize first letter
      description: `${name.charAt(0).toUpperCase() + name.slice(1)} API format transformer`,
    }))

    // Add the special options
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
