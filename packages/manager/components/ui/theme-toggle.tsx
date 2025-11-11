'use client'

import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/lib/theme'

export function ThemeToggle(): ReactNode {
  const { effectiveTheme, toggleTheme, mounted } = useTheme()

  // Avoid hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9"
        >
          {effectiveTheme === 'dark'
            ? (
                <Moon className="h-4 w-4" />
              )
            : (
                <Sun className="h-4 w-4" />
              )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{effectiveTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</p>
      </TooltipContent>
    </Tooltip>
  )
}
