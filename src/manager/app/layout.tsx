import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Claude Configuration Manager',
  description: 'Manage your Claude configurations',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}): ReactNode {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
