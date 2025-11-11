'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Command, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface SearchBarProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  isVSCode: boolean
}

export function SearchBar({ searchTerm, onSearchChange, isVSCode }: SearchBarProps): ReactNode {
  const t = useTranslations('search')

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder={t('placeholder')}
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 h-10 border-input"
        />
      </div>
      {!isVSCode && (
        <Badge variant="secondary" className="text-xs font-normal hidden sm:flex">
          <Command className="h-3 w-3 mr-1.5" />
          {t('pressEsc')}
        </Badge>
      )}
    </div>
  )
}
