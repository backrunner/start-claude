'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ConfirmDeleteModalProps {
  open: boolean
  onClose: () => void
  configName: string | null
  onConfirm: () => Promise<void>
}

export function ConfirmDeleteModal({ open, onClose, configName, onConfirm }: ConfirmDeleteModalProps): ReactNode {
  const t = useTranslations('deleteModal')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (): Promise<void> => {
    setDeleting(true)
    try {
      await onConfirm()
      // Only close modal if the API call succeeds
      onClose()
    }
    catch (error) {
      console.error('Error deleting configuration:', error)
      // Don't close modal on error - let user see the error and retry
    }
    finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-destructive/20">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold text-foreground">{t('title')}</DialogTitle>
              <DialogDescription className="text-base mt-1">
                {t('description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 dark:bg-destructive/10 p-4">
            <p className="text-sm text-foreground">
              {t('confirmMessage', { configName: configName ?? '' })}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {t('additionalNote')}
            </p>
          </div>
        </div>

        <DialogFooter className="pt-6 border-t">
          <Button variant="outline" onClick={onClose} disabled={deleting} className="min-w-[80px]">
            {t('cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting} className="min-w-[100px]">
            {deleting
              ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t('deleting')}
                  </div>
                )
              : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('delete')}
                  </>
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
