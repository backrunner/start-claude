import { NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'ok', timestamp: Date.now() })
}