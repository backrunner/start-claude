'use client'

import type { ReactNode } from 'react'
import { Command, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface SearchBarProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  isVSCode: boolean
}

export function SearchBar({ searchTerm, onSearchChange, isVSCode }: SearchBarProps): ReactNode {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3 h-3 sm:w-4 sm:h-4" />
        <Input
          placeholder="Search configurations..."
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-8 sm:pl-10 text-sm"
        />
      </div>
      {!isVSCode && (
        <Badge variant="outline" className="text-xs px-2 py-1 hidden sm:flex">
          <Command className="h-3 w-3 mr-1" />
          Press ESC to close manager
        </Badge>
      )}
    </div>
  )
}