'use client'

import type { ReactNode } from 'react'
import { FolderOpen, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface EmptyStateProps {
  type: 'no-configs' | 'no-search-results'
  onAddConfig?: () => void
  onClearSearch?: () => void
}

export function EmptyState({ type, onAddConfig, onClearSearch }: EmptyStateProps): ReactNode {
  if (type === 'no-search-results') {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center text-center py-16 px-6">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            No configurations found
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Try adjusting your search terms or clear the filter to see all configurations
          </p>
          <Button
            variant="outline"
            onClick={onClearSearch}
          >
            Clear Search
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <FolderOpen className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-xl font-bold mb-2">No Configurations Yet</h3>
        <p className="text-sm text-muted-foreground mb-8 max-w-md">
          Get started by creating your first Claude configuration. You can manage multiple configurations for different use cases.
        </p>
        <Button
          onClick={onAddConfig}
          size="lg"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Your First Configuration
        </Button>
      </CardContent>
    </Card>
  )
}
