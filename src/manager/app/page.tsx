import type { ReactNode } from 'react'
import process from 'node:process'
import HomePage from '@/components/pages/home-page'

// Force dynamic rendering to access environment variables
export const dynamic = 'force-dynamic'

export default function Page(): ReactNode {
  // Server-side check for VSCode environment
  const isVSCode = process.env.VSCODE_PLUGIN === 'true'

  return <HomePage isVSCode={isVSCode} />
}
