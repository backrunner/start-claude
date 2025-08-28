'use client'

import type { ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
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
      <Card className="border-dashed border-2">
        <CardContent className="text-center py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted mx-auto mb-4">
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">
            No configurations found
          </h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search terms or clear the filter
          </p>
          <Button
            variant="outline"
            onClick={onClearSearch}
            className="mt-4"
          >
            Clear Search
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-dashed border-2">
      <CardContent className="text-center py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-6">
          <Plus className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">No Configurations Yet</h3>
        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
          Get started by creating your first Claude configuration to manage your AI assistant settings
        </p>
        <Button
          onClick={onAddConfig}
          size="lg"
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Your First Configuration
        </Button>
      </CardContent>
    </Card>
  )
}