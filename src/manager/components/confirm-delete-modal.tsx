'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
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
      <DialogContent className="max-w-md border-destructive/20">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold text-foreground">Delete Configuration</DialogTitle>
              <DialogDescription className="text-base mt-1">
                This action cannot be undone
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 dark:bg-destructive/10 p-4">
            <p className="text-sm text-foreground">
              Are you sure you want to delete the configuration
              {' '}
              <span className="font-semibold text-destructive">
                &quot;
                {configName}
                &quot;
              </span>
              ?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              All associated settings and data will be permanently removed.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-6 border-t">
          <Button variant="outline" onClick={onClose} className="min-w-[80px]">
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="min-w-[100px]">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
