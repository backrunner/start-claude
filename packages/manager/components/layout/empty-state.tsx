'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { FolderOpen, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface EmptyStateProps {
  type: 'no-configs' | 'no-search-results'
  title?: string
  description?: string
  createButton?: string
  onAddConfig?: () => void
  onClearSearch?: () => void
}

export function EmptyState({ type, title, description, createButton, onAddConfig, onClearSearch }: EmptyStateProps): ReactNode {
  const tSearch = useTranslations('search')
  const tEmpty = useTranslations('emptyState')

  if (type === 'no-search-results') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center text-center py-12 px-6">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold mb-2">
            {tSearch('noResults')}
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {tSearch('noResultsDescription')}
          </p>
          <Button
            variant="outline"
            onClick={onClearSearch}
          >
            {tSearch('clearSearch')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center text-center py-12 px-6">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <FolderOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{title || tEmpty('title')}</h3>
        <p className="text-sm text-muted-foreground mb-8 max-w-md">
          {description || tEmpty('description')}
        </p>
        <Button
          onClick={onAddConfig}
        >
          <Plus className="w-4 h-4 mr-2" />
          {createButton || tEmpty('createButton')}
        </Button>
      </CardContent>
    </Card>
  )
}
