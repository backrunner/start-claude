import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Toaster } from '@/components/ui/toaster'
import { Providers } from '@/components/providers'
import './globals.css'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return {
    title: 'Start Claude Manager',
  }
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}): Promise<ReactNode> {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Force dark mode for all users
                document.documentElement.classList.add('dark');
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
