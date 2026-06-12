'use client'

import type { ExternalProductConfig, ExternalProductDefinition } from '@start-claude/cli/src/products/types'
import type { ReactNode } from 'react'
import { ProductItem } from '@/components/products/product-item'

interface ProductListProps {
  product: ExternalProductDefinition
  configs: ExternalProductConfig[]
  onEdit: (config: ExternalProductConfig) => void
  onDelete: (name: string) => void
  onToggleEnabled: (name: string, enabled: boolean) => void
  onSetDefault: (name: string) => void
  onDuplicate: (config: ExternalProductConfig) => void
  dragDisabled?: boolean
}

export function ProductList({
  product,
  configs,
  onEdit,
  onDelete,
  onToggleEnabled,
  onSetDefault,
  onDuplicate,
  dragDisabled = false,
}: ProductListProps): ReactNode {
  return (
    <div className="space-y-3">
      {configs.map(config => (
        <ProductItem
          key={config.id || config.name}
          product={product}
          config={config}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleEnabled={onToggleEnabled}
          onSetDefault={onSetDefault}
          onDuplicate={onDuplicate}
          dragDisabled={dragDisabled}
        />
      ))}
    </div>
  )
}
