'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ConfirmDeleteModalProps {
  open: boolean
  onClose: () => void
  configName: string | null
  onConfirm: () => void
}

export function ConfirmDeleteModal({ open, onClose, configName, onConfirm }: ConfirmDeleteModalProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Configuration</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the configuration "
            {configName}
            "? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
